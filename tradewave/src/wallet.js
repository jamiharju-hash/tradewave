'use strict';
const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');
const { encrypt, decrypt } = require('./encryption');
const { walletOps } = require('./db');

const NETWORK_ID = process.env.NETWORK_ID;
const SUPPORTED_ASSETS = Object.freeze(['eth', 'usdc']);
const walletLocks = new Map();

function initCoinbase() {
  const privateKey = (process.env.CDP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_NAME,
    privateKey,
  });
  console.log(`✅ Coinbase CDP configured (network: ${NETWORK_ID})`);
}

async function withUserLock(userId, fn) {
  const key = String(userId);
  const previous = walletLocks.get(key) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  walletLocks.set(key, previous.then(() => current));
  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (walletLocks.get(key) === current) {
      walletLocks.delete(key);
    }
  }
}

function assertSupportedAsset(asset) {
  const normalized = String(asset || '').toLowerCase();
  if (!SUPPORTED_ASSETS.includes(normalized)) {
    throw new Error(`Unsupported asset: ${asset}`);
  }
  return normalized;
}

async function getOrCreateWallet(userId) {
  return withUserLock(userId, async () => {
    const stored = walletOps.get(userId);
    if (stored) {
      const walletData = JSON.parse(decrypt(stored));
      return await Wallet.import(walletData);
    }

    const wallet = await Wallet.create({ networkId: NETWORK_ID });
    const exported = wallet.export();
    walletOps.set(userId, encrypt(JSON.stringify(exported)));
    return wallet;
  });
}

async function getAddress(userId) {
  const wallet = await getOrCreateWallet(userId);
  const addr = await wallet.getDefaultAddress();
  return addr.getId();
}

async function getBalances(userId) {
  const wallet = await getOrCreateWallet(userId);
  const balances = {};

  for (const asset of SUPPORTED_ASSETS) {
    try {
      const b = await wallet.getBalance(asset);
      balances[asset] = b ? b.toString() : '0';
    } catch (e) {
      console.error(`[balance:${asset}]`, e);
      balances[asset] = null;
    }
  }

  return balances;
}

async function assertSufficientBalance(userId, asset, amount) {
  const normalized = assertSupportedAsset(asset);
  const balances = await getBalances(userId);
  const raw = balances[normalized];

  if (raw === null) {
    throw new Error(`Could not verify ${normalized.toUpperCase()} balance`);
  }

  const available = Number(raw);
  const requested = Number(amount);

  if (!Number.isFinite(available) || !Number.isFinite(requested)) {
    throw new Error('Invalid balance or amount');
  }

  if (available < requested) {
    throw new Error(
      `Insufficient ${normalized.toUpperCase()} balance. Available: ${available}`
    );
  }
}

/**
 * Buy toAsset using fromAsset. amount = units of fromAsset to spend.
 */
async function executeTrade(userId, fromAsset, toAsset, amount) {
  const normalizedFrom = assertSupportedAsset(fromAsset);
  const normalizedTo = assertSupportedAsset(toAsset);

  await assertSufficientBalance(userId, normalizedFrom, amount);

  const wallet = await getOrCreateWallet(userId);
  const trade = await wallet.createTrade({
    amount: String(amount),
    fromAssetId: normalizedFrom,
    toAssetId: normalizedTo,
  });

  await trade.wait();

  const tx = trade.getTransaction?.();
  return {
    received: trade.getToAmount?.()?.toString?.() || null,
    txHash: tx?.getTransactionHash?.() || null,
  };
}

async function executeWithdraw(userId, asset, amount, destination) {
  const normalizedAsset = assertSupportedAsset(asset);

  await assertSufficientBalance(userId, normalizedAsset, amount);

  const wallet = await getOrCreateWallet(userId);
  const transfer = await wallet.createTransfer({
    amount: String(amount),
    assetId: normalizedAsset,
    destination,
  });

  await transfer.wait();

  return {
    txHash: transfer.getTransactionHash?.() || transfer.getTransaction?.()?.getTransactionHash?.() || null,
  };
}

module.exports = {
  NETWORK_ID,
  SUPPORTED_ASSETS,
  initCoinbase,
  getOrCreateWallet,
  getAddress,
  getBalances,
  assertSufficientBalance,
  executeTrade,
  executeWithdraw,
};
