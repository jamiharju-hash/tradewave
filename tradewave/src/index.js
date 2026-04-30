'use strict';
require('dotenv').config();

const { initCoinbase } = require('./wallet');
const { createBot } = require('./bot');

const REQUIRED_ENV = [
  'NODE_ENV',
  'TELEGRAM_BOT_TOKEN',
  'CDP_API_KEY_NAME',
  'CDP_PRIVATE_KEY',
  'WALLET_ENCRYPTION_KEY',
  'NETWORK_ID',
];

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing environment variables:\n  ${missing.join('\n  ')}`);
    console.error('\nCopy .env.example → .env and fill in all values.');
    process.exit(1);
  }

  if (!/^[a-f0-9]{64}$/i.test(process.env.WALLET_ENCRYPTION_KEY || '')) {
    console.error('❌ WALLET_ENCRYPTION_KEY must be a 64-char hex string.');
    process.exit(1);
  }

  const network = process.env.NETWORK_ID;
  if (process.env.NODE_ENV !== 'production' && /mainnet/i.test(network)) {
    console.error('❌ Refusing to run a mainnet network outside NODE_ENV=production.');
    process.exit(1);
  }
}

async function main() {
  checkEnv();

  console.log('🌊 TradeWave starting…');
  initCoinbase();

  const bot = createBot();

  bot.start({
    onStart: (info) =>
      console.log(`🌊 TradeWave live as @${info.username} (network: ${process.env.NETWORK_ID})`),
  });

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
