-- A report can now be about a whole room (message_id NULL) instead of a message.
ALTER TABLE "reports" ALTER COLUMN "message_id" DROP NOT NULL;
