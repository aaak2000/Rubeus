import {
  CalDavAdapter,
  type CalendarProvider,
  GoogleAdapter,
  IcsCodec,
  MicrosoftAdapter,
  type SyncDirection,
  SyncEngine,
  type SyncResult,
} from '@hcal/sync';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Calendar, ProviderConnection } from '@prisma/client';
import { CalendarsService } from '../calendars/calendars.service';
import { TOKEN_CRYPTO } from '../common/common.module';
import { TokenCrypto } from '../common/token-crypto';
import { eventToCanonical } from '../events/event.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaSyncStore } from './prisma-sync-store';
import { ConnectionTokenSource } from './provider-tokens';

@Injectable()
export class SyncService {
  private readonly ics = new IcsCodec();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly calendars: CalendarsService,
    @Inject(TOKEN_CRYPTO) private readonly crypto: TokenCrypto,
  ) {}

  /** Run a sync of one calendar against its linked provider. */
  async run(
    userId: string,
    calendarId: string,
    direction: SyncDirection = 'two-way',
  ): Promise<SyncResult> {
    const calendar = await this.calendars.ensureOwned(userId, calendarId);
    if (!calendar.connectionId)
      throw new BadRequestException('Calendar is not linked to a provider');
    const connection = await this.prisma.providerConnection.findUnique({
      where: { id: calendar.connectionId },
    });
    if (!connection) throw new BadRequestException('Provider connection missing');

    const provider = this.buildProvider(calendar, connection);
    const store = new PrismaSyncStore(this.prisma, calendarId);
    return new SyncEngine(store, provider).sync(direction);
  }

  private buildProvider(calendar: Calendar, connection: ProviderConnection): CalendarProvider {
    if (connection.provider === 'caldav') {
      if (!connection.caldavUrl || !connection.accountEmail) {
        throw new BadRequestException('Incomplete CalDAV connection');
      }
      return new CalDavAdapter({
        collectionUrl: connection.caldavUrl,
        username: connection.accountEmail,
        password: this.crypto.decrypt(connection.accessTokenEnc),
      });
    }
    const tokens = new ConnectionTokenSource(this.prisma, this.config, this.crypto, connection);
    if (connection.provider === 'google') {
      return new GoogleAdapter(tokens, calendar.providerCalendarId ?? 'primary');
    }
    return new MicrosoftAdapter(tokens, calendar.providerCalendarId ?? undefined);
  }

  /** Export a calendar's events as an ICS document. */
  async exportIcs(userId: string, calendarId: string): Promise<string> {
    const calendar = await this.calendars.ensureOwned(userId, calendarId);
    const events = await this.prisma.event.findMany({ where: { calendarId } });
    return this.ics.export(events.map(eventToCanonical), calendar.name);
  }

  /** Import events from an ICS document into a calendar. */
  async importIcs(
    userId: string,
    calendarId: string,
    icsText: string,
  ): Promise<{ imported: number }> {
    await this.calendars.ensureOwned(userId, calendarId);
    const events = this.ics.import(icsText);
    for (const e of events) {
      await this.prisma.event.create({
        data: {
          calendarId,
          title: e.title,
          description: e.description,
          location: e.location,
          startUtc: new Date(e.start),
          endUtc: new Date(e.end),
          allDay: e.allDay ?? false,
          rrule: e.rrule,
        },
      });
    }
    return { imported: events.length };
  }
}
