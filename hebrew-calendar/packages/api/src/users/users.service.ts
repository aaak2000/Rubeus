import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        settings: true,
        connections: { select: { id: true, provider: true, accountEmail: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Delete the account and everything hanging off it.
   *
   * Every relation is declared `onDelete: Cascade`, so removing the user row
   * takes settings, calendars, events, provider connections, refresh tokens,
   * push subscriptions and yahrzeits with it. Anything that survived would be
   * data the user believes is gone, which is worse than never offering this.
   */
  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }
}
