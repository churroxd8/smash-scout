import { db } from "../index";
import { characters } from "../schema";
import { sql } from "drizzle-orm";
import { getAdminClient, getUltimateCharacters } from "../../lib/startgg";

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function seed() {
    console.log("Fetching characters from start.gg...");
    const client = getAdminClient();
    const startggCharacters = await getUltimateCharacters(client);
    console.log(`Got ${startggCharacters.length} characters from start.gg`);

    console.log("Upserting into database...");
    for (const char of startggCharacters) {
        await db
            .insert(characters)
            .values({
                id: char.id,
                name: char.name,
                slug: slugify(char.name),
            })
            .onConflictDoUpdate({
                target: characters.id,
                set: {
                    name: char.name,
                    slug: slugify(char.name),
                },
            });
    }

    const count = await db.select({ count: sql<number>`count(*)::int` }).from(characters);
    console.log(`Done! Total characters in database: ${count[0]?.count ?? 0}`);

    process.exit(0);
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});