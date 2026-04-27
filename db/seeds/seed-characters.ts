import { db } from "../index";
import { characters } from "../schema";
import { sql } from "drizzle-orm";

const STARTGG_API_URL = "https://api.start.gg/gql/alpha";
const ULTIMATE_VIDEOGAME_ID = 1386;

interface StartGGCharacter {
    id: number;
    name: string;
}

interface GraphQLResponse {
    data?: {
        videogame: {
            id: number;
            name: string;
            characters: StartGGCharacter[];
        } | null;
    };
    errors?: Array<{ message: string }>;
}

const QUERY = `
    query GetUltimateCharacters($videogameId: ID!) {
        videogame(id: $videogameId) {
            id
            name
            characters {
                id
                name
            }
        }
    }
`;

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}

async function fetchCharactersFromStartGG(): Promise<StartGGCharacter[]> {
    const token = process.env.STARTGG_TOKEN;
    if (!token) {
        throw new Error("STARTGG_TOKEN is not defined in environment variables");
    }

    const response = await fetch(STARTGG_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            query: QUERY,
            variables: { videogameId: ULTIMATE_VIDEOGAME_ID },
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as GraphQLResponse;

    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    if (!json.data?.videogame) {
        throw new Error("Videogame not found or null");
    }

    return json.data.videogame.characters;
}

async function seed() {
    console.log("Fetching characters from start.gg...");
    const startggCharacters = await fetchCharactersFromStartGG();
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