import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "smashscout_session";

/**
 * Route that require authentication.
 * Users without a valid session cookie will be redirected to /login
 */
const PROTECTED_ROUTES = ["/dashboard"];

/**
 * Routes that should redirect logged-in users away (e.g., login pages).
 * Users with a session will be redirected to /dashboard
 */
const AUTH_ROUTES = ["/login"];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

    const isProtected = PROTECTED_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
    const isAuthRoute = AUTH_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
    );

    // Case 1: trying to access a protected route without a session cookie
    if (isProtected && !sessionCookie) {
        const loginUrl = new URL("/login", request.url);
        // Preserve the originally requested path so we can redirect back after login
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Case 2: trying to visit /login while already having a session cookie
    if (isAuthRoute && sessionCookie) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
}

/**
 * Matcher: which paths should the middleware run on.
 * 
 * We exclude:
 * - /api routes (auth happens in the route handlers)
 * - Static assets (_next/static, _next/image)
 * - Favicon and similar files
 */
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};