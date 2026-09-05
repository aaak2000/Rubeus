import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdPlacement } from '@prisma/client';
import { AdsService } from './ads.service';

/**
 * Ad delivery.
 *
 * Deliberately unauthenticated and free of user identifiers: house ads are
 * chosen without profiling, which keeps the surface compatible with
 * non-personalized serving and avoids needing consent to show them at all.
 */
@ApiTags('ads')
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('config')
  config() {
    return this.ads.getConfig();
  }

  /** The next house ad for a placement, or `{ ad: null }` when none apply. */
  @Get('next')
  async next(@Query('placement') placement?: string) {
    const allowed = Object.values(AdPlacement) as string[];
    const requested = placement ?? AdPlacement.interstitial;
    if (!allowed.includes(requested)) {
      throw new BadRequestException(`placement must be one of: ${allowed.join(', ')}`);
    }
    return { ad: await this.ads.pick(requested as AdPlacement) };
  }

  @Post(':id/click')
  click(@Param('id') id: string) {
    return this.ads.registerClick(id);
  }
}
