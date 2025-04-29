import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    if (!validateEnv()) {
      logger.error('Environment validation failed. Exiting...');
      process.exit(1);
    }

    const app = await NestFactory.create(AppModule);
    const port = process.env.PORT ?? 3000;

    app.enableCors({
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });

    const gracefulShutdown = async (signal: string) => {
      logger.log(`${signal} received, shutting down gracefully`);
      try {
        await app.close();
        logger.log('Application closed successfully');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => {
      void gracefulShutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void gracefulShutdown('SIGINT');
    });

    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}`);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error during bootstrap: ${errorMessage}`);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    `Unhandled bootstrap error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
