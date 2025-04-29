#!/bin/bash

# Production deployment script
set -e

echo "🚀 Starting production deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found! Please create one from .env.example"
    exit 1
fi

# Create required directories
mkdir -p logs
mkdir -p backups
mkdir -p backup-scripts

# Ensure backup script is executable
if [ -f backup-scripts/backup.sh ]; then
    chmod +x backup-scripts/backup.sh
else
    echo "❌ Error: backup.sh not found!"
    exit 1
fi

# Pull latest changes if in a git repository
if [ -d .git ]; then
    echo "📥 Pulling latest changes from git..."
    git pull
fi

# Build and start the containers
echo "🏗️ Building and starting containers..."
docker-compose down
docker-compose build
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "🔄 Running database migrations..."
docker-compose exec app npx prisma migrate deploy

# Generate Prisma client
echo "🔧 Generating Prisma client..."
docker-compose exec app npx prisma generate

# Check if application is healthy
echo "🔍 Checking application health..."
sleep 5
HEALTH_CHECK=$(curl -s http://localhost:3000/health)
if [[ $HEALTH_CHECK == *"\"status\":\"ok\""* ]]; then
    echo "✅ Application is healthy!"
else
    echo "⚠️ Warning: Application may not be healthy. Health check response:"
    echo $HEALTH_CHECK
fi

echo "✅ Deployment completed successfully!" 