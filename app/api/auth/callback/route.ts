import { OAuth2RequestError } from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { startgg, STARTGG_SCOPES } from "@/lib/auth/startgg";
import { encrypt } from "@/lib/auth/encryption";
import { createSession } from "@/lib/auth/session";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { createUserClient, getCurrentUser } from "@/lib/startgg";


export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    const cookieStore = await cookies();
    const storedState = cookieStore.get("startgg_oauth_state")?.value ?? null;

    if (!code || !state || !storedState || state !== storedState) {
        return NextResponse.json(
            {
                error: "invalid_request",
                message: "Missing or mismatched OAuth state. Please try logging in again.",
            },
            { status: 400 },
        );
    }

    cookieStore.delete("startgg_oauth_state");

    try{
        // Step 1: Exchange code for tokens
        const tokens = await startgg.validateAuthorizationCode(code, STARTGG_SCOPES);
        const accessToken = tokens.accessToken();
        const refreshToken = tokens.refreshToken();
        const expiresAt = tokens.accessTokenExpiresAt();

        // Step 2: Fetch user profile from start.gg using the rate-limited client
        const userClient = createUserClient(accessToken);
        const startggUser = await getCurrentUser(userClient);

        if (!startggUser.player) {
            return NextResponse.json(
                {
                    error: "no_player",
                    message: "Your start.gg account has no associated player profile.",
                },
                { status: 400 },
            );
        }

        // Step 3: Upsert player (their competitive identity)
        const playerData = {
            startggPlayerId: startggUser.player.id,
            startggUserId: startggUser.id,
            startggUserSlug: startggUser.slug,
            gamerTag: startggUser.player.gamerTag,
            prefix: startggUser.player.prefix,
            countryCode: startggUser.location?.country ?? null,
            state: startggUser.location?.state ?? null,
            city: startggUser.location?.city ?? null,
        };

        const [upsertedPlayer] = await db
            .insert(players)
            .values(playerData)
            .onConflictDoUpdate({
                target: players.startggPlayerId,
                set: playerData,
            })
            .returning();

        if (!upsertedPlayer) {
            throw new Error("Failed to upsert player");
        }

        // Step 4. Upsert user (their Smash Scout account)
        const userData = {
            startggUserId: startggUser.id,
            startggSlug: startggUser.slug,
            startggAccessToken: encrypt(accessToken),
            startggRefreshToken: encrypt(refreshToken),
            tokenExpiresAt: expiresAt,
            lastLoginAt: new Date(),
            lastRefreshedAt: new Date(),
        };

        const [upsertedUser] = await db
            .insert(users)
            .values(userData)
            .onConflictDoUpdate({
                target: users.startggUserId,
                set: userData,
            })
            .returning();
        if (!upsertedUser) {
            throw new Error("Failed to upsert user");
        }

        // Step 5: Create session
        await createSession(upsertedUser.id);

        // Step 6: Redirect to dashboard
        const redirectTo = cookieStore.get("startgg_oauth_redirect")?.value ?? "/dashboard";
        cookieStore.delete("startgg_oauth_redirect");

        // Validate that redirectTo is a relative path to prevent open redirect attacks
        const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";

        return NextResponse.redirect(new URL(safeRedirect, request.url));
    } catch (error) {
        if (error instanceof OAuth2RequestError) {
            return NextResponse.json(
                {
                    error: "oauth2_request_error",
                    message: error.message,
                    description: error.description,
                },
                { status: 400 },
            );
        }

        console.error("OAuth callback error:", error);
        return NextResponse.json(
            {
                error: "internal_error",
                message: "An unexpected error occurred during authentication.",
            },
            { status: 500 },
        );
    }
}