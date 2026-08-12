CREATE TABLE "track_audio_features" (
	"track_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_track_id" text,
	"status" text NOT NULL,
	"acousticness" double precision,
	"danceability" double precision,
	"energy" double precision,
	"instrumentalness" double precision,
	"liveness" double precision,
	"loudness" double precision,
	"speechiness" double precision,
	"tempo" double precision,
	"valence" double precision,
	"fetched_at" timestamp with time zone,
	"retry_after_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_audio_features_track_id_provider_pk" PRIMARY KEY("track_id","provider"),
	CONSTRAINT "track_audio_features_status_valid" CHECK ("track_audio_features"."status" in ('available', 'not_found')),
	CONSTRAINT "track_audio_features_provider_valid" CHECK ("track_audio_features"."provider" = 'reccobeats'),
	CONSTRAINT "track_audio_features_acousticness_range" CHECK ("acousticness" is null or ("acousticness" >= 0 and "acousticness" <= 1)),
	CONSTRAINT "track_audio_features_danceability_range" CHECK ("danceability" is null or ("danceability" >= 0 and "danceability" <= 1)),
	CONSTRAINT "track_audio_features_energy_range" CHECK ("energy" is null or ("energy" >= 0 and "energy" <= 1)),
	CONSTRAINT "track_audio_features_instrumentalness_range" CHECK ("instrumentalness" is null or ("instrumentalness" >= 0 and "instrumentalness" <= 1)),
	CONSTRAINT "track_audio_features_liveness_range" CHECK ("liveness" is null or ("liveness" >= 0 and "liveness" <= 1)),
	CONSTRAINT "track_audio_features_speechiness_range" CHECK ("speechiness" is null or ("speechiness" >= 0 and "speechiness" <= 1)),
	CONSTRAINT "track_audio_features_valence_range" CHECK ("valence" is null or ("valence" >= 0 and "valence" <= 1)),
	CONSTRAINT "track_audio_features_tempo_non_negative" CHECK ("track_audio_features"."tempo" is null or "track_audio_features"."tempo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "track_enrichment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"attempted_track_count" integer DEFAULT 0 NOT NULL,
	"enriched_track_count" integer DEFAULT 0 NOT NULL,
	"not_found_track_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result_code" text,
	"retry_after_seconds" integer,
	CONSTRAINT "track_enrichment_runs_status_valid" CHECK ("track_enrichment_runs"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "track_enrichment_runs_provider_valid" CHECK ("track_enrichment_runs"."provider" = 'reccobeats'),
	CONSTRAINT "track_enrichment_runs_counts_non_negative" CHECK ("track_enrichment_runs"."attempted_track_count" >= 0 and "track_enrichment_runs"."enriched_track_count" >= 0 and "track_enrichment_runs"."not_found_track_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "track_audio_features" ADD CONSTRAINT "track_audio_features_track_id_spotify_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."spotify_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_enrichment_runs" ADD CONSTRAINT "track_enrichment_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_audio_features_provider_status_idx" ON "track_audio_features" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "track_audio_features_retry_idx" ON "track_audio_features" USING btree ("provider","status","retry_after_at");--> statement-breakpoint
CREATE UNIQUE INDEX "track_enrichment_runs_one_running_per_user" ON "track_enrichment_runs" USING btree ("user_id") WHERE "track_enrichment_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "track_enrichment_runs_user_started_idx" ON "track_enrichment_runs" USING btree ("user_id","started_at");