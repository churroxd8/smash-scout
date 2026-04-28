import { cookies } from "next/headers";
import { encrypt, decrypt } from "./encryption";

const SESSION_COOKIE_NAME = "smashscout_session";
const SESSION_DURATION_DAYS = 7;

/**
 * Creates a session by setting an encrypted cookie with the user's ID.
 * 
 * NOTE: this is a minimal implementation for now. In Block 6 we'll move
 * to a server-side session table for revocation support.
 */
export async function createSession(userId: string): Promise<void> {
    const cookieStore = await cookies();
    const encrypted = encrypt(userId);

    cookieStore.set(SESSION_COOKIE_NAME, encrypted, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * SESSION_DURATION_DAYS,
        path: "/",
    });
}

/**
 * Returns the current user's ID from the session cookie, or null if done.
 */
export async function getSessionUserId(): Promise<string | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!cookie?.value) {
        return null;
    }

    try {
        return decrypt(cookie.value);
    } catch {
        return null; // Tampered or invalid cookie
    }
}

/**
 * Removes the session cookie (logout)
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
}