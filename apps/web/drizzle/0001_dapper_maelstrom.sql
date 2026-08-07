CREATE TABLE "spotify_albums" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_library_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"next_offset" integer DEFAULT 0 NOT NULL,
	"spotify_total" integer,
	"processed_track_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	CONSTRAINT "spotify_library_syncs_status_valid" CHECK ("spotify_library_syncs"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "spotify_library_syncs_next_offset_non_negative" CHECK ("spotify_library_syncs"."next_offset" >= 0),
	CONSTRAINT "spotify_library_syncs_processed_count_non_negative" CHECK ("spotify_library_syncs"."processed_track_count" >= 0),
	CONSTRAINT "spotify_library_syncs_total_non_negative" CHECK ("spotify_library_syncs"."spotify_total" is null or "spotify_library_syncs"."spotify_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spotify_track_artists" (
	"track_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "spotify_track_artists_track_id_artist_id_pk" PRIMARY KEY("track_id","artist_id"),
	CONSTRAINT "spotify_track_artists_position_non_negative" CHECK ("spotify_track_artists"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spotify_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"name" text NOT NULL,
	"spotify_url" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"explicit" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_tracks_duration_non_negative" CHECK ("spotify_tracks"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_saved_tracks" (
	"user_id" uuid NOT NULL,
	"track_id" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"last_seen_sync_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_saved_tracks_user_id_track_id_pk" PRIMARY KEY("user_id","track_id")
);
--> statement-breakpoint
ALTER TABLE "spotify_library_syncs" ADD CONSTRAINT "spotify_library_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_track_artists" ADD CONSTRAINT "spotify_track_artists_track_id_spotify_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."spotify_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_track_artists" ADD CONSTRAINT "spotify_track_artists_artist_id_spotify_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."spotify_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_tracks" ADD CONSTRAINT "spotify_tracks_album_id_spotify_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."spotify_albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_tracks" ADD CONSTRAINT "user_saved_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_tracks" ADD CONSTRAINT "user_saved_tracks_track_id_spotify_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."spotify_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_tracks" ADD CONSTRAINT "user_saved_tracks_last_seen_sync_id_spotify_library_syncs_id_fk" FOREIGN KEY ("last_seen_sync_id") REFERENCES "public"."spotify_library_syncs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_library_syncs_one_running_per_user" ON "spotify_library_syncs" USING btree ("user_id") WHERE "spotify_library_syncs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "spotify_library_syncs_user_updated_idx" ON "spotify_library_syncs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_track_artists_track_position_unique" ON "spotify_track_artists" USING btree ("track_id","position");--> statement-breakpoint
CREATE INDEX "spotify_track_artists_artist_id_idx" ON "spotify_track_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "spotify_tracks_album_id_idx" ON "spotify_tracks" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "user_saved_tracks_user_saved_at_idx" ON "user_saved_tracks" USING btree ("user_id","saved_at");--> statement-breakpoint
CREATE INDEX "user_saved_tracks_user_last_seen_sync_idx" ON "user_saved_tracks" USING btree ("user_id","last_seen_sync_id");--> statement-breakpoint
CREATE INDEX "user_saved_tracks_track_id_idx" ON "user_saved_tracks" USING btree ("track_id");