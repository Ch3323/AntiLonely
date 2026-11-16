-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "sanction_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_sanction_id_key" ON "notifications"("sanction_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "sanctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
