import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HebrewModule } from './hebrew/hebrew.module';
import { CalendarsModule } from './calendars/calendars.module';
import { EventsModule } from './events/events.module';
import { OAuthModule } from './oauth/oauth.module';
import { SyncModule } from './sync/sync.module';
import { HealthModule } from './health/health.module';
import { AdsModule } from './ads/ads.module';
import { YahrzeitsModule } from './yahrzeits/yahrzeits.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';

// Per-IP ceiling for ordinary requests. Configurable for the same reason the
// auth limit is: an automated suite drives every page from one address, and a
// production-shaped limit throttles the run rather than an abuser.
const REQUESTS_PER_MINUTE = Number(process.env.RATE_LIMIT ?? 120);

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // Baseline abuse protection; auth routes tighten this further.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: REQUESTS_PER_MINUTE }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    HebrewModule,
    CalendarsModule,
    EventsModule,
    OAuthModule,
    SyncModule,
    HealthModule,
    AdsModule,
    YahrzeitsModule,
    NotificationsModule,
    BillingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
