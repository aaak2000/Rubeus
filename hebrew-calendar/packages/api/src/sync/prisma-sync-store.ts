import type { CanonicalEvent } from '@hcal/sync';
import type { SyncMappingRecord, SyncStore } from '@hcal/sync';
import type { PrismaService } from '../prisma/prisma.service';
import { canonicalToEventData, eventToCanonical } from '../events/event.mapper';

/** {@link SyncStore} implementation backed by Prisma for a single calendar. */
export class PrismaSyncStore implements SyncStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarId: string,
  ) {}

  async listLocalEvents(): Promise<CanonicalEvent[]> {
    const events = await this.prisma.event.findMany({ where: { calendarId: this.calendarId } });
    return events.map(eventToCanonical);
  }

  async upsertLocalEvent(event: CanonicalEvent): Promise<void> {
    const data = canonicalToEventData(event);
    await this.prisma.event.upsert({
      where: { id: event.uid },
      create: { id: event.uid, calendarId: this.calendarId, ...data },
      update: data,
    });
  }

  async deleteLocalEvent(localUid: string): Promise<void> {
    await this.prisma.event.deleteMany({ where: { id: localUid, calendarId: this.calendarId } });
  }

  async listMappings(): Promise<SyncMappingRecord[]> {
    const rows = await this.prisma.syncMapping.findMany({ where: { calendarId: this.calendarId } });
    return rows.map((r) => ({
      localUid: r.localEventId,
      providerId: r.providerId,
      etag: r.etag ?? undefined,
      lastSyncedHash: r.lastSyncedHash ?? undefined,
    }));
  }

  async saveMapping(record: SyncMappingRecord): Promise<void> {
    await this.prisma.syncMapping.upsert({
      where: { calendarId_localEventId: { calendarId: this.calendarId, localEventId: record.localUid } },
      create: {
        calendarId: this.calendarId,
        localEventId: record.localUid,
        providerId: record.providerId,
        etag: record.etag,
        lastSyncedHash: record.lastSyncedHash,
      },
      update: { providerId: record.providerId, etag: record.etag, lastSyncedHash: record.lastSyncedHash },
    });
  }

  async deleteMapping(localUid: string): Promise<void> {
    await this.prisma.syncMapping.deleteMany({ where: { calendarId: this.calendarId, localEventId: localUid } });
  }

  async getSyncToken(): Promise<string | undefined> {
    const state = await this.prisma.syncState.findUnique({ where: { calendarId: this.calendarId } });
    return state?.token ?? undefined;
  }

  async saveSyncToken(token: string | undefined): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { calendarId: this.calendarId },
      create: { calendarId: this.calendarId, token },
      update: { token },
    });
  }
}
