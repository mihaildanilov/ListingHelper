import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;
  private readonly listingErrorLogger: winston.Logger;
  private readonly logsDir = path.join(process.cwd(), 'logs');

  constructor() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'real-estate-bot' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const timestampStr = timestamp as string;
              const levelStr = level;
              const messageStr = message as string;
              const metaStr = Object.keys(meta).length
                ? JSON.stringify(meta)
                : '';
              return `${timestampStr} [${levelStr}]: ${messageStr} ${metaStr}`;
            }),
          ),
        }),
        new DailyRotateFile({
          filename: 'application-%DATE%.log',
          dirname: this.logsDir,
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });

    this.listingErrorLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'listings-error-logger' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const timestampStr = timestamp as string;
              const levelStr = level;
              const messageStr = message as string;
              const metaStr = Object.keys(meta).length
                ? JSON.stringify(meta)
                : '';
              return `${timestampStr} [${levelStr}]: ${messageStr} ${metaStr}`;
            }),
          ),
        }),
        new DailyRotateFile({
          filename: 'failed-listings-%DATE%.log',
          dirname: this.logsDir,
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  /**
   * Log a failed listing for monitoring purposes
   */
  logFailedListing(data: {
    listingId?: string;
    title?: string;
    link: string;
    error: string;
    rawData?: string;
    failureType: 'PARSING_ERROR' | 'INVALID_DATA' | 'NOTIFICATION_ERROR';
    additionalInfo?: Record<string, unknown>;
  }) {
    this.listingErrorLogger.error('Failed listing', data);
  }
}
