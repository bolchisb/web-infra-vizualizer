#!/bin/bash

# Wait for Neo4j to be available before starting the app
echo "Waiting for Neo4j to start..."
timeout=120
counter=0
while ! nc -z neo4j 7687; do
    counter=$((counter + 1))
    if [ $counter -ge $timeout ]; then
        echo "Error: Failed to connect to Neo4j within $timeout seconds."
        exit 1
    fi
    echo "Waiting for Neo4j connection... ($counter/$timeout)"
    sleep 1
done

# Ensure Neo4j is not just accepting connections but also ready to process queries
echo "Neo4j is accepting connections, waiting for service to be fully ready..."
sleep 5  # Give Neo4j a bit more time to initialize completely

# Initialize database schema separately
echo "Initializing Neo4j schema..."
python /app/init_schema.py
INIT_RESULT=$?

# If initialization fails, retry in recovery mode
if [ $INIT_RESULT -ne 0 ]; then
    echo "First schema initialization attempt failed with exit code $INIT_RESULT"
    echo "Retrying schema initialization in recovery mode..."
    export NEO4J_SCHEMA_RECOVERY=true
    python /app/init_schema.py
    RECOVERY_RESULT=$?
    
    if [ $RECOVERY_RESULT -ne 0 ]; then
        echo "Warning: Neo4j schema recovery also failed with exit code $RECOVERY_RESULT"
        echo "The application will still try to start, but database operations may fail."
    else
        echo "Schema recovery completed successfully."
    fi
fi

echo "Neo4j is available, starting application with Gunicorn"

# Get number of workers based on CPU cores (2 * num_cores + 1 is a common formula)
NUM_WORKERS=$(( $(nproc) * 2 + 1 ))
NUM_WORKERS=${NUM_WORKERS:-3}  # Default to 3 workers if nproc fails

# Use Gunicorn with the right number of workers for production
exec gunicorn \
    --bind 0.0.0.0:5000 \
    --workers $NUM_WORKERS \
    --worker-class gthread \
    --threads 2 \
    --timeout 90 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --graceful-timeout 30 \
    --worker-tmp-dir /dev/shm \
    --preload \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    --capture-output \
    wsgi:app
