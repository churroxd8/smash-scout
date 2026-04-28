import crypto from "crypto";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_COOKIE_NAME = "smashscout_session";
const SESSION_DURATION_DAYS = 30;

/**
 * Generates a fresh, cryptographically random session token.
 * Returns 32 bytes encoded as 64 hex characters.
 */
function generateSessionToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Hashes a session token with SHA-256 to produce the storage id.
 * The plaintext token lives only in the user's cookie; the DB only
 * sees the hash. If the DB is compromised, attackers cannot use the
 * stored hashes to forge valid cookies.
 */
function hashSessionToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a new session for the given user.
 * - Generates a random token
 * - Inserts a row with the token's hash as id
 * - Sets the cookie with the plaintext token
 */
export async function createSession(userId: string): Promise<void> {
    const token = generateSessionToken();
    const sessionId = hashSessionToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    await db.insert(sessions).values({
        id: sessionId,
        userId,
        expiresAt,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: expiresAt,
        path: "/",
    });
}

/**
 * Looks up the current session from the cookie.
 * Returns the session row + user row, or null if no valid session.
 * 
 * Side effects:
 * - If the session exists but has not expired, deletes de row and returns null.
 * - Does NOT extend the session expiration (sliding window) for now.
 * - We'll add that in a later iteration if needed.
 */
export async function getCurrentSession(): Promise<{
    session: typeof sessions.$inferSelect;
    user: typeof users.$inferSelect;
} | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    const sessionId = hashSessionToken(token);

    const result = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, sessionId))
        .limit(1);
    
    const row = result[0];
    if (!row) {
        return null;
    }

    // Check expiration
    if (row.session.expiresAt < new Date()) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        return null;
    }

    return row;
}

/**
 * Backwards-compatible helper that returns just the user id.
 * Used by older code paths until they're migrated to getCurrentSession().
 */
export async function getSessionUserId(): Promise<string | null> {
    const result = await getCurrentSession();
    return result?.user.id ?? null;
}

/**
 * Destroys the current session.
 * - Deletes the row from the sessions table
 * - Clears the cookie
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
        const sessionId = hashSessionToken(token);
        await db.delete(sessions).where(eq(sessions.id, sessionId));
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Cleans up expired sessions.
 * Useful as a periodic job to keep the table small.
 * Not called automatically; you can wire it to a cron later.
 */
export async function deleteExpiredSessions(): Promise<number> {
    const deleted = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .returning({ id: sessions.id });
    
    return deleted.length;
}