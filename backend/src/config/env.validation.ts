import { Logger } from '@nestjs/common';

export function validateEnv(): boolean {
  const logger = new Logger('EnvValidation');
  const requiredEnvVars = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];

  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    logger.error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
    return false;
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.startsWith('postgresql://')) {
    logger.error(
      'DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql://',
    );
    return false;
  }

  const port = process.env.PORT;
  if (port && isNaN(Number(port))) {
    logger.error('PORT must be a valid number');
    return false;
  }

  logger.log('Environment validation passed');
  return true;
}
