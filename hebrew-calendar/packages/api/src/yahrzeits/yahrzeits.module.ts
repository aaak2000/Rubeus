import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { YahrzeitsController } from './yahrzeits.controller';
import { YahrzeitsService } from './yahrzeits.service';

@Module({
  imports: [PrismaModule],
  controllers: [YahrzeitsController],
  providers: [YahrzeitsService],
  exports: [YahrzeitsService],
})
export class YahrzeitsModule {}
