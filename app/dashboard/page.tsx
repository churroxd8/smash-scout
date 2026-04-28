import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const userId = await getSessionUserId();

  if (!userId) {
    return (
      <main className="container mx-auto p-8">
        <h1 className="text-2xl font-bold">Not logged in</h1>
        <p>
          <a href="/api/auth/login" className="text-blue-500 underline">
            Log in with start.gg
          </a>
        </p>
      </main>
    );
  }

  // Fetch user and their player from DB
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    return <p>Session is invalid. Please log in again.</p>;
  }

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.startggUserId, user.startggUserId))
    .limit(1);

  return (
    <main className="container mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-bold">Welcome to Smash Scout</h1>
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
              <strong>Location:</strong> {[player.city, player.state, player.countryCode].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}