'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.DATA_DIR || './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tradewave.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    user_id      TEXT    PRIMARY KEY,
    encrypted_seed TEXT  NOT NULL,
    created_at   INTEGER NOT NULL
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

module.exports = { db, walletOps };
