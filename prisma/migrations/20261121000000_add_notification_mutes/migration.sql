-- A user can turn off reply/reaction notices for a whole room or a single thread.
CREATE TYPE "notification_mute_scope" AS ENUM ('room', 'post');

CREATE TABLE "notification_mutes" (
    "user_id" UUID NOT NULL,
    "scope" "notification_mute_scope" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_mutes_pkey" PRIMARY KEY ("user_id","scope","target_id")
);

ALTER TABLE "notification_mutes" ADD CONSTRAINT "notification_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table: block the Supabase Data API, Prisma is unaffected.
ALTER TABLE "notification_mutes" ENABLE ROW LEVEL SECURITY;
