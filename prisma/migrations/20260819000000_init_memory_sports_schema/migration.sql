-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('Cards', 'Images', 'International Names', 'Names', 'Numbers', 'Words');

-- CreateEnum
CREATE TYPE "LogMode" AS ENUM ('train', 'rated', 'official');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('win', 'loss');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('manual', 'import', 'extension');

-- CreateTable
CREATE TABLE "OfficialTournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeLog" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "mode" "LogMode" NOT NULL DEFAULT 'train',
    "score" DOUBLE PRECISION,
    "time" DOUBLE PRECISION,
    "result" "MatchResult",
    "opponentName" TEXT,
    "officialTournamentId" TEXT,
    "officialRound" TEXT,
    "memo" TEXT,
    "source" "LogSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "goal" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficialTournament_date_idx" ON "OfficialTournament"("date");

-- CreateIndex
CREATE INDEX "PracticeLog_date_idx" ON "PracticeLog"("date");

-- CreateIndex
CREATE INDEX "PracticeLog_discipline_idx" ON "PracticeLog"("discipline");

-- CreateIndex
CREATE INDEX "PracticeLog_mode_idx" ON "PracticeLog"("mode");

-- CreateIndex
CREATE INDEX "PracticeLog_officialTournamentId_idx" ON "PracticeLog"("officialTournamentId");

-- CreateIndex
CREATE INDEX "Tournament_date_idx" ON "Tournament"("date");

-- AddForeignKey
ALTER TABLE "PracticeLog" ADD CONSTRAINT "PracticeLog_officialTournamentId_fkey" FOREIGN KEY ("officialTournamentId") REFERENCES "OfficialTournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
