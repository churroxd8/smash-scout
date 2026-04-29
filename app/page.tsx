import { getCurrentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  // If the user is already logged in, send them to the dashboard
  const session = await getCurrentSession();
  if (session) {
    redirect("/dashboard");
  }

  return(
    <main className="container mx-auto p-8 max-w-2xl mt-16">
      <h1 className="text-4xl font-bold mb-4">Smash Scout</h1>
      <p className="text-gray-600 text-lg mg-8">
        Competitive intelligence for Super Smash Bros. Ultimate. See your
        tournament history, head-to-head records, and matchup analytics.
      </p>
      <a
        href="/login"
        className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
      >
        Sign in with start.gg
      </a>
    </main>
  );
}