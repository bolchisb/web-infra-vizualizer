# Network Infrastructure Visualizer

A web application for visualizing network infrastructure and relationships between network objects.

## Features

- Create and manage network objects (routers, switches, access points, etc.)
- Define relationships between network objects
- Interactive network visualization
- Dockerized deployment

## Tech Stack

- Backend: Python Flask with Neo4j graph database
- Frontend: HTML, CSS, JavaScript with D3.js for visualization

## Getting Started

### Prerequisites

- Docker and Docker Compose installed

### Setup and Run

1. Clone the repository
2. Navigate to the project directory
3. Configure environment variables (optional)

   ```bash
   cp .env.example .env
   # Edit .env file as needed
   ```

4. Run the application with Docker Compose:

   ```bash
   docker-compose up -d
   ```

5. Access the web interface at http://localhost:5001 (or the port specified in your .env file)
6. Access the Neo4j Browser at http://localhost:7474 (or the port specified in your .env file)

## Environment Variables

The application uses environment variables for configuration. You can set these in a `.env` file in the project root.

| Variable            | Description                     | Default                |
|---------------------|---------------------------------|------------------------|
| WEB_PORT            | Port for web interface          | 5001                   |
| FLASK_ENV           | Flask environment                | development            |
| NEO4J_VERSION       | Neo4j version                   | 5.19-community         |
| NEO4J_BROWSER_PORT  | Neo4j browser port              | 7474                   |
| NEO4J_BOLT_PORT     | Neo4j bolt port                 | 7687                   |
| NEO4J_USER          | Neo4j username                   | neo4j                  |
| NEO4J_PASSWORD      | Neo4j password                   | password12345678       |

## Usage

1. Add network objects using the "Add Node" button
2. Create connections between objects using the "Add Connection" button
3. Interact with the network visualization:
   - Drag nodes to reposition
   - Zoom in/out with mouse wheel
   - Click on objects to view details

## API Endpoints

- GET `/network` - Retrieve all network objects and relationships
- GET/POST `/objects` - Get all objects or create a new one
- GET/POST `/relationships` - Get all relationships or create a new one