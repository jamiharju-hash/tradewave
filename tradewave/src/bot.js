'use strict';
const { Bot, InlineKeyboard } = require('grammy');
const { getSession, clearSession } = require('./session');
const {
  getAddress,
  getBalances,
  executeTrade,
  executeWithdraw,
} = require('./wallet');

// Simple ETH/EVM address validation (no need for full web3 import)
function isValidEvmAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function fmtBalances(balances) {
  return Object.entries(balances)
    .map(([a, v]) => `• *${a.toUpperCase()}:* ${parseFloat(v).toFixed(6)}`)
    .join('\n');
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function safeEdit(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
  } catch {
    await ctx.reply(text, { parse_mode: 'Markdown', ...extra });
  }
}

// ─── factory ──────────────────────────────────────────────────────────────────

function createBot() {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const address = await getAddress(userId);
      await ctx.reply(
        `🌊 *Welcome to TradeWave*\n_Ride Every Wave. Miss Nothing._\n\n` +
        `Your non-custodial wallet is ready:\n\`${address}\`\n\n` +
        `Use /help to see all commands.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[start]', e);
      await ctx.reply('⚠️ Error initialising wallet. Please try again in a moment.');
    }
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `🌊 *TradeWave — Commands*\n\n` +
      `/balance  — View your balances\n` +
      `/deposit  — Show deposit address\n` +
      `/buy      — Buy crypto with USDC\n` +
      `/sell     — Sell crypto for USDC\n` +
      `/withdraw — Send crypto to external wallet\n` +
      `/portfolio — Full portfolio overview\n`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /balance ──────────────────────────────────────────────────────────────
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

  // ── /deposit ──────────────────────────────────────────────────────────────
  bot.command('deposit', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const address = await getAddress(userId);
      await ctx.reply(
        `📥 *Deposit Address*\n\n\`${address}\`\n\n_Send ETH, USDC, or SOL to this address on the Base network._`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[deposit]', e);
      await ctx.reply('⚠️ Error fetching address.');
    }
  });

  // ── /portfolio ────────────────────────────────────────────────────────────
  bot.command('portfolio', async (ctx) => {
    const userId = ctx.from.id;
    const msg = await ctx.reply('⏳ Loading portfolio…');
    try {
      const [balances, address] = await Promise.all([
        getBalances(userId),
        getAddress(userId),
      ]);
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

  // ── /buy ──────────────────────────────────────────────────────────────────
  bot.command('buy', async (ctx) => {
    const session = getSession(ctx.from.id);
    session.step = 'buy:select_asset';
    const kb = new InlineKeyboard()
      .text('ETH', 'buy_asset:ETH')
      .text('SOL', 'buy_asset:SOL')
      .row()
      .text('❌ Cancel', 'cancel');
    await ctx.reply('📈 *Buy Crypto*\n\nChoose asset to buy (pays with USDC):', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // ── /sell ─────────────────────────────────────────────────────────────────
  bot.command('sell', async (ctx) => {
    const session = getSession(ctx.from.id);
    session.step = 'sell:select_asset';
    const kb = new InlineKeyboard()
      .text('ETH', 'sell_asset:ETH')
      .text('SOL', 'sell_asset:SOL')
      .row()
      .text('❌ Cancel', 'cancel');
    await ctx.reply('📉 *Sell Crypto*\n\nChoose asset to sell (receives USDC):', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // ── /withdraw ─────────────────────────────────────────────────────────────
  bot.command('withdraw', async (ctx) => {
    const session = getSession(ctx.from.id);
    session.step = 'withdraw:select_asset';
    const kb = new InlineKeyboard()
      .text('ETH', 'wd_asset:ETH')
      .text('USDC', 'wd_asset:USDC')
      .text('SOL', 'wd_asset:SOL')
      .row()
      .text('❌ Cancel', 'cancel');
    await ctx.reply('📤 *Withdraw*\n\nChoose asset to withdraw:', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // ── Callback queries ──────────────────────────────────────────────────────
  bot.on('callback_query:data', async (ctx) => {
    const userId = ctx.from.id;
    const data   = ctx.callbackQuery.data;
    const s      = getSession(userId);
    await ctx.answerCallbackQuery();

    // ── Cancel
    if (data === 'cancel') {
      clearSession(userId);
      await safeEdit(ctx, '❌ Cancelled.');
      return;
    }

    // ── BUY: asset selected
    if (data.startsWith('buy_asset:')) {
      const asset = data.split(':')[1];
      s.buyAsset = asset;
      s.step     = 'buy:enter_amount';
      await safeEdit(ctx, `📈 *Buy ${asset}*\n\nEnter USDC amount to spend (e.g. \`50\`):`);
      return;
    }

    // ── SELL: asset selected
    if (data.startsWith('sell_asset:')) {
      const asset = data.split(':')[1];
      s.sellAsset = asset;
      s.step      = 'sell:enter_amount';
      await safeEdit(ctx, `📉 *Sell ${asset}*\n\nEnter amount of ${asset} to sell (e.g. \`0.01\`):`);
      return;
    }

    // ── WITHDRAW: asset selected
    if (data.startsWith('wd_asset:')) {
      const asset = data.split(':')[1];
      s.withdrawAsset = asset;
      s.step          = 'withdraw:enter_address';
      await safeEdit(ctx, `📤 *Withdraw ${asset}*\n\nEnter destination wallet address:`);
      return;
    }

    // ── Confirm BUY
    if (data === 'confirm:buy') {
      await safeEdit(ctx, '⏳ Executing buy order…');
      try {
        const result = await executeTrade(userId, 'usdc', s.buyAsset, s.buyAmount);
        const asset  = s.buyAsset;
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Buy Executed!*\n\nSpent: ${s.buyAmount} USDC\nReceived: ${result.received} ${asset}\nTX: \`${result.txHash}\``
        );
      } catch (e) {
        console.error('[confirm:buy]', e);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Trade failed: ${e.message}`);
      }
      return;
    }

    // ── Confirm SELL
    if (data === 'confirm:sell') {
      await safeEdit(ctx, '⏳ Executing sell order…');
      try {
        const result = await executeTrade(userId, s.sellAsset, 'usdc', s.sellAmount);
        const asset  = s.sellAsset;
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Sell Executed!*\n\nSold: ${s.sellAmount} ${asset}\nReceived: ${result.received} USDC\nTX: \`${result.txHash}\``
        );
      } catch (e) {
        console.error('[confirm:sell]', e);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Trade failed: ${e.message}`);
      }
      return;
    }

    // ── Confirm WITHDRAW
    if (data === 'confirm:withdraw') {
      await safeEdit(ctx, '⏳ Processing withdrawal…');
      try {
        const result = await executeWithdraw(
          userId,
          s.withdrawAsset,
          s.withdrawAmount,
          s.withdrawAddress
        );
        const { withdrawAmount, withdrawAsset, withdrawAddress } = s;
        clearSession(userId);
        await safeEdit(
          ctx,
          `✅ *Withdrawal Sent!*\n\nAmount: ${withdrawAmount} ${withdrawAsset}\nTo: \`${withdrawAddress}\`\nTX: \`${result.txHash}\``
        );
      } catch (e) {
        console.error('[confirm:withdraw]', e);
        clearSession(userId);
        await safeEdit(ctx, `⚠️ Withdrawal failed: ${e.message}`);
      }
      return;
    }
  });

  // ── Text message handler (multi-step flows) ───────────────────────────────
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const s      = getSession(userId);
    const text   = ctx.message.text.trim();

    if (text.startsWith('/')) return; // ignore commands

    // BUY: enter amount
    if (s.step === 'buy:enter_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('⚠️ Invalid amount. Enter a positive number (e.g. `50`):', { parse_mode: 'Markdown' });
        return;
      }
      s.buyAmount = amount;
      s.step      = 'buy:confirm';
      const kb = new InlineKeyboard()
        .text('✅ Confirm', 'confirm:buy')
        .text('❌ Cancel', 'cancel');
      await ctx.reply(
        `📈 *Confirm Buy*\n\nSpend: *${amount} USDC*\nGet: *${s.buyAsset}*\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // SELL: enter amount
    if (s.step === 'sell:enter_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('⚠️ Invalid amount. Enter a positive number:', { parse_mode: 'Markdown' });
        return;
      }
      s.sellAmount = amount;
      s.step       = 'sell:confirm';
      const kb = new InlineKeyboard()
        .text('✅ Confirm', 'confirm:sell')
        .text('❌ Cancel', 'cancel');
      await ctx.reply(
        `📉 *Confirm Sell*\n\nSell: *${amount} ${s.sellAsset}*\nGet: *USDC*\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // WITHDRAW: enter address
    if (s.step === 'withdraw:enter_address') {
      if (!isValidEvmAddress(text)) {
        await ctx.reply('⚠️ Invalid address. Enter a valid `0x…` EVM address:',
          { parse_mode: 'Markdown' });
        return;
      }
      s.withdrawAddress = text;
      s.step            = 'withdraw:enter_amount';
      await ctx.reply(`Enter amount of *${s.withdrawAsset}* to send:`, { parse_mode: 'Markdown' });
      return;
    }

    // WITHDRAW: enter amount
    if (s.step === 'withdraw:enter_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('⚠️ Invalid amount:');
        return;
      }
      s.withdrawAmount = amount;
      s.step           = 'withdraw:confirm';
      const kb = new InlineKeyboard()
        .text('✅ Confirm', 'confirm:withdraw')
        .text('❌ Cancel', 'cancel');
      await ctx.reply(
        `📤 *Confirm Withdrawal*\n\nAmount: *${amount} ${s.withdrawAsset}*\nTo: \`${s.withdrawAddress}\`\n\nProceed?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }
  });

  bot.catch((err) => console.error('🔥 Bot error:', err));

  return bot;
}

module.exports = { createBot };
