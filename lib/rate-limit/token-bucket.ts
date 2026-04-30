/**
 * Token bucket rate limiter.
 * 
 * Tokens refill at a constant rate up to a maximum capacity.
 * Calling acquire() consumes one token; if none are available, it waits.
 * 
 * Allows bursts up to `capacity` followed by sustained throughput at `refillPerSecond`.
 * 
 * Example: capacity=60, refillPerSecond=1 means up to 60 requests
 * in a burst, then a steady 60/min thereafter.
 */
export class TokenBucket {
    private readonly capacity: number;
    private readonly refillPerSecond: number;
    private tokens: number;
    private lastRefillAt: number; //ms timestamp

    constructor(options: { capacity: number; refillPerSecond: number; initialTokens?: number }) {
        if (options.capacity <= 0) {
            throw new Error("capacity must be positive");
        }
        if (options.refillPerSecond <= 0) {
            throw new Error("refillPerSecond must be positive");
        }

        this.capacity = options.capacity;
        this.refillPerSecond = options.refillPerSecond;
        this.tokens = options.initialTokens ?? options.capacity;
        this.lastRefillAt = Date.now();
    }

    /**
     * Refills tokens based on elapsed time since the last refill.
     * Idempotent: calling multiple times in quick succession is fine.
     */
    private refill(): void {
        const now = Date.now();
        const elapsedSeconds = (now - this.lastRefillAt) / 1000;
        const tokensToAdd = elapsedSeconds * this.refillPerSecond;

        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefillAt = now;
    }

    /**
     * Returns the current number of available tokens (after a refill).
     * Useful for tests and observability.
     */
    available(): number {
        this.refill();
        return this.tokens;
    }

    /**
     * Acquires a token, waiting if necessary.
     * Returns when a token has been consumed and the caller can proceed.
     */
    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }

        // Calculate how long until we have a full token available
        const tokensNeeded = 1 - this.tokens;
        const msToWait = Math. ceil((tokensNeeded / this.refillPerSecond) * 1000);

        await sleep(msToWait);

        // After waiting, refill and try again. We use a loop in case of clock skew
        // or rounding edge cases that left us slightly under.
        return this.acquire();
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}