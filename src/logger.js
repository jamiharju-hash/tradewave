const winston = require('winston');

// Function to sanitize sensitive data
const sanitizeData = (data) => {
    const sensitiveKeys = ['seed', 'privateKey', 'secret', 'password', 'token', 'encryptedSeed', 'walletSeed'];
    return Object.keys(data).reduce((acc, key) => {
        acc[key] = sensitiveKeys.includes(key) ? '[REDACTED]' : data[key];
        return acc;
    }, {});
};

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Log methods
logger.error = (message, data) => logger.log('error', { message, data: sanitizeData(data) });
logger.warn = (message, data) => logger.log('warn', { message, data: sanitizeData(data) });
logger.info = (message, data) => logger.log('info', { message, data: sanitizeData(data) });
logger.debug = (message, data) => logger.log('debug', { message, data: sanitizeData(data) });

module.exports = logger;