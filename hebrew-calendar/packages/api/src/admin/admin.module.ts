import { Module } from '@nestjs/common';
import { AdsModule } from '../ads/ads.module';
import { AdminAdsController } from './admin-ads.controller';

@Module({
  imports: [AdsModule],
  controllers: [AdminAdsController],
})
export class AdminModule {}
