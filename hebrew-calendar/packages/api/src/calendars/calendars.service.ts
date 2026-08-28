import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.calendar.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** Fetch a calendar the user owns, or throw. */
  async ensureOwned(userId: string, calendarId: string) {
    const cal = await this.prisma.calendar.findUnique({ where: { id: calendarId } });
    if (!cal) throw new NotFoundException('Calendar not found');
    if (cal.userId !== userId) throw new ForbiddenException('Not your calendar');
    return cal;
  }

  create(userId: string, data: { name: string; color?: string }) {
    return this.prisma.calendar.create({ data: { userId, name: data.name, color: data.color } });
  }

  async update(userId: string, id: string, data: { name?: string; color?: string }) {
    await this.ensureOwned(userId, id);
    return this.prisma.calendar.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const cal = await this.ensureOwned(userId, id);
    if (cal.isDefault) throw new ForbiddenException('Cannot delete the default calendar');
    await this.prisma.calendar.delete({ where: { id } });
    return { deleted: true };
  }
}
