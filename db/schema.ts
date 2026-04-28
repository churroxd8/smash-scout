import {
    pgTable,
    uuid,
    text,
    bigint,
    integer,
    boolean,
    timestamp,
    date,
    uniqueIndex,
    index,
    unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * users - Smash Scout accounts (authenticated via start.gg OAuth).
 * Numerically minority: only users who actively log in.
 */
export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggUserId: bigint("startgg_user_id", { mode: "number" }).notNull(),
        startggSlug: text("startgg_slug").notNull(),
        //OAuth tokens (encrypted at rest; encryption handled at app layer).
        startggAccessToken: text("startgg_access_token"),
        startggRefreshToken: text("startgg_refresh_token"),
        tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
        lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    },
    (table) => [
        uniqueIndex("users_startgg_user_id_unique").on(table.startggUserId),
        uniqueIndex("users_startgg_slug_unique").on(table.startggSlug),
    ],
);

/**
 * players - competitive identities in start.gg
 * Numerically majority: grows with every scouting action.
 */
export const players = pgTable(
    "players",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggPlayerId: bigint("startgg_player_id", { mode: "number" }).notNull(),
        startggUserId: bigint("startgg_user_id", { mode: "number" }),
        startggUserSlug: text("startgg_user_slug"),
        gamerTag: text("gamer_tag").notNull(),
        prefix: text("prefix"),
        countryCode: text("country_code"),
        state: text("state"),
        city: text("city"),
        avatarUrl: text("avatar_url"),
        lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
        ingestedAt: timestamp("ingested_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("players_startgg_player_id_unique").on(table.startggPlayerId),
        uniqueIndex("players_startgg_user_id_unique").on(table.startggUserId),
        index("players_gamer_tag_idx").on(sql`lower(${table.gamerTag})`),
        index("players_startgg_user_slug_idx").on(table.startggUserSlug),
    ],
);

/**
 * tournaments - start.gg tournaments we have indexed.
 * is_online is auto-computed from the absence of location data
 */
export const tournaments = pgTable(
    "tournaments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggTournamentId: bigint("startgg_tournament_id", { mode: "number" }).notNull(),
        slug: text("slug").notNull(),
        name: text("name").notNull(),
        startAt: timestamp("start_at", { withTimezone: true }).notNull(),
        endAt: timestamp("end_at", { withTimezone: true }),
        city: text("city"),
        countryCode: text("country_code"),
        isOnline: boolean("is_online")
            .notNull()
            .generatedAlwaysAs(sql`(city IS NULL AND country_code IS NULL)`),
        numAttendees: integer("num_attendees"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("tournaments_startgg_tournament_id_unique").on(table.startggTournamentId),
        uniqueIndex("torunaments_slug_unique").on(table.slug),
        index("torunaments_start_at_idx").on(sql`${table.startAt} DESC`),
    ],
);

/**
 * events - specific game events within a tournament (e.g., Ultimate Singles)
 */
export const events = pgTable(
    "events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggEventId: bigint("startgg_event_id", { mode: "number" }).notNull(),
        tournamentId: uuid("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        videogameId: integer("videogame_id").notNull(),
        numEntrants: integer("num_entrants"),
        isSingles: boolean("is_singles").notNull(),
        state: text("state"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("events_startgg_event_id_unique").on(table.startggEventId),
        index("events_tournament_id_idx").on(table.tournamentId),
        index("events_videogame_id_idx").on(table.videogameId),
    ],
);

/**
 * player_standings - a player's placement in a specific event
 * entrant_name is point-in-time (captures sponsor prefix at that moment)
 */
export const playerStandings = pgTable(
    "player_standings",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        playerId: uuid("player_id")
            .notNull()
            .references(() => players.id, { onDelete: "cascade" }),
        eventId: uuid("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        placement: integer("placement").notNull(),
        entrantId: bigint("entrant_id", { mode: "number" }).notNull(),
        entrantName: text("entrant_name").notNull(),
        startggStandingId: bigint("startgg_standing_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("player_standings_startgg_standing_id_unique").on(table.startggStandingId),
        unique("player_standings_player_event_unique").on(table.playerId, table.eventId),
        index("player_standings_player_id_idx").on(table.playerId),
        index("player_standings_event_id_idx").on(table.eventId),
    ],
);

/**
 * sets - matches between two entrants.
 * Denormalized: entrant data stored directly rather than via a join table,
 * because Ultimate is always 1v1 (cardinality fixed and known)
 */
export const sets = pgTable(
    "sets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggSetId: bigint("startgg_set_id", { mode: "number" }).notNull(),
        eventId: uuid("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),

        entrant1Id: bigint("entrant1_id", { mode: "number" }).notNull(),
        entrant1PlayerId: uuid("entrant1_player_id").references(() => players.id),
        entrant1Name: text("entrant1_name").notNull(),
        entrant1Score: integer("entrant1_score"),

        entrant2Id: bigint("entrant2_id", { mode: "number" }).notNull(),
        entrant2PlayerId: uuid("entrant2_player_id").references(() => players.id),
        entrant2Name: text("entrant2_name").notNull(),
        entrant2Score: integer("entrant2_score"),

        winnerEntrantId: bigint("winner_entrant_id", { mode: "number" }),
        winnerPlayerId: uuid("winner_player_id").references(() => players.id),

        fullRoundText: text("full_round_text"),
        round: integer("round"),
        displayScore: text("display_score"),
        completedAt: timestamp("completed_at", { withTimezone: true }),

        hasGameData: boolean("has_game_data").notNull().default(false),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("sets_startgg_set_id_unique").on(table.startggSetId),
        index("sets_event_id_idx").on(table.eventId),
        index("sets_entrant1_player_id_idx").on(table.entrant1PlayerId),
        index("sets_entrant2_player_id_idx").on(table.entrant2PlayerId),
        index("sets_completed_at_idx").on(sql`${table.completedAt} DESC`),
    ],
);

/**
 * games - individual games within a set
 * Only exists when the tournament organized registered game-level data
 * Character IDs denormalized for fast matchup analysis queries.
 */
export const games = pgTable(
    "games",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        startggGameId: bigint("startgg_game_id", { mode: "number" }).notNull(),
        setId: uuid("set_id")
            .notNull()
            .references(() => sets.id, { onDelete: "cascade" }),
        orderNum: integer("order_num").notNull(),
        winnerEntrantId: bigint("winner_entrant_id", { mode: "number" }),
        stageId: integer("stage_id"),
        stageName: text("stage_name"),
        entrant1CharacterId: integer("entrant1_character_id"),
        entrant2CharacterId: integer("entrant2_character_id"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("games_startgg_game_id_unique").on(table.startggGameId),
        unique("games_set_order_unique").on(table.setId, table.orderNum),
        index("games_set_id_idx").on(table.setId),
        index("games_entrant1_character_id_idx").on(table.entrant1CharacterId),
        index("games_entrant2_character_id_idx").on(table.entrant2CharacterId),
    ],
);

/**
 * characters - static dictionary seeded from characters.json
 * ID matches start.gg selectionValue.
 */
export const characters = pgTable("characters", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    iconUrl: text("icon_url"),
    releasedAt: date("released_at"),
});

/**
 * ingestion_jobs - persistent tracking of async ingestion work.
 * Persisted (not just in-memory) for: observability (progress bar),
 * resilience to worker restarts, and auditability when debugging.
 */
export const ingestionJobs = pgTable(
    "ingestion_jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        playerId: uuid("player_id")
            .notNull()
            .references(() => players.id, { onDelete: "cascade" }),
        triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
        status: text("status").notNull(), // PENDING | RUNNING | COMPLETED | FAILED
        progressCurrent: integer("progress_current").default(0),
        progressTotal: integer("progress_total"),
        errorMessage: text("error_message"),
        startedAt: timestamp("started_at", { withTimezone: true }),
        finishedAt: timestamp("finished_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("ingestion_jobs_player_id_idx").on(table.playerId),
        index("ingestion_jobs_status_idx").on(table.status),
    ],
);

/**
 * sessions - server-side session storage
 * 
 * The cookie sent to the client contains a random token. We store a SHA-256 hash
 * of that token as the row id. To validate a session, we hash the
 * incoming token and look it up. The plaintext token never touches de DB.
 * 
 * This pattern enables session revocation, multi-device session listing,
 * and forced logout across devices.
 */
export const sessions = pgTable(
    "sessions",
    {
        id: text("id").primaryKey(), //SHA-256 hash of the session token (hex)
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("sessions_user_id_idx").on(table.userId),
        index("sessions_expires_at_idx").on(table.expiresAt),
    ],
);