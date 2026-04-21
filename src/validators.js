// Input Validation Functions

const ALLOWED_ASSETS = ['eth', 'usdc', 'sol'];
const AMOUNT_BOUNDS = { min: 0.01, max: 1000000 };

// Validate if the asset is allowed
function validateAsset(asset) {
    if (!ALLOWED_ASSETS.includes(asset)) {
        throw new Error(`Invalid asset: ${asset}. Allowed assets are: ${ALLOWED_ASSETS.join(', ')}`);
    }
    return true;
}

// Validate the amount using Decimal.js for precision
function validateAmount(amount) {
    const Decimal = require('decimal.js');
    const decimalAmount = new Decimal(amount);
    if (decimalAmount.lessThan(AMOUNT_BOUNDS.min) || decimalAmount.greaterThan(AMOUNT_BOUNDS.max)) {
        throw new Error(`Amount must be between ${AMOUNT_BOUNDS.min} and ${AMOUNT_BOUNDS.max}.`);
    }
    return true;
}

// Validate EVM wallet addresses (simple check for length and prefix)
function validateEvmAddress(address) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`Invalid EVM address: ${address}.`);
    }
    return true;
}

// Validate parameters for trading
function validateTrade(asset, amount, address) {
    validateAsset(asset);
    validateAmount(amount);
    validateEvmAddress(address);
    return true;
}

// Validate parameters for withdrawal
function validateWithdraw(asset, amount, address) {
    validateAsset(asset);
    validateAmount(amount);
    validateEvmAddress(address);
    return true;
}