import { Module } from '@nestjs/common';
import { HebrewController } from './hebrew.controller';

@Module({
  controllers: [HebrewController],
})
export class HebrewModule {}
