# Production Deployment Guide

This document provides instructions for deploying the Real Estate Platform to a production environment.

## Prerequisites

- Docker and Docker Compose installed on the production server
- Domain name configured to point to your server
- Sufficient disk space for the database and backups

## Deployment Steps

### 1. Prepare the Environment

1. Clone the repository to your production server:

   ```bash
   git clone https://github.com/yourusername/RealEstatePlatform.git
   cd RealEstatePlatform/backend
   ```

2. Create a production environment file:

   ```bash
   cp .env.production .env
   ```

3. Edit the `.env` file and set secure values for all variables:

   ```bash
   # Set secure passwords
   POSTGRES_PASSWORD=your_secure_password

   # Set your actual Telegram Bot Token
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token

   # Set your domain for CORS
   CORS_ORIGINS=https://yourdomain.com

   # Set your database URL for local use
   DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public
   ```

### 2. Run the Deployment Script

1. Make the deployment script executable:

   ```bash
   chmod +x scripts/deploy.sh
   ```

2. Run the deployment script:
   ```bash
   ./scripts/deploy.sh
   ```

### 3. Set Up Monitoring

1. Make the monitoring script executable:

   ```bash
   chmod +x scripts/monitor.sh
   ```

2. Set up a system service or use a process manager like PM2 to keep the monitoring script running:
   ```bash
   pm2 start scripts/monitor.sh --name "real-estate-monitor"
   pm2 save
   pm2 startup
   ```

### 4. Set Up Regular Backups

The Docker Compose configuration includes a backup service that automatically backs up the database daily. You can customize the backup frequency in `backup-scripts/backup.sh`.

## Maintenance Tasks

### Database Backup and Restore

- Backup the database manually:

  ```bash
  docker-compose exec backup /scripts/backup.sh
  ```

- Restore from a backup:
  ```bash
  docker-compose exec backup /scripts/restore.sh latest
  ```

### Updating the Application

1. Pull the latest changes:

   ```bash
   git pull
   ```

2. Run the deployment script again:
   ```bash
   ./scripts/deploy.sh
   ```

### Logs and Monitoring

- View application logs:

  ```bash
  docker-compose logs -f app
  ```

- View database logs:

  ```bash
  docker-compose logs -f db
  ```

- Check the monitoring log:
  ```bash
  tail -f logs/monitoring.log
  ```

## Troubleshooting

### Common Issues

1. **Database connection errors:**

   - Check if the database container is running: `docker-compose ps`
   - Verify the database connection string in .env is correct

2. **Telegram bot not responding:**

   - Ensure the TELEGRAM_BOT_TOKEN is correct
   - Check the application logs for errors

3. **Container health checks failing:**
   - Check container logs: `docker-compose logs -f app`
   - Verify the health check endpoint is accessible

### Support

For additional support, please open an issue in the GitHub repository or contact the development team.
