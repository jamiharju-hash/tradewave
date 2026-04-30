'use strict';

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

function requireEnvAny(names) {
  const value = firstEnv(names);
  if (!value) {
    throw new Error(`Missing environment variable. Set one of: ${names.join(', ')}`);
  }
  return value;
}

function getCoinbaseApiKeyName() {
  // @coinbase/coinbase-sdk expects the full CDP API key resource name.
  // Prefer ORGANIZATION_KEY when using GitHub/hosting secrets named from the CDP portal.
  return requireEnvAny(['CDP_API_KEY_NAME', 'ORGANIZATION_KEY', 'COINBASE_API_KEY_NAME']);
}

function getCoinbasePrivateKey() {
  return requireEnvAny(['CDP_PRIVATE_KEY', 'COINBASE_PRIVATE_KEY']).replace(/\\n/g, '\n');
}

function getNetworkId() {
  return requireEnvAny(['NETWORK_ID']);
}

function getProjectId() {
  return firstEnv(['PROJECT_ID', 'COINBASE_PROJECT_ID']);
}

function getRequiredEnvGroups() {
  return [
    ['NODE_ENV'],
    ['TELEGRAM_BOT_TOKEN'],
    ['NETWORK_ID'],
    ['WALLET_ENCRYPTION_KEY'],
    ['CDP_API_KEY_NAME', 'ORGANIZATION_KEY', 'COINBASE_API_KEY_NAME'],
    ['CDP_PRIVATE_KEY', 'COINBASE_PRIVATE_KEY'],
  ];
}

module.exports = {
  firstEnv,
  requireEnvAny,
  getCoinbaseApiKeyName,
  getCoinbasePrivateKey,
  getNetworkId,
  getProjectId,
  getRequiredEnvGroups,
};
