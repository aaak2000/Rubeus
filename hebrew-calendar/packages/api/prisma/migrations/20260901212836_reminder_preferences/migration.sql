-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "emailReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderHour" INTEGER NOT NULL DEFAULT 9;
