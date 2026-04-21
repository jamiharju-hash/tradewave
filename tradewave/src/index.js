'use strict';
require('dotenv').config();

const { initCoinbase } = require('./wallet');
const { createBot }   = require('./bot');

const REQUIRED_ENV = [
  'TELEGRAM_BOT_TOKEN',
  'CDP_API_KEY_NAME',
  'CDP_PRIVATE_KEY',
  'WALLET_ENCRYPTION_KEY',
];

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing environment variables:\n  ${missing.join('\n  ')}`);
    console.error('\nCopy .env.example → .env and fill in all values.');
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
      console.log(`🌊 TradeWave live as @${info.username} (network: ${process.env.NETWORK_ID || 'base-mainnet'})`),
  });

  // Graceful shutdown
  process.once('SIGINT',  () => bot.stop());
  process.once('SIGTERM', () => bot.stop());
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
