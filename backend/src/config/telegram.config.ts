import { Logger } from '@nestjs/common';

const logger = new Logger('TelegramConfig');
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!TELEGRAM_BOT_TOKEN) {
  logger.warn(
    'TELEGRAM_BOT_TOKEN is not set. Bot will not be able to send messages.',
  );
}
