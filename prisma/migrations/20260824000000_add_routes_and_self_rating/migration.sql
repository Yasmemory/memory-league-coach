-- CreateEnum
CREATE TYPE "SelfRating" AS ENUM ('good', 'neutral', 'bad');

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PracticeLog"
ADD COLUMN "routeId" TEXT,
ADD COLUMN "selfRating" "SelfRating";

-- CreateIndex
CREATE INDEX "Route_discipline_idx" ON "Route"("discipline");

-- CreateIndex
CREATE UNIQUE INDEX "Route_discipline_name_key" ON "Route"("discipline", "name");

-- CreateIndex
CREATE INDEX "PracticeLog_routeId_idx" ON "PracticeLog"("routeId");

-- AddForeignKey
ALTER TABLE "PracticeLog" ADD CONSTRAINT "PracticeLog_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
