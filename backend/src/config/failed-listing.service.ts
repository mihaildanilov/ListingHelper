import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { FailedListing, Prisma } from '@prisma/client';

@Injectable()
export class FailedListingService {
  private readonly logger = new Logger(FailedListingService.name);
  private readonly logsDir = path.join(process.cwd(), 'logs');
  private readonly logFilePath = path.join(this.logsDir, 'failed-listings.log');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Log a failed listing and save it to the database
   */
  async logFailedListing(data: {
    listingId?: string;
    title?: string;
    link: string;
    error: string;
    rawData?: string;
    failureType: 'PARSING_ERROR' | 'INVALID_DATA' | 'NOTIFICATION_ERROR';
    additionalInfo?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const createData: Prisma.FailedListingCreateInput = {
        listingId: data.listingId,
        title: data.title,
        link: data.link,
        error: data.error,
        rawData: data.rawData,
        failureType: data.failureType,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        additionalInfo: data.additionalInfo as any,
      };

      await this.prisma.failedListing.create({
        data: createData,
      });

      this.logger.error(
        `Failed listing: ${data.failureType} - ${data.link} - ${data.error}`,
      );

      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...data,
      });
      fs.appendFileSync(this.logFilePath, logEntry + '\n');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error logging failed listing: ${errorMessage}`,
        errorStack,
      );
    }
  }

  /**
   * Get all failed listings, optionally filtered by type and resolution status
   */
  async getFailedListings(options?: {
    failureType?: 'PARSING_ERROR' | 'INVALID_DATA' | 'NOTIFICATION_ERROR';
    resolved?: boolean;
    limit?: number;
  }): Promise<FailedListing[]> {
    const { failureType, resolved = false, limit = 50 } = options || {};

    const where: Prisma.FailedListingWhereInput = {
      ...(failureType ? { failureType } : {}),
      resolved,
    };

    const failedListings = await this.prisma.failedListing.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return failedListings;
  }

  /**
   * Mark a failed listing as resolved
   */
  async markAsResolved(id: string): Promise<void> {
    const updateData: Prisma.FailedListingUpdateInput = {
      resolved: true,
      resolvedAt: new Date(),
    };

    await this.prisma.failedListing.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Get stats about failed listings
   */
  async getFailedListingStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    unresolved: number;
    last24Hours: number;
  }> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const total = await this.prisma.failedListing.count();

    const byParsingError = await this.prisma.failedListing.count({
      where: { failureType: 'PARSING_ERROR' },
    });

    const byInvalidData = await this.prisma.failedListing.count({
      where: { failureType: 'INVALID_DATA' },
    });

    const byNotificationError = await this.prisma.failedListing.count({
      where: { failureType: 'NOTIFICATION_ERROR' },
    });

    const unresolved = await this.prisma.failedListing.count({
      where: { resolved: false },
    });

    const last24Hours = await this.prisma.failedListing.count({
      where: {
        createdAt: { gte: yesterday },
      },
    });

    return {
      total,
      byType: {
        PARSING_ERROR: byParsingError,
        INVALID_DATA: byInvalidData,
        NOTIFICATION_ERROR: byNotificationError,
      },
      unresolved,
      last24Hours,
    };
  }
}
