import { generateState } from "arctic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { startgg, STARTGG_SCOPES } from "@/lib/auth/startgg";

/**
 * GET /api/auth/login
 * 
 * Initiates the OAuth flow with start.gg
 * 
 * Steps:
 * 1. Generate a random `state` value to protect against CSRF.
 * 2. Store `state` in a short-lived cookie (we'll verify it on callback).
 * 3. Build the start.gg authorization URL with our scopes.
 * 4. Redirect the user to start.gg for consent.
 */
export async function GET() {
    const state = generateState();
    const url = startgg.createAuthorizationURL(state, STARTGG_SCOPES);

    const cookieStore = await cookies();
    cookieStore.set("startgg_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10, // 10 minutes
        path: "/",
    });

    redirect(url.toString());
}