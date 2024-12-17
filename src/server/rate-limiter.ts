/**
 * Rate limiter for request throttling
 */
export class RateLimiter {
    private requests: number[] = [];
    private readonly windowMs = 60000; // 1 minute window

    constructor(private readonly maxRequests: number) {}

    /**
     * Checks if request is within rate limit
     * @throws Error if rate limit exceeded
     */
    async checkLimit(): Promise<void> {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);

        if (this.requests.length >= this.maxRequests) {
            throw new Error('Rate limit exceeded');
        }

        this.requests.push(now);
    }

    /**
     * Gets current rate limiter status
     */
    getStatus(): { current: number; limit: number; windowMs: number } {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);

        return {
            current: this.requests.length,
            limit: this.maxRequests,
            windowMs: this.windowMs
        };
    }

    /**
     * Resets rate limiter
     */
    reset(): void {
        this.requests = [];
    }
}
