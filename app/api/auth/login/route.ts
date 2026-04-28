import { generateState } from "arctic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { startgg, STARTGG_SCOPES } from "@/lib/auth/startgg";

/**
 * GET /api/auth/login
 * 
 * Initiates the OAuth flow with start.gg
 * Optionally accepts ?redirect=/some/path to preserve the destination
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";

    const state = generateState();
    const authUrl = startgg.createAuthorizationURL(state, STARTGG_SCOPES);

    const cookieStore = await cookies();

    cookieStore.set("startgg_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/",
    });

    cookieStore.set("startgg_oauth_redirect", redirectTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/",
    });

    redirect(authUrl.toString());
}