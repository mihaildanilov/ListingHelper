import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../config/prisma.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class HealthModule {}
