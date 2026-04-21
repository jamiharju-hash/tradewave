// src/encryption.js

// Initialize KEY_BUF at module load time instead of lazy initialization.
// The new implementation calls init() once when the module loads to ensure thread-safe encryption key initialization.

let KEY_BUF;

function init() {
    if (!KEY_BUF) {
        // Initialize KEY_BUF here
        KEY_BUF = {}; // replace with actual initialization logic
    }
}

// Call init once when the module loads
init();

module.exports = { KEY_BUF, init };