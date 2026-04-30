'use strict';
const Decimal = require('decimal.js');
const { Bot, InlineKeyboard } = require('grammy');
const { getSession, resetSession, clearSession, assertStep, assertFlow } = require('./session');
const { tradeOps, withdrawalOps } = require('./db');
const {
  getAddress,
  getBalances,
  executeTrade,
  executeWithdraw,
  SUPPORTED_ASSETS,
} = require('./wallet');

const ASSET_LABELS = SUPPORTED_ASSETS.map((a) => a.toUpperCase());
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateBuckets = new Map();

function isValidEvmAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || '').trim());
}

function isSupportedAsset(asset) {
  return ASSET_LABELS.includes(String(asset || '').toUpperCase());
}

function normalizeAsset(asset) {
  const normalized = String(asset || '').toUpperCase();
  if (!isSupportedAsset(normalized)) throw new Error(`Unsupported asset: ${asset}`);
  return normalized;
}

function parseStrictAmount(input, maxDecimals = 18) {
  const text = String(input || '').trim();

  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) return null;

  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  if (decimals > maxDecimals) return null;

  const amount = new Decimal(text);
  if (!amount.isFinite() || amount.lte(0)) return null;

  return amount.toFixed();
}

function amountDecimalsFor(asset) {
  return String(asset).toUpperCase() === 'USDC' ? 6 : 18;
}

function fmtAmount(value) {
  if (value === null || value === undefined) return 'unavailable';

  try {
    const d = new Decimal(String(value));
    if (!d.isFinite()) return String(value);
    return d.toDecimalPlaces(8).toString();
  } catch {
    return String(value);
  }
}

function fmtBalances(balances) {
  return Object.entries(balances)
    .map(([asset, value]) => `• *${asset.toUpperCase()}:* ${fmtAmount(value)}`)
    .join('\n');
}

function escapeMarkdown(text) {
  return String(text || '')
    .replace(/[_*`\[]/g, '\\$&')
    .slice(0, 500);
}

function cleanError(error) {
  return escapeMarkdown(error?.message || error || 'Unknown error');
}

function checkRateLimit(userId) {
  const key = String(userId);
  const now = Date.now();
  const current = rateBuckets.get(key) || [];
  const recent = current.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, recent);
    return false;
  }

  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

async function safeEdit(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
  } catch {
    await ctx.reply(text, { parse_mode: 'Markdown', ...extra });
  }
}

function assetKeyboard(prefix, assets = ASSET_LABELS) {
  const kb = new InlineKeyboard();
  assets.forEach((asset, index) => {
    kb.text(asset, `${prefix}:${asset}`);
    if ((index + 1) % 2 === 0) kb.row();
  });
  kb.row().text('❌ Cancel', 'cancel');
  return kb;
}

function confirmKeyboard(kind, operationId) {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${kind}:${operationId}`)
    .text('❌ Cancel', 'cancel');
}

function createBot() {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') {
      await ctx.reply('This bot only works in private chat.');
      return;
    }

    if (ctx.from?.id && !checkRateLimit(ctx.from.id)) {
      await ctx.reply('⚠️ Rate limit exceeded. Try again shortly.');
      return;
    }

    return next();
  });

  bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const address = await getAddress(userId);
      await ctx.reply(
        `🌊 *Welcome to TradeWave*\n_Ride Every Wave. Miss Nothing._\n\n` +
        `Your TradeWave wallet is ready:\n\`${address}\`\n\n` +
        `Use /help to see all commands.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[start]', e);
      await ctx.reply('⚠️ Error initialising wallet. Please try again in a moment.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `🌊 *TradeWave — Commands*\n\n` +
      `/balance  — View your balances\n` +
      `/deposit  — Show Base deposit address\n` +
      `/buy      — Buy crypto with USDC\n` +
      `/sell     — Sell crypto for USDC\n` +
      `/withdraw — Send crypto to external EVM wallet\n` +
      `/portfolio — Full portfolio overview\n`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('balance', async (ctx) => {
    const userId = ctx.from.id;
    const msg = await ctx.reply('⏳ Fetching balances…');
    try {
      const balances = await getBalances(userId);
      await ctx.api.editMessageText(
        ctx.chat.id,
        msg.message_id,
        `💰 *Your Balances*\n\n${fmtBalances(balances)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[balance]', e);
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '⚠️ Error fetching balances.');
    }
  });

  bot.command('deposit', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const address = await getAddress(userId);
      await ctx.reply(
        `📥 *Deposit Address*\n\n\`${address}\`\n\n` +
        `_Send only supported Base assets to this address: ${ASSET_LABELS.join(', ')}._`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[deposit]', e);
      await ctx.reply('⚠️ Error fetching address.');
    }
  });

  bot.command('portfolio', async (ctx) => {
    const userId = ctx.from.id;
    const msg = await ctx.reply('⏳ Loading portfolio…');
    try {
      const address = await getAddress(userId);
      const balances = await getBalances(userId);
      await ctx.api.editMessageText(
        ctx.chat.id,
        msg.message_id,
        `📊 *Portfolio Overview*\n\n${fmtBalances(balances)}\n\n📍 *Address:*\n\`${address}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[portfolio]', e);
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '⚠️ Error loading portfolio.');
    }
  });

  bot.command('buy', async (ctx) => {
    const session = resetSession(ctx.from.id, { step: 'buy:select_asset' });
    await ctx.reply('📈 *Buy Crypto*\n\nChoose asset to buy with USDC:', {
      parse_mode: 'Markdown',
      reply_markup: assetKeyboard('buy_asset', ASSET_LABELS.filter((asset) => asset !== 'USDC')),
    });
    session.step = 'buy:select_asset';
  });

  bot.command('sell', async (ctx) => {
    const session = resetSession(ctx.from.id, { step: 'sell:select_asset' });
    await ctx.reply('📉 *Sell Crypto*\n\nChoose asset to sell for USDC:', {
      parse_mode: 'Markdown',
      reply_markup: assetKeyboard('sell_asset', ASSET_LABELS.filter((asset) => asset !== 'USDC')),
    });
    session.step = 'sell:select_asset';
  });

  bot.command('withdraw', async (ctx) => {
    const session = resetSession(ctx.from.id, { step: 'withdraw:select_asset' });
    await ctx.reply('📤 *Withdraw*\n\nChoose asset to withdraw:', {
      parse_mode: 'Markdown',
      reply_markup: assetKeyboard('wd_asset'),
    });
    session.step = 'withdraw:select_asset';
  });

  bot.on('callback_query:data', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const s = getSession(userId);
    await ctx.answerCallbackQuery();

    if (data === 'cancel') {
      clearSession(userId);
      await safeEdit(ctx, '❌ Cancelled.');
      return;
    }

    if (data.startsWith('buy_asset:')) {
      if (!assertStep(s, 'buy:select_asset')) {
        await safeEdit(ctx, '⚠️ This session expired. Start again with /buy.');
        return;
      }
      const asset = normalizeAsset(data.split(':')[1]);
      if (asset === 'USDC') {
        await safeEdit(ctx, '⚠️ Cannot buy USDC with USDC.');
        return;
      }
      s.buyAsset = asset;
      s.step = 'buy:enter_amount';
      await safeEdit(ctx, `📈 *Buy ${asset}*\n\nEnter USDC amount to spend (e.g. \`50\`):`);
      return;
    }

    if (data.startsWith('sell_asset:')) {
      if (!assertStep(s, 'sell:select_asset')) {
        await safeEdit(ctx, '⚠️ This session expired. Start again with /sell.');
        return;
      }
      const asset = normalizeAsset(data.split(':')[1]);
      if (asset === 'USDC') {
        await safeEdit(ctx, '⚠️ Cannot sell USDC for USDC.');
        return;
      }
      s.sellAsset = asset;
      s.step = 'sell:enter_amount';
      await safeEdit(ctx, `📉 *Sell ${asset}*\n\nEnter amount of ${asset} to sell (e.g. \`0.01\`):`);
      return;
    }

    if (data.startsWith('wd_asset:')) {
      if (!assertStep(s, 'withdraw:select_asset')) {
        await safeEdit(ctx, '⚠️ This session expired. Start again with /withdraw.');
        return;
      }
      const asset = normalizeAsset(data.split(':')[1]);
      s.withdrawAsset = asset;
      s.step = 'withdraw:enter_address';
      await safeEdit(ctx, `📤 *Withdraw ${asset}*\n\nEnter destination EVM wallet address:`);
      return;
    }

    if (data.startsWith('confirm:buy:')) {
      const operationId = data.split(':')[2];
      if (!assertStep(s, 'buy:confirm') || !assertFlow(s, s.flowId) || s.tradeOrderId !== operationId) {
        clearSession(userId);
        await safeEdit(ctx, '⚠️ This order expired or is invalid. Start again with /buy.');
        return;
      }
      if (s.executing || !tradeOps.start(operationId, userId)) {
        await safeEdit(ctx, '⚠️ This order is already processing or no longer pending.');
        return;
      }
      s.executing = true;
      await safeEdit(ctx, '⏳ Executing buy order…');
      try {
        const order = tradeOps.get(operationId);
        const result = await executeTrade(userId, order.from_asset, order.to_asset, order.amount);
        tradeOps.complete(operationId, result);
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Buy Executed!*\n\nSpent: ${order.amount} ${order.from_asset.toUpperCase()}\n` +
          `Received: ${fmtAmount(result.received)} ${order.to_asset.toUpperCase()}\nTX: \`${result.txHash || 'pending'}\``
        );
      } catch (e) {
        console.error('[confirm:buy]', e);
        tradeOps.fail(operationId, e.message);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Trade failed: ${cleanError(e)}`);
      }
      return;
    }

    if (data.startsWith('confirm:sell:')) {
      const operationId = data.split(':')[2];
      if (!assertStep(s, 'sell:confirm') || s.tradeOrderId !== operationId) {
        clearSession(userId);
        await safeEdit(ctx, '⚠️ This order expired or is invalid. Start again with /sell.');
        return;
      }
      if (s.executing || !tradeOps.start(operationId, userId)) {
        await safeEdit(ctx, '⚠️ This order is already processing or no longer pending.');
        return;
      }
      s.executing = true;
      await safeEdit(ctx, '⏳ Executing sell order…');
      try {
        const order = tradeOps.get(operationId);
        const result = await executeTrade(userId, order.from_asset, order.to_asset, order.amount);
        tradeOps.complete(operationId, result);
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Sell Executed!*\n\nSold: ${order.amount} ${order.from_asset.toUpperCase()}\n` +
          `Received: ${fmtAmount(result.received)} ${order.to_asset.toUpperCase()}\nTX: \`${result.txHash || 'pending'}\``
        );
      } catch (e) {
        console.error('[confirm:sell]', e);
        tradeOps.fail(operationId, e.message);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Trade failed: ${cleanError(e)}`);
      }
      return;
    }

    if (data.startsWith('confirm:withdraw:')) {
      const operationId = data.split(':')[2];
      if (!assertStep(s, 'withdraw:confirm') || s.withdrawalId !== operationId) {
        clearSession(userId);
        await safeEdit(ctx, '⚠️ This withdrawal expired or is invalid. Start again with /withdraw.');
        return;
      }
      if (s.executing || !withdrawalOps.start(operationId, userId)) {
        await safeEdit(ctx, '⚠️ This withdrawal is already processing or no longer pending.');
        return;
      }
      s.executing = true;
      await safeEdit(ctx, '⏳ Processing withdrawal…');
      try {
        const withdrawal = withdrawalOps.get(operationId);
        const result = await executeWithdraw(
          userId,
          withdrawal.asset,
          withdrawal.amount,
          withdrawal.destination
        );
        withdrawalOps.complete(operationId, result);
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Withdrawal Sent!*\n\nAmount: ${withdrawal.amount} ${withdrawal.asset.toUpperCase()}\n` +
          `To: \`${withdrawal.destination}\`\nTX: \`${result.txHash || 'pending'}\``
        );
      } catch (e) {
        console.error('[confirm:withdraw]', e);
        withdrawalOps.fail(operationId, e.message);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Withdrawal failed: ${cleanError(e)}`);
      }
    }
  });

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const s = getSession(userId);
    const text = ctx.message.text.trim();

    if (text.startsWith('/')) return;

    if (s.step === 'buy:enter_amount') {
      const amount = parseStrictAmount(text, amountDecimalsFor('USDC'));
      if (amount === null) {
        await ctx.reply('⚠️ Invalid amount. Enter a positive USDC amount with max 6 decimals.', { parse_mode: 'Markdown' });
        return;
      }
      const operationId = tradeOps.create({
        userId,
        fromAsset: 'usdc',
        toAsset: s.buyAsset.toLowerCase(),
        amount,
      });
      s.buyAmount = amount;
      s.tradeOrderId = operationId;
      s.step = 'buy:confirm';
      await ctx.reply(
        `📈 *Confirm Buy*\n\nSpend: *${amount} USDC*\nGet: *${s.buyAsset}*\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: confirmKeyboard('buy', operationId) }
      );
      return;
    }

    if (s.step === 'sell:enter_amount') {
      const amount = parseStrictAmount(text, amountDecimalsFor(s.sellAsset));
      if (amount === null) {
        await ctx.reply('⚠️ Invalid amount. Enter a positive number.', { parse_mode: 'Markdown' });
        return;
      }
      const operationId = tradeOps.create({
        userId,
        fromAsset: s.sellAsset.toLowerCase(),
        toAsset: 'usdc',
        amount,
      });
      s.sellAmount = amount;
      s.tradeOrderId = operationId;
      s.step = 'sell:confirm';
      await ctx.reply(
        `📉 *Confirm Sell*\n\nSell: *${amount} ${s.sellAsset}*\nGet: *USDC*\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: confirmKeyboard('sell', operationId) }
      );
      return;
    }

    if (s.step === 'withdraw:enter_address') {
      if (!isValidEvmAddress(text)) {
        await ctx.reply('⚠️ Invalid address. Enter a valid `0x…` EVM address:', { parse_mode: 'Markdown' });
        return;
      }
      s.withdrawAddress = text;
      s.step = 'withdraw:enter_amount';
      await ctx.reply(`Enter amount of *${s.withdrawAsset}* to send:`, { parse_mode: 'Markdown' });
      return;
    }

    if (s.step === 'withdraw:enter_amount') {
      const amount = parseStrictAmount(text, amountDecimalsFor(s.withdrawAsset));
      if (amount === null) {
        await ctx.reply('⚠️ Invalid amount. Enter a positive amount.');
        return;
      }
      const operationId = withdrawalOps.create({
        userId,
        asset: s.withdrawAsset.toLowerCase(),
        amount,
        destination: s.withdrawAddress,
      });
      s.withdrawAmount = amount;
      s.withdrawalId = operationId;
      s.step = 'withdraw:confirm';
      await ctx.reply(
        `📤 *Confirm Withdrawal*\n\nAmount: *${amount} ${s.withdrawAsset}*\nTo: \`${s.withdrawAddress}\`\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: confirmKeyboard('withdraw', operationId) }
      );
    }
  });

  bot.catch((err) => console.error('🔥 Bot error:', err));

  return bot;
}

module.exports = { createBot };
