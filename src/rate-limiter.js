class RateLimiter {
    constructor(maxRequests = 5, windowMs = 60000) {
        this.maxRequests = maxRequests;  // maximum requests per time window
        this.windowMs = windowMs;        // time window in milliseconds
        this.users = new Map();          // store user request data
    }

    isAllowed(userId) {
        const now = Date.now();
        const userData = this.users.get(userId) || { requests: 0, firstRequestTime: now };

        // Reset the user data if the time window has passed
        if (now - userData.firstRequestTime > this.windowMs) {
            userData.requests = 0;
            userData.firstRequestTime = now;
        }

        if (userData.requests < this.maxRequests) {
            userData.requests++;
            this.users.set(userId, userData);
            return true; // Request is allowed
        }

        return false; // Request is denied
    }

    getRemainingRequests(userId) {
        const userData = this.users.get(userId);
        if (!userData) return this.maxRequests; // No requests made yet
        return this.maxRequests - userData.requests;
    }

    getResetTime(userId) {
        const userData = this.users.get(userId);
        if (!userData) return 0; // No requests made yet
        const now = Date.now();
        const resetTime = userData.firstRequestTime + this.windowMs;
        return Math.max(0, resetTime - now); // Time until reset
    }

    reset(userId) {
        if (this.users.has(userId)) {
            this.users.delete(userId); // Remove user data
        }
    }
}

export default RateLimiter;