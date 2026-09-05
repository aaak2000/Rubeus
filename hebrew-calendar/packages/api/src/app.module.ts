import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AdsModule } from './ads/ads.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CalendarsModule } from './calendars/calendars.module';
import { CommonModule } from './common/common.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { HebrewModule } from './hebrew/hebrew.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OAuthModule } from './oauth/oauth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';
import { YahrzeitsModule } from './yahrzeits/yahrzeits.module';

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
    AdminModule,
    YahrzeitsModule,
    NotificationsModule,
    BillingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
