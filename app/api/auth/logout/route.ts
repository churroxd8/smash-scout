import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 * 
 * Destroys the current session:
 * - Removes the session row from the database
 * - Clears the session cookie
 * 
 * Then redirects the user to the home page.
 * 
 * Uses POST instead of GET to prevent CSRF attacks via prefetching:
 * a malicious site cannot trigger logout bi linking <img src=".../logout">.
 */
export async function POST(request: Request) {
    await destroySession();
    return NextResponse.redirect(new URL("/", request.url), {
        // 303 = "see other", appropriate for redirect after POST
        status: 303,
    });
}