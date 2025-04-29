#!/bin/sh

# Backup script for PostgreSQL database
set -e

# Configuration
BACKUP_DIR="/backups"
POSTGRES_HOST=${POSTGRES_HOST:-db}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-realestate-db}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-password}
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p ${BACKUP_DIR}

# Generate backup filename with date
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILENAME="${BACKUP_DIR}/${POSTGRES_DB}_${DATE}.sql.gz"

echo "Starting backup of ${POSTGRES_DB} on ${DATE}"

# Perform backup
PGPASSWORD=${POSTGRES_PASSWORD} pg_dump -h ${POSTGRES_HOST} -U ${POSTGRES_USER} ${POSTGRES_DB} | gzip > ${BACKUP_FILENAME}

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: ${BACKUP_FILENAME}"
    # Create a symlink to the latest backup
    ln -sf ${BACKUP_FILENAME} ${BACKUP_DIR}/latest.sql.gz
else
    echo "Backup failed!"
    exit 1
fi

# Clean up old backups (keep only the last RETENTION_DAYS days)
echo "Cleaning up backups older than ${RETENTION_DAYS} days"
find ${BACKUP_DIR} -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# Keep this script running to maintain the container
echo "Backup completed. Sleeping until next scheduled backup."
# Sleep for 24 hours before next backup
sleep 86400 