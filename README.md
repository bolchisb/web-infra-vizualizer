# Network Infrastructure Visualizer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2.0%2B-blue)](https://docs.docker.com/compose/)
[![Neo4j](https://img.shields.io/badge/Neo4j-5.19-brightgreen)](https://neo4j.com/)
[![Flask](https://img.shields.io/badge/Flask-3.0.3-lightgrey)](https://flask.palletsprojects.com/)

A powerful web application for visualizing and managing network infrastructure with an intuitive, interactive interface. This tool helps network administrators and engineers to design, document, and share network topologies with ease.

![Network Infrastructure Visualizer Screenshot](https://raw.githubusercontent.com/bogdanradu/web-infra-vizualizer/main/static/img/screenshot.png)

## 🚀 Features

- **Interactive Network Visualization**: Drag, zoom, and explore your network topology with a responsive D3.js visualization
- **Device Management**: Create and manage various network objects (routers, switches, access points, servers, clients, NAS)
- **Relationship Mapping**: Define connections between network devices with custom relationship types (Ethernet, Fiber, Wireless, VPN Tunnel)
- **IP Management**: Assign and track IP addresses and netmasks for all network objects
- **Type-based Grouping**: Automatically arrange similar devices together for cleaner visualization
- **Custom Device Grouping**: Group devices together (e.g., racks, clusters) with visual containment and naming
- **Traffic Simulation**: Visualize network traffic with animated connections between devices
- **SVG Icon Integration**: Professional device icons with proper scaling and visual representation
- **Dockerized Deployment**: Easy setup with Docker and Docker Compose
- **Production-Ready**: Configured with Gunicorn WSGI server for production use
- **Graph Database**: Powerful Neo4j graph database with APOC plugin for advanced operations
- **Security Focused**: Non-root container execution, environment variable configuration
- **Health Monitoring**: Built-in container health checks for production reliability

## 💻 Tech Stack

- **Backend**: 
  - Python 3.11 with Flask framework
  - Neo4j graph database with APOC plugin
  - Gunicorn WSGI server for production deployment
  - RESTful API design with proper error handling
  - Environment-based configuration
- **Frontend**: 
  - Modern HTML5, CSS3, and JavaScript
  - D3.js for interactive network visualization
  - Responsive design for all device sizes
  - SVG device icons for crisp, scalable graphics
- **Infrastructure**:
  - Docker containerization for consistent deployment
  - Docker Compose for orchestration
  - Health checks and graceful startup dependencies
  - Volume persistence for database data

## 🚦 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0+)
- At least 2GB of available RAM for the Neo4j database

### Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/bogdanradu/web-infra-vizualizer.git
   cd web-infra-vizualizer
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. Start the application:

   ```bash
   docker-compose up -d
   ```

4. Access the application:
   - Web Interface: [http://localhost:5001](http://localhost:5001) (or your configured WEB_PORT)
   - Neo4j Browser: [http://localhost:7474](http://localhost:7474) (or your configured NEO4J_BROWSER_PORT)
   
5. Default Neo4j login:
   - Username: `neo4j` (or your configured NEO4J_USER)
   - Password: `password12345678` (or your configured NEO4J_PASSWORD)

### First-Time Setup

When you first access the application:

1. The database will be automatically initialized with required constraints
2. You can start adding network devices by clicking the "Add Node" button
3. Create relationships between devices using the "Add Connection" button

### Development Setup

For development purposes, you can run the application with hot reload:

```bash
# Start Neo4j container only
docker-compose up -d neo4j

# Install Python dependencies locally
pip install -r requirements.txt

# Run Flask in development mode
export FLASK_ENV=development
export FLASK_APP=app.py
export NEO4J_URI="bolt://localhost:7687"  # Use localhost instead of container name
python app.py
```

### Using Makefile

A Makefile is provided for common operations:

```bash
# Start all services in detached mode
make up

# Stop all services
make down

# View logs
make logs

# Rebuild containers
make build

# Start development mode (Neo4j in container, Flask locally)
make dev
```

## ⚙️ Configuration

The application uses environment variables for configuration. You can set these in a `.env` file in the project root.

| Variable                  | Description                              | Default                | Notes                                     |
|---------------------------|------------------------------------------|------------------------|-------------------------------------------|
| WEB_PORT                  | Port for web interface                   | 5001                   | External port mapped to container         |
| FLASK_ENV                 | Flask environment                        | production             | Use 'development' for debugging           |
| CORS_ORIGINS              | Allowed CORS origins                     | *                      | Restrict in production                    |
| NEO4J_VERSION             | Neo4j version                            | 5.19-community         | Version tag for Neo4j image               |
| NEO4J_BROWSER_PORT        | Neo4j browser port                       | 7474                   | External port for Neo4j web interface     |
| NEO4J_BOLT_PORT           | Neo4j bolt port                          | 7687                   | External port for Bolt protocol           |
| NEO4J_URI                 | Neo4j connection URI                     | bolt://neo4j:7687      | Use service name in Docker Compose        |
| NEO4J_USER                | Neo4j username                           | neo4j                  | Default Neo4j username                    |
| NEO4J_PASSWORD            | Neo4j password                           | password12345678       | Change this in production!                |
| NEO4J_APOC_EXPORT_ENABLED | Enable APOC export functionality         | true                   | For exporting graph data                  |
| NEO4J_APOC_IMPORT_ENABLED | Enable APOC import functionality         | true                   | For importing graph data                  |
| NEO4J_APOC_USE_CONFIG     | Use Neo4j config for APOC               | true                   | Uses Neo4j's configuration for APOC       |
| NEO4J_SECURITY_PROCEDURES | Neo4j allowed security procedures        | apoc.*                 | Controls access to Neo4j procedures       |

### Security Notes

For production deployment, it's strongly recommended to:

- Change the default Neo4j password
- Restrict CORS_ORIGINS to specific domains
- Use a reverse proxy (like Nginx) with HTTPS
- Configure proper authentication for the application

## 📖 Usage Guide

### Working with Network Objects

1. **Add Network Devices**:
   - Click the "Add Node" button to open the creation modal
   - Or select a device type from the sidebar and click the "Click to Place" button to position devices directly on the canvas
   - Available device types include routers, switches, access points, servers, clients, and internet gateways

2. **Create Connections**:
   - Click the "Add Connection" button
   - Select source and target devices and connection type
   - Click "Create" to establish the connection
   - Common connection types are supported (Ethernet, Fiber, Wireless, etc.)

3. **Manage Network Details**:
   - Click on any device to open the Object Inspector
   - Add or edit IP addresses and netmasks
   - View and modify other metadata (hostname, location, owner, etc.)
   - Delete unwanted objects

4. **Bulk Operations & Grouping**:
   - Shift+click to select multiple devices
   - Use keyboard shortcuts for common operations:
     - Del: Delete selected objects
     - Ctrl+C/Ctrl+V: Copy/paste selected objects
     - Ctrl+G: Group selected objects
   - Create named device groups:
     - Select multiple devices and click "Create Group"
     - Enter a name for the group (e.g., "Server Rack 1")
     - Groups appear as circular containers with the group name
     - Double-click a group to expand/collapse it

### Visualization Features

1. **Interactive Controls**:
   - Drag nodes to reposition them
   - Use mouse wheel to zoom in/out
   - Click and drag the canvas to pan the view
   - Double-click on empty space to reset the view

2. **Layout Options**:
   - Toggle "Group by Type" to automatically arrange similar devices
   - Adjust grouping strength with the slider
   - Devices automatically seek their optimal positions
   - Save and load custom layouts

3. **Visual Customization & Simulation**:
   - SVG icons represent different device types
   - Hover over connections to see relationship details
   - Click connections to edit their properties
   - Different line styles represent different connection types:
     - Solid lines for Ethernet connections
     - Dashed lines for Wireless connections
     - Dotted lines for Fiber connections
     - Colored tunnel effect for VPN connections
   - Toggle traffic simulation to visualize data flow with animated particles
   - Adjust simulation speed and traffic density

## 🔌 API Reference

| Endpoint                    | Method | Description                                      | Example Request Body |
|-----------------------------|--------|--------------------------------------------------|--------------------|
| `/network`                  | GET    | Retrieve all network objects and relationships   | N/A |
| `/objects`                  | GET    | List all network objects                         | N/A |
| `/objects`                  | POST   | Create a new network object                      | `{"name": "Core Router", "type": "router", "metadata": {"ip": "10.0.0.1", "netmask": "255.255.255.0"}}` |
| `/objects/:id`              | GET    | Get a specific network object                    | N/A |
| `/objects/:id`              | PATCH  | Update a network object                          | `{"name": "Updated Router Name", "metadata": {"location": "Data Center"}}` |
| `/objects/:id`              | DELETE | Delete a network object                          | N/A |
| `/relationships`            | GET    | List all relationships                           | N/A |
| `/relationships`            | POST   | Create a new relationship                        | `{"source_id": "node1_id", "target_id": "node2_id", "type": "CONNECTED_TO", "metadata": {"interface": "eth0"}}` |
| `/relationships/:id`        | DELETE | Delete a relationship                            | N/A |
| `/healthcheck`              | GET    | Check application health status                  | N/A |

### API Response Formats

#### Network Response

```json
{
  "nodes": [
    {
      "id": "node1",
      "name": "Core Router",
      "type": "router",
      "metadata": {
        "ip": "10.0.0.1",
        "netmask": "255.255.255.0"
      }
    }
  ],
  "links": [
    {
      "id": "rel1",
      "source": "node1",
      "target": "node2",
      "type": "CONNECTED_TO",
      "metadata": {
        "interface": "eth0"
      }
    }
  ]
}
```

## ☁️ Azure Deployment

This application can be deployed to Azure using several approaches. Here are best practices for deploying this infrastructure visualizer on Azure.

### Azure Container Apps

Azure Container Apps provides a managed environment for running containerized applications:

1. **Build and Push Docker Images**:
   ```bash
   # Login to Azure Container Registry
   az acr login --name <your-registry-name>
   
   # Build and tag images
   docker build -t <your-registry-name>.azurecr.io/infra-viz-web:latest .
   docker build -t <your-registry-name>.azurecr.io/infra-viz-neo4j:latest -f Dockerfile.neo4j .
   
   # Push images
   docker push <your-registry-name>.azurecr.io/infra-viz-web:latest
   docker push <your-registry-name>.azurecr.io/infra-viz-neo4j:latest
   ```

2. **Deploy with Azure Container Apps**:
   ```bash
   # Create environment
   az containerapp env create \
     --name infra-viz-env \
     --resource-group your-resource-group \
     --location eastus

   # Deploy Neo4j container
   az containerapp create \
     --name infra-viz-neo4j \
     --resource-group your-resource-group \
     --environment infra-viz-env \
     --image <your-registry-name>.azurecr.io/infra-viz-neo4j:latest \
     --target-port 7474 \
     --ingress external \
     --env-vars NEO4J_AUTH=neo4j/securepassword \
               NEO4J_apoc_export_file_enabled=true \
               NEO4J_apoc_import_file_enabled=true
               
   # Deploy web app container
   az containerapp create \
     --name infra-viz-web \
     --resource-group your-resource-group \
     --environment infra-viz-env \
     --image <your-registry-name>.azurecr.io/infra-viz-web:latest \
     --target-port 5000 \
     --ingress external \
     --env-vars NEO4J_URI=bolt://infra-viz-neo4j:7687 \
               NEO4J_USER=neo4j \
               NEO4J_PASSWORD=securepassword
   ```

### Azure App Service with Docker Compose

For deploying the multi-container setup with Docker Compose:

1. **Prepare your Docker Compose file for Azure**:
   - Create a new `docker-compose.azure.yml` file with production settings
   - Add persistent storage configurations for Azure File Share

2. **Deploy using Azure CLI**:
   ```bash
   # Create App Service plan
   az appservice plan create --name infra-viz-plan --resource-group your-resource-group --is-linux
   
   # Create and configure the Web App
   az webapp create --resource-group your-resource-group --plan infra-viz-plan --name your-app-name --multicontainer-config-type compose --multicontainer-config-file docker-compose.azure.yml
   ```

### Azure Security Best Practices

When deploying to Azure, follow these security guidelines:

1. **Use Azure Key Vault** for storing sensitive configuration like Neo4j credentials
2. **Enable Azure Application Insights** for monitoring
3. **Configure Azure Front Door** or **Application Gateway** for TLS termination and WAF protection
4. **Use managed identities** instead of embedding credentials
5. **Enable Azure Private Link** to access Neo4j without public exposure
6. **Configure regular backups** of Neo4j data to Azure Blob Storage

### Azure Networking Configuration

For secure network visualization:

1. **Virtual Network Integration**: Integrate your containers with an Azure Virtual Network
2. **Network Security Groups**: Configure NSGs to restrict access between components
3. **Private Endpoints**: Use private endpoints for database access

## 🛠️ Maintenance and Troubleshooting

### Common Issues

1. **Neo4j Connection Issues**:
   - Verify network connectivity between containers
   - Check Neo4j logs: `docker logs <neo4j-container-id>`
   - Ensure correct credentials in environment variables

2. **Visualization Not Loading**:
   - Check browser console for JavaScript errors
   - Verify API responses in Network tab
   - Ensure CORS settings are configured correctly

3. **Container Health Checks Failing**:
   - Check container logs: `docker logs <container-id>`
   - Inspect Neo4j plugin installation status
   - Verify memory and CPU resources

### Updating the Application

To update to a new version:

```bash
# Pull latest code
git pull

# Rebuild and restart containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the project's coding style and includes appropriate tests.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.