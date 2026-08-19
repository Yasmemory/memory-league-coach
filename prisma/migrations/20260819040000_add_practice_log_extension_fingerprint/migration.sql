ALTER TABLE "PracticeLog" ADD COLUMN "extensionFingerprint" TEXT;
CREATE UNIQUE INDEX "PracticeLog_extensionFingerprint_key" ON "PracticeLog"("extensionFingerprint");
