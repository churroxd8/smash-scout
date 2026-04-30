import { StartGGClient } from "./client";

export { StartGGClient } from "./client";
export {
    StartGGError,
    StartGGAuthError,
    StartGGRateLimitError,
    StartGGGraphQLError,
    StartGGNonRetryableError,
} from "./client";
export * from "./queries";

/**
 * Creates a StartGGClient using the admin/worker token from STARTGG_TOKEN.
 * Use this for ingestion jobs, seeds, and any non-user-specific operation.
 * 
 * Lazily memoized: the same client instance is reused across calls within
 * the same process, ensuring its rate limiter accumulates state correctly.
 */
let adminClient: StartGGClient | null = null;

export function getAdminClient(): StartGGClient {
    if (!adminClient) {
        if (!process.env.STARTGG_TOKEN) {
            throw new Error("STARTGG_TOKEN is not defined");
        }
        adminClient = new StartGGClient({ token: process.env.STARTGG_TOKEN });
    }
    return adminClient;
}

/**
 * Creates a StartGGClient for a specific user using their OAuth access token.
 * Use this when acting on behalf of a logged-in user (e.g., the OAuth callback).
 * 
 * Note: each call creates a new instance with its own rate limiter, since
 * different users have separate quotas.
 */
export function createUserClient(accessToken: string): StartGGClient {
    return new StartGGClient({ token: accessToken });
}