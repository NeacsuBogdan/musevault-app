CREATE TABLE "spotify_listening_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"sync_mode" text NOT NULL,
	"processed_play_count" integer DEFAULT 0 NOT NULL,
	"processed_page_count" integer DEFAULT 0 NOT NULL,
	"cursor_before" bigint,
	"cursor_after" bigint,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	"result_code" text,
	CONSTRAINT "spotify_listening_syncs_status_valid" CHECK ("spotify_listening_syncs"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "spotify_listening_syncs_mode_valid" CHECK ("spotify_listening_syncs"."sync_mode" in ('initial', 'incremental')),
	CONSTRAINT "spotify_listening_syncs_play_count_non_negative" CHECK ("spotify_listening_syncs"."processed_play_count" >= 0),
	CONSTRAINT "spotify_listening_syncs_page_count_non_negative" CHECK ("spotify_listening_syncs"."processed_page_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spotify_play_history" (
	"user_id" uuid NOT NULL,
	"track_id" text NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"context_type" text,
	"context_uri" text,
	"context_spotify_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_play_history_user_id_played_at_track_id_pk" PRIMARY KEY("user_id","played_at","track_id")
);
--> statement-breakpoint
CREATE TABLE "spotify_top_artist_snapshot_items" (
	"snapshot_id" uuid NOT NULL,
	"artist_id" text NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "spotify_top_artist_snapshot_items_snapshot_id_artist_id_pk" PRIMARY KEY("snapshot_id","artist_id"),
	CONSTRAINT "spotify_top_artist_snapshot_rank_positive" CHECK ("spotify_top_artist_snapshot_items"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "spotify_top_item_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"time_range" text NOT NULL,
	CONSTRAINT "spotify_top_item_snapshots_range_valid" CHECK ("spotify_top_item_snapshots"."time_range" in ('short_term', 'medium_term', 'long_term'))
);
--> statement-breakpoint
CREATE TABLE "spotify_top_track_snapshot_items" (
	"snapshot_id" uuid NOT NULL,
	"track_id" text NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "spotify_top_track_snapshot_items_snapshot_id_track_id_pk" PRIMARY KEY("snapshot_id","track_id"),
	CONSTRAINT "spotify_top_track_snapshot_rank_positive" CHECK ("spotify_top_track_snapshot_items"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "spotify_listening_syncs" ADD CONSTRAINT "spotify_listening_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_play_history" ADD CONSTRAINT "spotify_play_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_play_history" ADD CONSTRAINT "spotify_play_history_track_id_spotify_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."spotify_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_top_artist_snapshot_items" ADD CONSTRAINT "spotify_top_artist_snapshot_items_snapshot_id_spotify_top_item_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."spotify_top_item_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_top_artist_snapshot_items" ADD CONSTRAINT "spotify_top_artist_snapshot_items_artist_id_spotify_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."spotify_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_top_item_snapshots" ADD CONSTRAINT "spotify_top_item_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_top_track_snapshot_items" ADD CONSTRAINT "spotify_top_track_snapshot_items_snapshot_id_spotify_top_item_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."spotify_top_item_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_top_track_snapshot_items" ADD CONSTRAINT "spotify_top_track_snapshot_items_track_id_spotify_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."spotify_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_listening_syncs_one_running_per_user" ON "spotify_listening_syncs" USING btree ("user_id") WHERE "spotify_listening_syncs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "spotify_listening_syncs_user_started_idx" ON "spotify_listening_syncs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "spotify_play_history_user_played_at_idx" ON "spotify_play_history" USING btree ("user_id","played_at");--> statement-breakpoint
CREATE INDEX "spotify_play_history_user_track_idx" ON "spotify_play_history" USING btree ("user_id","track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_top_artist_snapshot_rank_unique" ON "spotify_top_artist_snapshot_items" USING btree ("snapshot_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_top_item_snapshots_user_date_range_unique" ON "spotify_top_item_snapshots" USING btree ("user_id","snapshot_date","time_range");--> statement-breakpoint
CREATE INDEX "spotify_top_item_snapshots_user_captured_idx" ON "spotify_top_item_snapshots" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_top_track_snapshot_rank_unique" ON "spotify_top_track_snapshot_items" USING btree ("snapshot_id","rank");