import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TokenBucket } from "./token-bucket";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("starts with full capacity by default", () => {
      const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1 });
      expect(bucket.available()).toBe(10);
    });

    it("respects initialTokens when provided", () => {
      const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1, initialTokens: 3 });
      expect(bucket.available()).toBe(3);
    });

    it("rejects non-positive capacity", () => {
      expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow();
      expect(() => new TokenBucket({ capacity: -1, refillPerSecond: 1 })).toThrow();
    });

    it("rejects non-positive refillPerSecond", () => {
      expect(() => new TokenBucket({ capacity: 10, refillPerSecond: 0 })).toThrow();
      expect(() => new TokenBucket({ capacity: 10, refillPerSecond: -1 })).toThrow();
    });
  });

  describe("acquire", () => {
    it("returns immediately when tokens are available", async () => {
      const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1 });
      await bucket.acquire();
      expect(bucket.available()).toBe(9);
    });

    it("consumes tokens one at a time", async () => {
      const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 1 });
      await bucket.acquire();
      await bucket.acquire();
      await bucket.acquire();
      expect(bucket.available()).toBe(2);
    });

    it("waits when no tokens are available", async () => {
      const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 1, initialTokens: 0 });

      const acquirePromise = bucket.acquire();

      // Advance time by 1 second; one token should now be available
      await vi.advanceTimersByTimeAsync(1000);

      await acquirePromise;
      expect(bucket.available()).toBeCloseTo(0, 1);
    });

    it("allows bursts up to capacity", async () => {
      const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 1 });

      // Should be able to acquire 5 tokens immediately without waiting
      const start = Date.now();
      await bucket.acquire();
      await bucket.acquire();
      await bucket.acquire();
      await bucket.acquire();
      await bucket.acquire();
      const elapsed = Date.now() - start;

      // Should have taken essentially no time (maybe a few ms for the test runner)
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("refill behavior", () => {
    it("refills tokens over time", async () => {
      const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 2, initialTokens: 0 });

      expect(bucket.available()).toBe(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(bucket.available()).toBeCloseTo(2, 1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(bucket.available()).toBeCloseTo(4, 1);
    });

    it("does not exceed capacity when refilling", async () => {
      const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 10, initialTokens: 0 });

      // After 10 seconds at 10 tps, we'd theoretically have 100 tokens
      // but capacity caps it at 5
      await vi.advanceTimersByTimeAsync(10_000);
      expect(bucket.available()).toBe(5);
    });

    it("refills fractionally", async () => {
      const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1, initialTokens: 0 });

      await vi.advanceTimersByTimeAsync(500);
      expect(bucket.available()).toBeCloseTo(0.5, 1);
    });
  });

  describe("realistic scenario: 60 req/min budget", () => {
    it("allows a burst of 60 then forces pacing", async () => {
      const bucket = new TokenBucket({ capacity: 60, refillPerSecond: 1 });

      // Burst: consume all 60 tokens
      for (let i = 0; i < 60; i++) {
        await bucket.acquire();
      }
      expect(bucket.available()).toBeLessThan(1);

      // 61st request should require waiting ~1 second for refill
      const acquirePromise = bucket.acquire();
      await vi.advanceTimersByTimeAsync(1000);
      await acquirePromise;
    });
  });
});