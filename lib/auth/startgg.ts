import { StartGG } from "arctic";

if (!process.env.STARTGG_CLIENT_ID) {
    throw new Error("STARTGG_CLIENT_ID is not defined");
}
if (!process.env.STARTGG_CLIENT_SECRET) {
    throw new Error("STARTGG_CLIENT_SECRET is not defined");
}
if (!process.env.STARTGG_REDIRECT_URI) {
    throw new Error("STARTGG_REDIRECT_URI is not defined");
}

/**
 * Arctic client for start.gg OAuth 2.0.
 * Used by /api/auth/login (to generate authorization URL)
 * and by /api/auth/callback (to validate the code and get tokens).
 */
export const startgg = new StartGG(
    process.env.STARTGG_CLIENT_ID,
    process.env.STARTGG_CLIENT_SECRET,
    process.env.STARTGG_REDIRECT_URI,
);

/**
 * Scopes we request from start.gg.
 * - user.identity: get user id and basic profile (required)
 * - user.email: get user email (optional but useful for notifications)
 */
export const STARTGG_SCOPES = ["user.identity", "user.email"];