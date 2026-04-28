export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ redirect?: string }>;
}) {
    const params = await searchParams;
    const redirect = params.redirect ?? "/dashboard";

    // Build the login URL with the redirect param so the callback can use it
    const loginUrl = `/api/auth/login?redirect=${encodeURIComponent(redirect)}`;

    return (
        <main className="container mx-auto p-8 max-w-md mt-16">
            <h1 className="text-3xl font-bold mb-4">Smash Scout</h1>
            <p className="text-gray-600 mb-8">
                Sign in with your start.gg account to see your competitive history,
                head-to-head records, and matchup analytics.
            </p>
            <a
                href={loginUrl}
                className="block w-full text-center bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
                Sign in with start.gg
            </a>
            {redirect !== "/dashboard" && (
                <p className="text-sm text-gray-500 mt-4 text-center">
                    You&apos;ll be redirected to <code>{redirect}</code> after signing in. 
                </p>
            )}
        </main>
    );
}