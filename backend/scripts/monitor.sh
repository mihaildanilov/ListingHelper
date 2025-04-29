#!/bin/bash

# Monitoring and auto-restart script for production
set -e

# Configuration
APP_CONTAINER="realestate-platform-app"
DB_CONTAINER="realestate-platform-db"
MAX_MEMORY_USAGE=80  # Percentage
MAX_CPU_USAGE=90     # Percentage
LOG_FILE="logs/monitoring.log"
SLACK_WEBHOOK=${SLACK_WEBHOOK:-""}

# Create log directory if it doesn't exist
mkdir -p $(dirname $LOG_FILE)

# Log with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a $LOG_FILE
}

# Send alert
send_alert() {
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 RealEstate Platform Alert: $1\"}" \
            $SLACK_WEBHOOK
    fi
    log "ALERT: $1"
}

# Check container status
check_container() {
    CONTAINER=$1
    RUNNING=$(docker inspect --format='{{.State.Running}}' $CONTAINER 2>/dev/null || echo "false")
    
    if [ "$RUNNING" != "true" ]; then
        send_alert "$CONTAINER is not running! Attempting to restart..."
        docker start $CONTAINER
        sleep 10
        
        # Check if restart was successful
        RUNNING_AFTER=$(docker inspect --format='{{.State.Running}}' $CONTAINER 2>/dev/null || echo "false")
        if [ "$RUNNING_AFTER" != "true" ]; then
            send_alert "Failed to restart $CONTAINER! Manual intervention required."
        else
            send_alert "$CONTAINER successfully restarted."
        fi
    fi
}

# Check API health
check_health() {
    HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
    
    if [ "$HEALTH_CHECK" != "200" ]; then
        send_alert "Health check failed with status $HEALTH_CHECK! Restarting application..."
        docker restart $APP_CONTAINER
        sleep 10
        
        # Check if restart fixed the issue
        HEALTH_CHECK_AFTER=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
        if [ "$HEALTH_CHECK_AFTER" != "200" ]; then
            send_alert "Health check still failing after restart with status $HEALTH_CHECK_AFTER! Manual intervention required."
        else
            send_alert "Application successfully restarted. Health check now passing."
        fi
    fi
}

# Check resource usage
check_resources() {
    # Check memory usage
    MEMORY_USAGE=$(docker stats $APP_CONTAINER --no-stream --format "{{.MemPerc}}" | sed 's/%//')
    
    if (( $(echo "$MEMORY_USAGE > $MAX_MEMORY_USAGE" | bc -l) )); then
        send_alert "Memory usage is high: ${MEMORY_USAGE}%! Restarting application..."
        docker restart $APP_CONTAINER
    fi
    
    # Check CPU usage
    CPU_USAGE=$(docker stats $APP_CONTAINER --no-stream --format "{{.CPUPerc}}" | sed 's/%//')
    
    if (( $(echo "$CPU_USAGE > $MAX_CPU_USAGE" | bc -l) )); then
        send_alert "CPU usage is high: ${CPU_USAGE}%! Restarting application..."
        docker restart $APP_CONTAINER
    fi
}

# Main monitoring loop
log "Starting monitoring service"

while true; do
    # Check container status
    check_container $APP_CONTAINER
    check_container $DB_CONTAINER
    
    # Check API health
    check_health
    
    # Check resource usage
    check_resources
    
    # Sleep for 5 minutes
    sleep 300
done 