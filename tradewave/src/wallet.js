'use strict';
const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');
const { encrypt, decrypt }  = require('./encryption');
const { walletOps }         = require('./db');

const NETWORK_ID = process.env.NETWORK_ID || 'base-mainnet';

function initCoinbase() {
  const privateKey = (process.env.CDP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  Coinbase.configure({
    apiKeyName:  process.env.CDP_API_KEY_NAME,
    privateKey,
  });
  console.log(`✅ Coinbase CDP configured (network: ${NETWORK_ID})`);
}

async function getOrCreateWallet(userId) {
  const stored = walletOps.get(userId);
  if (stored) {
    const walletData = JSON.parse(decrypt(stored));
    return await Wallet.import(walletData);
  }
  const wallet   = await Wallet.create({ networkId: NETWORK_ID });
  const exported = wallet.export();
  walletOps.set(userId, encrypt(JSON.stringify(exported)));
  return wallet;
}

async function getAddress(userId) {
  const wallet = await getOrCreateWallet(userId);
  const addr   = await wallet.getDefaultAddress();
  return addr.getId();
}

async function getBalances(userId) {
  const wallet = await getOrCreateWallet(userId);
  const assets = ['eth', 'usdc', 'sol'];
  const balances = {};
  for (const asset of assets) {
    try {
      const b = await wallet.getBalance(asset);
      balances[asset] = b ? b.toString() : '0';
    } catch {
      balances[asset] = '0';
    }
  }
  return balances;
}

/**
 * Buy toAsset using fromAsset (default: USDC → target).
 * amount = units of fromAsset to spend.
 */
async function executeTrade(userId, fromAsset, toAsset, amount) {
  const wallet = await getOrCreateWallet(userId);
  const trade  = await wallet.createTrade({
    amount:      parseFloat(amount),
    fromAssetId: fromAsset.toLowerCase(),
    toAssetId:   toAsset.toLowerCase(),
  });
  await trade.wait();
  return {
    received: trade.getToAmount().toString(),
    txHash:   trade.getTransaction().getTransactionHash(),
  };
}

async function executeWithdraw(userId, asset, amount, destination) {
  const wallet   = await getOrCreateWallet(userId);
  const transfer = await wallet.createTransfer({
    amount:      parseFloat(amount),
    assetId:     asset.toLowerCase(),
    destination,
  });
  await transfer.wait();
  return {
    txHash: transfer.getTransactionHash(),
  };
}

module.exports = {
  initCoinbase,
  getOrCreateWallet,
  getAddress,
  getBalances,
  executeTrade,
  executeWithdraw,
};
