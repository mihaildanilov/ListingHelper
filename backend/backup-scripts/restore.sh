#!/bin/bash

# Database restore script
set -e

# Configuration
BACKUP_DIR="/backups"
POSTGRES_HOST=${POSTGRES_HOST:-db}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-realestate-db}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-password}

# Check if a backup file was specified
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file_name> or 'latest' to use the latest backup"
    exit 1
fi

# Find the backup file
if [ "$1" = "latest" ]; then
    BACKUP_FILE="${BACKUP_DIR}/latest.sql.gz"
    if [ ! -f "$BACKUP_FILE" ]; then
        echo "No latest backup symlink found!"
        exit 1
    fi
else
    BACKUP_FILE="${BACKUP_DIR}/$1"
    if [ ! -f "$BACKUP_FILE" ]; then
        echo "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

echo "Restoring database from backup: $BACKUP_FILE"

# Check if the database already exists
DB_EXISTS=$(PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -lqt | cut -d \| -f 1 | grep -w ${POSTGRES_DB} | wc -l)

if [ "$DB_EXISTS" -eq "1" ]; then
    read -p "Database ${POSTGRES_DB} already exists. This will overwrite all data. Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        exit 1
    fi
    
    # Terminate all connections to the database
    echo "Terminating all connections to the database..."
    PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();"
    
    # Drop and recreate the database
    echo "Dropping and recreating database ${POSTGRES_DB}..."
    PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -c "DROP DATABASE \"${POSTGRES_DB}\";"
    PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -c "CREATE DATABASE \"${POSTGRES_DB}\";"
fi

# Restore the database
echo "Restoring database from backup..."
gunzip -c ${BACKUP_FILE} | PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DB}

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "Database restore completed successfully!"
else
    echo "Database restore failed!"
    exit 1
fi 