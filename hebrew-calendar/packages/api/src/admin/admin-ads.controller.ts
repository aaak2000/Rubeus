import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdsService } from '../ads/ads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { CreateCampaignDto, UpdateCampaignDto } from './dto';

/**
 * Campaign management for the deployment's operators.
 *
 * House advertising is an approved-advertiser allowlist, which is only
 * workable if adding an advertiser does not mean opening a database client.
 * Guard order matters: `JwtAuthGuard` establishes who is asking before
 * `AdminGuard` decides whether they may.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/ads')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  /** Every campaign with its impressions, clicks and click rate. */
  @Get()
  list() {
    return this.ads.listCampaigns();
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.ads.createCampaign(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.ads.updateCampaign(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ads.deleteCampaign(id);
  }
}
