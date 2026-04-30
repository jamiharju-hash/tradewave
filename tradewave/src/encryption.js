'use strict';
const crypto = require('crypto');

let KEY_BUF;

function init() {
  const hex = process.env.WALLET_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(hex || '')) {
    throw new Error(
      'WALLET_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).\n' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  KEY_BUF = Buffer.from(hex, 'hex');
}

function encrypt(text) {
  if (!KEY_BUF) init();

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUF, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  if (!KEY_BUF) init();

  const parts = String(payload || '').split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, tagHex, encHex] = parts;
  if (
    !/^[a-f0-9]{32}$/i.test(ivHex) ||
    !/^[a-f0-9]{32}$/i.test(tagHex) ||
    !/^[a-f0-9]+$/i.test(encHex)
  ) {
    throw new Error('Invalid encrypted payload encoding');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY_BUF,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { encrypt, decrypt };
