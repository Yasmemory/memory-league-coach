DROP INDEX IF EXISTS "PracticeLog_legacyId_key";

ALTER TABLE "PracticeLog" DROP COLUMN IF EXISTS "legacyId";
