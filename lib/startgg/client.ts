import { TokenBucket } from "@/lib/rate-limit/token-bucket";

const STARTGG_API_URL = "https://api.start.gg/gql/alpha";

/**
 * Default rate limit configuration.
 * Empirically validated: start.gg blocks at ~75 req/min.
 * 60 req/min provides 25% safety margin.
 */
const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1;

/**
 * Configuration options for the StartGGClient.
 */
export interface StartGGClientOptions {
  /** Bearer token for the start.gg API. */
  token: string;
  /** Optional override for rate limit capacity (default: 60). */
  capacity?: number;
  /** Optional override for token refill rate per second (default: 1). */
  refillPerSecond?: number;
  /** Maximum retry attempts on 429 / 5xx errors (default 5) */
  maxRetries?: number;
  /** Base backoff in ms before doubling (default: 2000) */
  baseBackoffMs?: number;
  /** Maximum backoff cap in ms (default: 60000) */
  maxBackoffMs?: number;
}

/**
 * Parameters for a GraphQL query.
 */
export interface QueryParams {
  query: string;
  variables?: Record<string, unknown>;
}

/**
 * Successful GraphQL response shape.
 */
interface GraphQLSuccessResponse<T> {
  data: T;
  extensions?: {
    queryComplexity?: number;
    cacheControl?: unknown;
  };
}

/**
 * Failed GraphQL response shape (errors array present).
 */
interface GraphQLErrorResponse {
  errors: Array<{
    message: string;
    extensions?: { category?: string };
    locations?: Array<{ line: number; column: number }>;
  }>;
}

type GraphQLResponse<T> = GraphQLSuccessResponse<T> | GraphQLErrorResponse;

/**
 * Custom error types for clear handling at call sites.
 */
export class StartGGError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StartGGError";
  }
}

export class StartGGRateLimitError extends StartGGError {
  constructor() {
    super("Rate limit exceeded (HTTP 429) despite local rate limiter");
    this.name = "StartGGRateLimitError";
  }
}

export class StartGGAuthError extends StartGGError {
  constructor(message: string) {
    super(message);
    this.name = "StartGGAuthError";
  }
}

export class StartGGGraphQLError extends StartGGError {
  constructor(
    public readonly errors: Array<{ message: string }>,
  ) {
    super(`GraphQL errors: ${errors.map((e) => e.message).join(", ")}`);
    this.name = "StartGGGraphQLError";
  }
}

/**
 * Non-retryable client errors (4xx other than 429).
 * Examples: 400 Bad Request (malformed query), 404 Not Found.
 */
export class StartGGNonRetryableError extends StartGGError {}

/**
 * Client for the start.gg GraphQL API with built-in rate limiting.
 *
 * Internally maintains a token bucket that prevents requests from exceeding
 * the configured rate. Callers can issue queries without worrying about pacing.
 *
 * Errors are surfaced as typed exceptions:
 * - StartGGAuthError: bad token, 401
 * - StartGGRateLimitError: 429 (should not happen with default settings)
 * - StartGGGraphQLError: GraphQL-level errors in the response
 * - StartGGError: catch-all for network/server errors
 */
export class StartGGClient {
  private readonly token: string;
  private readonly bucket: TokenBucket;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(options: StartGGClientOptions) {
    if (!options.token) {
      throw new Error("StartGGClient requires a token");
    }
    this.token = options.token;
    this.bucket = new TokenBucket({
      capacity: options.capacity ?? DEFAULT_CAPACITY,
      refillPerSecond: options.refillPerSecond ?? DEFAULT_REFILL_PER_SECOND,
    });
    this.maxRetries = options.maxRetries ?? 5;
    this.baseBackoffMs = options.baseBackoffMs ?? 2000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
  }

  /**
   * Returns the number of tokens currently available in the rate limiter.
   * Useful for observability and tests.
   */
  availableTokens(): number {
    return this.bucket.available();
  }

  /**
   * Executes a GraphQL query against the start.gg API.
   * 
   * Retries on:
   * - HTTP 429 (rate limited)
   * - HTTP 5xx (server errors)
   * - Network errors
   * 
   * Does NOT include retry on:
   * - HTTP 401, 403 (auth)
   * - HTTP 4xx other than 429
   * - GraphQL-level errors
   * - Invalid JSON responses
   */
  async query<T>(params: QueryParams): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = computeBackoffMs(attempt - 1, this.baseBackoffMs, this.maxBackoffMs);
        await sleep(backoffMs);
      }

      await this.bucket.acquire();

      try {
        return await this.executeQuery<T>(params);
      } catch (err) {
        lastError = err;

        // Errors we should NOT retry: bail immediately
        if (
          err instanceof StartGGAuthError ||
          err instanceof StartGGGraphQLError ||
          err instanceof StartGGNonRetryableError
        ) {
          throw err;
        }

        // Otherwise: retry (rate limit, 5xx, network)
      }
    }

    // If the last error was already a typed StartGGError, propagate it directly
    // rather than wrapping in a generic one. The caller deserves to know
    // exactly what failed
    if (lastError instanceof StartGGError) {
      throw lastError;
    }

    throw new StartGGError(
      `Request failed after ${this.maxRetries + 1} attempts`,
    );
  }

  /**
   * Executes a single HTTP request without retry logic.
   * Used internally by query() inside the retry loop.
   */
  private async executeQuery<T>(params: QueryParams): Promise<T> {
    let response: Response;
    try {
      response = await fetch(STARTGG_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          query: params.query,
          variables: params.variables ?? {},
        }),
      });
    } catch (err) {
      throw new StartGGError("Network error contacting start.gg", err);
    }

    if (response.status === 401 || response.status === 403) {
      throw new StartGGAuthError(
        `start.gg rejected the token (HTTP ${response.status}). Token may be invalid or revoked`,
      );
    }

    if (response.status === 429) {
      throw new StartGGRateLimitError();
    }

    if (response.status >= 400 && response.status < 500) {
      const text = await response.text().catch(() => "<unreadable body>");
      throw new StartGGNonRetryableError(
        `start.gg returned HTTP ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "<unreadable body>");
      throw new StartGGError(
        `start.gg returned HTTP ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    let json: GraphQLResponse<T>;
    try {
      json = (await response.json()) as GraphQLResponse<T>;
    } catch (err) {
      throw new StartGGError("Failed to parse start.gg response as JSON", err);
    }

    if ("errors" in json) {
      throw new StartGGGraphQLError(json.errors);
    }

    return json.data;
  }
}

/**
 * Computes the wait time before the next retry attempt.
 * Uses exponential backoff with full jitter:
 *  wait = random(0, min(maxMs, baseMs * 2^attempt))
 * 
 * Full jitter: rather than bassMs * 2^attempt exactly, we pick a random
 * value in [0, that]. This spreads out concurrent retries and reduces
 * thundering herd effects.
 */
function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponential);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}