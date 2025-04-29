import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../config/prisma.service';
import { RssService } from '../rss/rss.service';
import { TelegramService } from '../telegram/telegram.service';
import { Listing, Subscription } from '@prisma/client';
import { ListingWithOptionalData } from '../types/listing.types';
import { RssItem } from '../types/rss.types';
import { Prisma } from '@prisma/client';
import { FailedListingService } from '../config/failed-listing.service';

@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rssService: RssService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    private readonly failedListingService: FailedListingService,
  ) {}

  /**
   * Runs every 5 minutes to fetch the RSS feed, parse items,
   * store any new listings, then match them to user subscriptions
   * and send them out if relevant.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollAndNotify(): Promise<void> {
    this.logger.log('Polling RSS feed...');

    const items = await this.rssService.fetchRssItems();

    if (items.length === 0) {
      this.logger.warn('No items found in RSS feed');
      return;
    }

    this.logger.log(`Fetched ${items.length} RSS items`);

    const storedCount = await this.rssService.storeListings(items);
    this.logger.log(`Stored ${storedCount} listings`);

    const recentListings = await this.prisma.listing.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000),
        },
      },
    });

    this.logger.log(
      `Found ${recentListings.length} recent listings to process`,
    );

    await this.matchAndNotify(recentListings);
  }

  /**
   * For each listing, find matching subscriptions and notify users
   */
  private async matchAndNotify(listings: Listing[]): Promise<void> {
    for (const listing of listings) {
      if (!listing.priceValue || listing.priceValue <= 0) {
        this.logger.debug(
          `Skipping listing ${listing.id} - invalid price value: ${listing.priceValue}`,
        );

        await this.failedListingService.logFailedListing({
          listingId: listing.id,
          title: listing.title,
          link: listing.link,
          error: `Invalid price value: ${listing.priceValue}`,
          failureType: 'INVALID_DATA',
          additionalInfo: {
            price: listing.price,
            priceValue: listing.priceValue,
          },
        });
        continue;
      }

      const subscriptions = await this.prisma.subscription.findMany();

      for (const subscription of subscriptions) {
        if (!this.matchesSubscription(listing, subscription)) {
          continue;
        }

        const alreadySent = await this.prisma.sentListing.findUnique({
          where: {
            userChatId_listingId: {
              userChatId: subscription.userChatId,
              listingId: listing.id,
            },
          },
        });

        if (alreadySent) {
          continue;
        }

        try {
          const messageText = this.buildListingMessage(listing);
          await this.telegramService.bot.api.sendMessage(
            subscription.userChatId,
            messageText,
          );

          await this.prisma.sentListing.create({
            data: {
              userChatId: subscription.userChatId,
              listingId: listing.id,
            },
          });

          this.logger.log(
            `Sent listing ${listing.id} to user ${subscription.userChatId}`,
          );
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to send listing ${listing.id} to user ${subscription.userChatId}: ${errorMessage}`,
          );

          await this.failedListingService.logFailedListing({
            listingId: listing.id,
            title: listing.title,
            link: listing.link,
            error: `Failed to send notification: ${errorMessage}`,
            failureType: 'NOTIFICATION_ERROR',
            additionalInfo: {
              userChatId: subscription.userChatId,
              subscriptionId: subscription.id,
            },
          });
        }
      }
    }
  }

  /**
   * Return true if the listing matches the subscription's criteria
   */
  private matchesSubscription(
    listing: Listing,
    subscription: Subscription,
  ): boolean {
    if (listing.category !== subscription.category) {
      return false;
    }

    if (subscription.district && listing.district !== subscription.district) {
      return false;
    }

    if (
      subscription.priceMin &&
      listing.priceValue &&
      listing.priceValue < subscription.priceMin
    ) {
      return false;
    }
    if (
      subscription.priceMax &&
      listing.priceValue &&
      listing.priceValue > subscription.priceMax
    ) {
      return false;
    }

    if (
      subscription.roomsMin &&
      listing.rooms &&
      listing.rooms < subscription.roomsMin
    ) {
      return false;
    }
    if (
      subscription.roomsMax &&
      listing.rooms &&
      listing.rooms > subscription.roomsMax
    ) {
      return false;
    }

    if (
      subscription.areaMin &&
      listing.area &&
      listing.area < subscription.areaMin
    ) {
      return false;
    }
    if (
      subscription.areaMax &&
      listing.area &&
      listing.area > subscription.areaMax
    ) {
      return false;
    }
    return true;
  }

  /**
   * Builds a formatted message string for a listing
   */
  public buildListingMessage(listing: ListingWithOptionalData): string {
    const price = listing.price ? `${listing.price}` : 'Contact for price';
    const pricePerM2 = listing.pricePerM2
      ? `\nPrice per m²: ${listing.pricePerM2} €/m²`
      : '';

    const floor = listing.floor ? `\nFloor: ${listing.floor}` : '';
    const rooms = listing.rooms ? `${listing.rooms}` : '';
    const area = listing.area ? `${listing.area} m²` : '';
    const district = listing.district || '';

    const isCiti = listing.title?.includes('Citi') || false;
    const isCommercial = isCiti || listing.category === 'commercial';

    const icon = isCommercial ? '🏢' : '🏠';

    let message = `${icon} New Listing Alert! ${icon}

Title: ${listing.title}
Price: ${price}${pricePerM2}`;

    if (rooms) message += `\nRooms: ${rooms}`;
    if (area) message += `\nArea: ${area}`;
    if (floor) message += floor;
    if (district) message += `\nDistrict: ${district}`;

    if (isCommercial) {
      message += `\nProperty Type: Commercial`;
    }

    message += `\n\n🔗 ${listing.link}`;

    return message;
  }

  /**
   * Returns the last available listing that matches the given filters
   * First checks RSS feed for new listings, then checks database
   * @param filters - Filter criteria for the listing
   * @returns The most recent matching listing or null if none found
   */
  async getLastAvailableListing(filters: {
    category?: string;
    district?: string;
    priceMin?: number;
    priceMax?: number;
    roomsMin?: number;
    roomsMax?: number;
    areaMin?: number;
    areaMax?: number;
  }): Promise<Listing | null> {
    this.logger.log('Checking RSS feed for new listings...');

    let rssItems: RssItem[] = [];
    if (filters.district) {
      rssItems = await this.rssService.fetchRssItemsByDistrict(
        filters.district,
        filters.priceMin,
        filters.priceMax,
        filters.roomsMin,
        filters.roomsMax,
      );
    } else {
      rssItems = await this.rssService.fetchRssItems();
    }

    if (rssItems.length > 0) {
      await this.rssService.storeListings(rssItems);
      this.logger.log(`Stored ${rssItems.length} new listings from RSS feed`);
    }

    const where: Prisma.ListingWhereInput = {};

    where.priceValue = { not: null };

    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.district) {
      where.district = filters.district;
    }
    if (filters.priceMin || filters.priceMax) {
      where.priceValue = {
        ...where.priceValue,
        gte: filters.priceMin,
        lte: filters.priceMax,
      };
    }
    if (filters.roomsMin || filters.roomsMax) {
      where.rooms = {
        gte: filters.roomsMin,
        lte: filters.roomsMax,
      };
    }
    if (filters.areaMin || filters.areaMax) {
      where.area = {
        gte: filters.areaMin,
        lte: filters.areaMax,
      };
    }

    const listing = await this.prisma.listing.findFirst({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return listing;
  }
}
