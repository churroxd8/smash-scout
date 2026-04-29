import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/db";
import { players } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const sessionData = await getCurrentSession();

  if (!sessionData) {
    redirect("/login?redirect=/dashboard");
  }

  const { user } = sessionData;

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.startggUserId, user.startggUserId))
    .limit(1);

  return (
    <main className="container mx-auto p-8 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Welcome to Smash Scout</h1>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Log out
          </button>
        </form>
      </div>

      <div className="border rounded p-4 bg-gray-50">
        <h2 className="text-xl font-semibold">Your account</h2>
        <p>
          <strong>start.gg user ID:</strong> {user.startggUserId}
        </p>
        <p>
          <strong>start.gg slug:</strong> {user.startggSlug}
        </p>
        <p>
          <strong>Last login:</strong> {user.lastLoginAt?.toISOString() ?? "never"}
        </p>
      </div>

      {player && (
        <div className="border rounded p-4 bg-gray-50">
          <h2 className="text-xl font-semibold">Your player</h2>
          <p>
            <strong>Gamer tag:</strong> {player.gamerTag}
          </p>
          {player.prefix && (
            <p>
              <strong>Prefix:</strong> {player.prefix}
            </p>
          )}
          {(player.city || player.countryCode) && (
            <p>
              <strong>Location:</strong>{" "}
              {[player.city, player.state, player.countryCode].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}