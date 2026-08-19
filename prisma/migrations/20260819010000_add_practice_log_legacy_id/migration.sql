-- AlterTable
ALTER TABLE "PracticeLog" ADD COLUMN "legacyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PracticeLog_legacyId_key" ON "PracticeLog"("legacyId");
