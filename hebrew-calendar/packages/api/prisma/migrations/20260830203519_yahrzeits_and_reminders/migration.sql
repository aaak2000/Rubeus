-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('inapp', 'push', 'email');

-- CreateTable
CREATE TABLE "Yahrzeit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hebrewName" TEXT,
    "relation" TEXT,
    "deathDate" DATE NOT NULL,
    "afterSunset" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "remindDaysBefore" INTEGER[] DEFAULT ARRAY[7, 1, 0]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Yahrzeit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "yahrzeitId" TEXT NOT NULL,
    "hebrewYear" INTEGER NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Yahrzeit_userId_idx" ON "Yahrzeit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_sentAt_idx" ON "ReminderDelivery"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDelivery_yahrzeitId_hebrewYear_daysBefore_channel_key" ON "ReminderDelivery"("yahrzeitId", "hebrewYear", "daysBefore", "channel");

-- AddForeignKey
ALTER TABLE "Yahrzeit" ADD CONSTRAINT "Yahrzeit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_yahrzeitId_fkey" FOREIGN KEY ("yahrzeitId") REFERENCES "Yahrzeit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
