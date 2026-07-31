CREATE TABLE "spotify_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"token_encryption_version" integer DEFAULT 1 NOT NULL,
	"scopes" text[] NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	CONSTRAINT "spotify_connections_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "spotify_connections_token_encryption_version_positive" CHECK ("spotify_connections"."token_encryption_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spotify_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_spotify_account_id_unique" UNIQUE("spotify_account_id")
);
--> statement-breakpoint
ALTER TABLE "spotify_connections" ADD CONSTRAINT "spotify_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;