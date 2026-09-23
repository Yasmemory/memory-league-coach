-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Student_discordId_key" ON "Student"("discordId");

-- CreateTable
CREATE TABLE "PracticeRecord" (
    "id" TEXT NOT NULL,
    "sourceUuid" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "practicedAt" DATE NOT NULL,
    "registeredAt" TIMESTAMP(3),
    "event" TEXT NOT NULL,
    "count" INTEGER,
    "score" DOUBLE PRECISION,
    "correct" DOUBLE PRECISION,
    "timeSeconds" DOUBLE PRECISION,
    "messageId" TEXT,
    "messageUrl" TEXT,
    "sourceType" TEXT,
    "status" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT '',
    "reflection" TEXT NOT NULL DEFAULT '',
    "nextAction" TEXT NOT NULL DEFAULT '',
    "coachComment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PracticeRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PracticeRecord_sourceUuid_key" ON "PracticeRecord"("sourceUuid");
CREATE INDEX "PracticeRecord_studentId_practicedAt_idx" ON "PracticeRecord"("studentId", "practicedAt");
CREATE INDEX "PracticeRecord_studentId_event_practicedAt_idx" ON "PracticeRecord"("studentId", "event", "practicedAt");
ALTER TABLE "PracticeRecord" ADD CONSTRAINT "PracticeRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
