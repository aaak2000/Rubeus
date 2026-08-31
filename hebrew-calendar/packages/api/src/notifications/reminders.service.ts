import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ReminderChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { YahrzeitsService, type YahrzeitView } from '../yahrzeits/yahrzeits.service';
import { MailService } from './mail.service';
import { PushService, type NotificationPayload } from './push.service';

/** One reminder that is due, with everything needed to deliver it. */
interface DueReminder {
  userId: string;
  email: string;
  yahrzeitId: string;
  hebrewYear: number;
  daysBefore: number;
  view: YahrzeitView;
}

/**
 * Finds yahrzeit reminders that have come due and sends them.
 *
 * Runs daily. Every send is recorded against (record, Hebrew year, offset,
 * channel), and that row is what makes the job idempotent: a restart
 * mid-run, a second instance, or a manual trigger cannot send the same
 * memorial reminder twice — which for this particular notification matters
 * more than for most.
 */
@Injectable()
export class RemindersService {
  private readonly log = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yahrzeits: YahrzeitsService,
    private readonly push: PushService,
    private readonly mail: MailService,
  ) {}

  /**
   * Early morning, so a "day before" reminder arrives with a day to act on it
   * rather than at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'yahrzeit-reminders' })
  async runDaily(): Promise<{ sent: number; skipped: number }> {
    return this.dispatch();
  }

  /** Which reminders are due right now, before any of them are sent. */
  async findDue(now = new Date()): Promise<DueReminder[]> {
    const users = await this.prisma.user.findMany({
      where: { yahrzeits: { some: {} } },
      select: { id: true, email: true },
    });

    const due: DueReminder[] = [];
    for (const user of users) {
      const views = await this.yahrzeits.list(user.id, now);
      for (const v of views) {
        if (!v.next) continue;
        for (const daysBefore of v.remindDaysBefore) {
          if (v.next.daysUntil !== daysBefore) continue;
          due.push({
            userId: user.id,
            email: user.email,
            yahrzeitId: v.id,
            hebrewYear: v.next.hebrewYear,
            daysBefore,
            view: v,
          });
        }
      }
    }
    return due;
  }

  async dispatch(now = new Date()): Promise<{ sent: number; skipped: number }> {
    const due = await this.findDue(now);
    let sent = 0;
    let skipped = 0;

    for (const r of due) {
      const payload = buildPayload(r);

      for (const channel of ['push', 'email'] as const) {
        if (channel === 'push' && !this.push.enabled) continue;
        if (channel === 'email' && !this.mail.enabled) continue;

        // Claim the send before making it. Losing the race here means another
        // worker already has it, which is exactly the outcome we want.
        if (!(await this.claim(r, channel))) {
          skipped++;
          continue;
        }
        const ok =
          channel === 'push'
            ? (await this.push.sendToUser(r.userId, payload)) > 0
            : await this.mail.send(r.email, payload.title, `${payload.body}\n`);

        if (ok) {
          sent++;
        } else {
          // Nothing went out, so release the claim and let the next run retry.
          await this.release(r, channel);
        }
      }
    }

    if (sent || skipped) this.log.log(`yahrzeit reminders: sent ${sent}, already sent ${skipped}`);
    return { sent, skipped };
  }

  /** True when this run took ownership of the send. */
  private async claim(r: DueReminder, channel: ReminderChannel): Promise<boolean> {
    try {
      await this.prisma.reminderDelivery.create({
        data: {
          yahrzeitId: r.yahrzeitId,
          hebrewYear: r.hebrewYear,
          daysBefore: r.daysBefore,
          channel,
        },
      });
      return true;
    } catch {
      // Unique constraint: someone already sent this one.
      return false;
    }
  }

  private async release(r: DueReminder, channel: ReminderChannel): Promise<void> {
    await this.prisma.reminderDelivery
      .deleteMany({
        where: {
          yahrzeitId: r.yahrzeitId,
          hebrewYear: r.hebrewYear,
          daysBefore: r.daysBefore,
          channel,
        },
      })
      .catch(() => undefined);
  }
}

function buildPayload(r: DueReminder): NotificationPayload {
  const { view } = r;
  const when =
    r.daysBefore === 0 ? 'היום' : r.daysBefore === 1 ? 'מחר' : `בעוד ${r.daysBefore} ימים`;
  const candle = view.next?.candleAt
    ? ` הדלקת נר בערב שלפני, בשעה ${view.next.candleAt}.`
    : '';
  return {
    title: `אזכרה ${when}: ${view.name}`,
    body: `${view.hebrewDateText}.${candle}`,
    url: '/reminders',
    // Same reminder, same tag — a duplicate replaces rather than stacks.
    tag: `yahrzeit:${r.yahrzeitId}:${r.hebrewYear}:${r.daysBefore}`,
  };
}
