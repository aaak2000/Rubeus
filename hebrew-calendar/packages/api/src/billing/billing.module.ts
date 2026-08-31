import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaddleAdapter } from './paddle.adapter';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, PaddleAdapter],
  exports: [BillingService],
})
export class BillingModule {}
