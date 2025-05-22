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
    --timeout 60 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    wsgi:app
