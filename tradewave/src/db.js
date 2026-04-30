'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tradewave.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    user_id        TEXT    PRIMARY KEY,
    encrypted_seed TEXT    NOT NULL,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trade_orders (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    from_asset  TEXT    NOT NULL,
    to_asset    TEXT    NOT NULL,
    amount      TEXT    NOT NULL,
    status      TEXT    NOT NULL,
    received    TEXT,
    tx_hash     TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    asset       TEXT    NOT NULL,
    amount      TEXT    NOT NULL,
    destination TEXT    NOT NULL,
    status      TEXT    NOT NULL,
    tx_hash     TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dca_configs (
    user_id        TEXT    PRIMARY KEY,
    asset          TEXT    NOT NULL,
    amount_usdc    REAL    NOT NULL,
    interval_hours INTEGER NOT NULL,
    next_run       INTEGER NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1
  );
`);

const walletOps = {
  get(userId) {
    const row = db
      .prepare('SELECT encrypted_seed FROM wallets WHERE user_id = ?')
      .get(String(userId));
    return row ? row.encrypted_seed : null;
  },
  set(userId, encryptedSeed) {
    db.prepare(
      'INSERT OR REPLACE INTO wallets (user_id, encrypted_seed, created_at) VALUES (?, ?, ?)'
    ).run(String(userId), encryptedSeed, Date.now());
  },
  has(userId) {
    return !!db.prepare('SELECT 1 FROM wallets WHERE user_id = ?').get(String(userId));
  },
};

function createOperationId() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

const tradeOps = {
  create({ userId, fromAsset, toAsset, amount }) {
    const id = createOperationId();
    const ts = now();
    db.prepare(`
      INSERT INTO trade_orders
        (id, user_id, from_asset, to_asset, amount, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, String(userId), fromAsset, toAsset, String(amount), ts, ts);
    return id;
  },
  get(id) {
    return db.prepare('SELECT * FROM trade_orders WHERE id = ?').get(String(id));
  },
  start(id, userId) {
    const result = db.prepare(`
      UPDATE trade_orders
      SET status = 'processing', updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(now(), String(id), String(userId));
    return result.changes === 1;
  },
  complete(id, { received, txHash }) {
    db.prepare(`
      UPDATE trade_orders
      SET status = 'completed', received = ?, tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(received == null ? null : String(received), txHash || null, now(), String(id));
  },
  fail(id, error) {
    db.prepare(`
      UPDATE trade_orders
      SET status = 'failed', error = ?, updated_at = ?
      WHERE id = ?
    `).run(String(error || 'Unknown error').slice(0, 1000), now(), String(id));
  },
};

const withdrawalOps = {
  create({ userId, asset, amount, destination }) {
    const id = createOperationId();
    const ts = now();
    db.prepare(`
      INSERT INTO withdrawals
        (id, user_id, asset, amount, destination, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, String(userId), asset, String(amount), destination, ts, ts);
    return id;
  },
  get(id) {
    return db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(String(id));
  },
  start(id, userId) {
    const result = db.prepare(`
      UPDATE withdrawals
      SET status = 'processing', updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(now(), String(id), String(userId));
    return result.changes === 1;
  },
  complete(id, { txHash }) {
    db.prepare(`
      UPDATE withdrawals
      SET status = 'completed', tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash || null, now(), String(id));
  },
  fail(id, error) {
    db.prepare(`
      UPDATE withdrawals
      SET status = 'failed', error = ?, updated_at = ?
      WHERE id = ?
    `).run(String(error || 'Unknown error').slice(0, 1000), now(), String(id));
  },
};

module.exports = { db, walletOps, tradeOps, withdrawalOps };
