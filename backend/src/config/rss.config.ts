import { Logger } from '@nestjs/common';

const logger = new Logger('RssConfig');

export const RSS_FEED_URL =
  process.env.RSS_FEED_URL ||
  'https://www.ss.lv/lv/real-estate/flats/riga/rss/';

export const RSS_CONFIG = {
  pollingIntervalMinutes: 5,
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds
  timeout: 10000, // 10 seconds
};

logger.log(`RSS feed URL: ${RSS_FEED_URL}`);
