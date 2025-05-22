#!/bin/bash

# Create plugins directory if it doesn't exist
mkdir -p plugins

# Set Neo4j version from .env or use default
if [ -f .env ]; then
  source .env
fi

NEO4J_VERSION=${NEO4J_VERSION:-5.19}
APOC_VERSION=${NEO4J_VERSION}

echo "Downloading APOC plugin for Neo4j ${NEO4J_VERSION}..."
DOWNLOAD_URL="https://github.com/neo4j/apoc/releases/download/${APOC_VERSION}/apoc-${APOC_VERSION}-core.jar"

echo "Downloading from ${DOWNLOAD_URL}"
curl -L -o "plugins/apoc-${APOC_VERSION}-core.jar" "${DOWNLOAD_URL}"

if [ $? -eq 0 ]; then
  echo "Downloaded APOC plugin successfully to plugins/apoc-${APOC_VERSION}-core.jar"
else
  echo "Failed to download APOC plugin. Please check if the version exists at: ${DOWNLOAD_URL}"
  echo "You may need to manually download the APOC plugin compatible with your Neo4j version"
  echo "from https://github.com/neo4j/apoc/releases"
fi
