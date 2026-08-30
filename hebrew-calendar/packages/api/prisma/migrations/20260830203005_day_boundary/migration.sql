-- CreateEnum
CREATE TYPE "DayBoundary" AS ENUM ('midnight', 'sunset');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "dayBoundary" "DayBoundary" NOT NULL DEFAULT 'sunset';
