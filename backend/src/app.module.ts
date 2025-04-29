import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './config/prisma.service';
import { PollingService } from './polling/polling.service';
import { RssService } from './rss/rss.service';
import { TelegramService } from './telegram/telegram.service';
import { UserService } from './user/user.service';
import { HealthModule } from './health/health.module';
import { FailedListingService } from './config/failed-listing.service';

@Module({
  imports: [ScheduleModule.forRoot(), HealthModule],
  controllers: [],
  providers: [
    PrismaService,
    PollingService,
    RssService,
    TelegramService,
    UserService,
    FailedListingService,
  ],
})
export class AppModule {}
