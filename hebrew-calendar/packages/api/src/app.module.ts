import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HebrewModule } from './hebrew/hebrew.module';
import { CalendarsModule } from './calendars/calendars.module';
import { EventsModule } from './events/events.module';
import { OAuthModule } from './oauth/oauth.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    HebrewModule,
    CalendarsModule,
    EventsModule,
    OAuthModule,
    SyncModule,
  ],
})
export class AppModule {}
