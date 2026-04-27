CREATE TABLE "characters" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"released_at" date
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_event_id" bigint NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"videogame_id" integer NOT NULL,
	"num_entrants" integer,
	"is_singles" boolean NOT NULL,
	"state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_game_id" bigint NOT NULL,
	"set_id" uuid NOT NULL,
	"order_num" integer NOT NULL,
	"winner_entrant_id" bigint,
	"stage_id" integer,
	"stage_name" text,
	"entrant1_character_id" integer,
	"entrant2_character_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_set_order_unique" UNIQUE("set_id","order_num")
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"triggered_by_user_id" uuid,
	"status" text NOT NULL,
	"progress_current" integer DEFAULT 0,
	"progress_total" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"placement" integer NOT NULL,
	"entrant_id" bigint NOT NULL,
	"entrant_name" text NOT NULL,
	"startgg_standing_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_standings_player_event_unique" UNIQUE("player_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_player_id" bigint NOT NULL,
	"startgg_user_id" bigint,
	"startgg_user_slug" text,
	"gamer_tag" text NOT NULL,
	"prefix" text,
	"country_code" text,
	"state" text,
	"city" text,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone,
	"ingested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_set_id" bigint NOT NULL,
	"event_id" uuid NOT NULL,
	"entrant1_id" bigint NOT NULL,
	"entrant1_player_id" uuid,
	"entrant1_name" text NOT NULL,
	"entrant1_score" integer,
	"entrant2_id" bigint NOT NULL,
	"entrant2_player_id" uuid,
	"entrant2_name" text NOT NULL,
	"entrant2_score" integer,
	"winner_entrant_id" bigint,
	"winner_player_id" uuid,
	"full_round_text" text,
	"round" integer,
	"display_score" text,
	"completed_at" timestamp with time zone,
	"has_game_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_tournament_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"city" text,
	"country_code" text,
	"is_online" boolean GENERATED ALWAYS AS ((city IS NULL AND country_code IS NULL)) STORED NOT NULL,
	"num_attendees" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startgg_user_id" bigint NOT NULL,
	"startgg_slug" text NOT NULL,
	"startgg_access_token" text,
	"startgg_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_standings" ADD CONSTRAINT "player_standings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_standings" ADD CONSTRAINT "player_standings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_entrant1_player_id_players_id_fk" FOREIGN KEY ("entrant1_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_entrant2_player_id_players_id_fk" FOREIGN KEY ("entrant2_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_winner_player_id_players_id_fk" FOREIGN KEY ("winner_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_startgg_event_id_unique" ON "events" USING btree ("startgg_event_id");--> statement-breakpoint
CREATE INDEX "events_tournament_id_idx" ON "events" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "events_videogame_id_idx" ON "events" USING btree ("videogame_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_startgg_game_id_unique" ON "games" USING btree ("startgg_game_id");--> statement-breakpoint
CREATE INDEX "games_set_id_idx" ON "games" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "games_entrant1_character_id_idx" ON "games" USING btree ("entrant1_character_id");--> statement-breakpoint
CREATE INDEX "games_entrant2_character_id_idx" ON "games" USING btree ("entrant2_character_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_player_id_idx" ON "ingestion_jobs" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "player_standings_startgg_standing_id_unique" ON "player_standings" USING btree ("startgg_standing_id");--> statement-breakpoint
CREATE INDEX "player_standings_player_id_idx" ON "player_standings" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_standings_event_id_idx" ON "player_standings" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_startgg_player_id_unique" ON "players" USING btree ("startgg_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_startgg_user_id_unique" ON "players" USING btree ("startgg_user_id");--> statement-breakpoint
CREATE INDEX "players_gamer_tag_idx" ON "players" USING btree (lower("gamer_tag"));--> statement-breakpoint
CREATE INDEX "players_startgg_user_slug_idx" ON "players" USING btree ("startgg_user_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sets_startgg_set_id_unique" ON "sets" USING btree ("startgg_set_id");--> statement-breakpoint
CREATE INDEX "sets_event_id_idx" ON "sets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sets_entrant1_player_id_idx" ON "sets" USING btree ("entrant1_player_id");--> statement-breakpoint
CREATE INDEX "sets_entrant2_player_id_idx" ON "sets" USING btree ("entrant2_player_id");--> statement-breakpoint
CREATE INDEX "sets_completed_at_idx" ON "sets" USING btree ("completed_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_startgg_tournament_id_unique" ON "tournaments" USING btree ("startgg_tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "torunaments_slug_unique" ON "tournaments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "torunaments_start_at_idx" ON "tournaments" USING btree ("start_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "users_startgg_user_id_unique" ON "users" USING btree ("startgg_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_startgg_slug_unique" ON "users" USING btree ("startgg_slug");