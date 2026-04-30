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

  constructor(options: StartGGClientOptions) {
    if (!options.token) {
      throw new Error("StartGGClient requires a token");
    }
    this.token = options.token;
    this.bucket = new TokenBucket({
      capacity: options.capacity ?? DEFAULT_CAPACITY,
      refillPerSecond: options.refillPerSecond ?? DEFAULT_REFILL_PER_SECOND,
    });
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
   * Acquires a rate-limit token before sending the request, waiting if necessary.
   */
  async query<T>(params: QueryParams): Promise<T> {
    await this.bucket.acquire();

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
        `start.gg rejected the token (HTTP ${response.status}). Token may be invalid or revoked.`,
      );
    }

    if (response.status === 429) {
      throw new StartGGRateLimitError();
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