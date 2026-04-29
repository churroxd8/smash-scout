import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { startgg } from "./startgg";
import { encrypt, decrypt } from "./encryption";

/**
 * Threshold (in milliseconds) before token expiry at which we proactively refresh.
 * 24 hours: gives us a full day of buffer if refresh temporarily fails.
 */
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Returns a valid access token for the given user, refreshing it if necessary.
 *
 * Behavior:
 * - If the current token is far from expiry (>24h), returns it as-is.
 * - If close to expiry, refreshes the token, persists the new tokens, and returns the new one.
 * - If refresh fails, throws a TokenRefreshError. Callers should treat this as
 *   "session is no longer usable; invalidate and force re-login".
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new TokenRefreshError("User not found");
  }

  if (!user.startggAccessToken || !user.startggRefreshToken || !user.tokenExpiresAt) {
    throw new TokenRefreshError("User is missing OAuth credentials");
  }

  const now = Date.now();
  const expiresAt = user.tokenExpiresAt.getTime();
  const timeUntilExpiry = expiresAt - now;

  // Token is still fresh, no need to refresh
  if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
    return decrypt(user.startggAccessToken);
  }

  // Token is close to expiry or expired; refresh it
  return refreshUserTokens(user.id, decrypt(user.startggRefreshToken));
}

/**
 * Refreshes the user's tokens by calling start.gg with the refresh token.
 * On success: persists the new tokens (encrypted) and returns the new access token.
 * On failure: invalidates all sessions for this user and throws TokenRefreshError.
 */
async function refreshUserTokens(userId: string, refreshToken: string): Promise<string> {
  try {
    // Pass empty array to keep the same scopes
    const tokens = await startgg.refreshAccessToken(refreshToken, []);

    const newAccessToken = tokens.accessToken();
    const newRefreshToken = tokens.refreshToken();
    const newExpiresAt = tokens.accessTokenExpiresAt();

    await db
      .update(users)
      .set({
        startggAccessToken: encrypt(newAccessToken),
        startggRefreshToken: encrypt(newRefreshToken),
        tokenExpiresAt: newExpiresAt,
        lastRefreshedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return newAccessToken;
  } catch (error) {
    // Refresh failed: nuke all sessions for this user, forcing re-login.
    await db.delete(sessions).where(eq(sessions.userId, userId));

    console.error("Token refresh failed for user", userId, error);
    throw new TokenRefreshError(
      "Could not refresh OAuth tokens. User must re-authenticate.",
    );
  }
}

/**
 * Custom error type so callers can distinguish refresh failures from other errors.
 */
export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRefreshError";
  }
}