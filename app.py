from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from neo4j import GraphDatabase
import uuid
import os
import datetime
import time
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Create Flask application with proper configuration
app = Flask(__name__, static_folder='static')
app.config['PROPAGATE_EXCEPTIONS'] = True
app.config['JSON_SORT_KEYS'] = False

# Configure CORS properly for production
CORS(app, resources={r"/*": {"origins": os.getenv("CORS_ORIGINS", "*")}})

# Neo4j connection - more secure with required environment variables
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password12345678")

def create_db_driver():
    """Create Neo4j driver with connection pooling and appropriate timeout settings"""
    return GraphDatabase.driver(
        NEO4J_URI, 
        auth=(NEO4J_USER, NEO4J_PASSWORD),
        max_connection_lifetime=3600,  # 1 hour
        max_connection_pool_size=50,
        connection_acquisition_timeout=60  # Wait up to 60 seconds for a connection
    )

# Create the global driver instance
driver = create_db_driver()

def get_db_session():
    """Get a database session with optional retry on failure"""
    max_retries = 3
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            return driver.session()
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Database connection failed (attempt {attempt+1}/{max_retries}): {e}")
                time.sleep(retry_delay)
                # Exponential backoff
                retry_delay = retry_delay * 2
            else:
                print(f"Failed to connect to database after {max_retries} attempts: {e}")
                raise

# Initialize Neo4j with constraints - this is now primarily used only for development mode
# Production initialization is handled by init_schema.py
def init_db():
    """
    Initialize the database with required constraints.
    This function is primarily used for development mode or as a fallback.
    Production initialization is handled by init_schema.py which is more robust.
    """
    print("Initializing database from app.py (development mode)")
    try:
        with get_db_session() as session:
            # Check if we can run basic queries first
            session.run("RETURN 1 as n").single()
            
            # Check Neo4j version to determine appropriate constraint syntax
            neo4j_version = "unknown"
            try:
                result = session.run("CALL dbms.components() YIELD name, versions WHERE name = 'Neo4j Kernel' RETURN versions[0] as version")
                record = result.single()
                if record:
                    neo4j_version = record["version"]
                print(f"Connected to Neo4j version: {neo4j_version}")
            except Exception:
                print("Could not determine Neo4j version, using default constraint syntax")
            
            # Then check if constraints exist before creating them
            try:
                # Get existing constraints - handle different Neo4j versions
                existing_constraints = []
                try:
                    constraints_result = session.run("SHOW CONSTRAINTS")
                    for record in constraints_result:
                        if "name" in record:
                            existing_constraints.append(record["name"].lower())
                except Exception:
                    try:
                        # Alternative for older Neo4j versions
                        constraints_result = session.run("CALL db.constraints()")
                        existing_constraints = [str(record).lower() for record in constraints_result]
                    except Exception as e2:
                        print(f"Could not get constraints using fallback method: {e2}")
                
                print(f"Found existing constraints: {existing_constraints}")
                
                # Use explicitly named constraints to avoid duplicates
                # Handle different Neo4j version syntaxes
                modern_syntax = not (neo4j_version.startswith("3.") or neo4j_version.startswith("4."))
                
                if modern_syntax:
                    # Neo4j 5.x syntax
                    if not any("networkobject_id_unique" in constraint for constraint in existing_constraints):
                        print("Creating networkobject constraint (Neo4j 5.x syntax)")
                        session.run("CREATE CONSTRAINT networkobject_id_unique IF NOT EXISTS FOR (o:NetworkObject) REQUIRE o.id IS UNIQUE")
                    
                    if not any("devicegroup_id_unique" in constraint for constraint in existing_constraints):
                        print("Creating devicegroup constraint (Neo4j 5.x syntax)")
                        session.run("CREATE CONSTRAINT devicegroup_id_unique IF NOT EXISTS FOR (g:DeviceGroup) REQUIRE g.id IS UNIQUE")
                else:
                    # Neo4j 3.x/4.x syntax
                    if not any("networkobject_id_unique" in constraint for constraint in existing_constraints):
                        print("Creating networkobject constraint (Neo4j 3.x/4.x syntax)")
                        try:
                            session.run("CREATE CONSTRAINT ON (o:NetworkObject) ASSERT o.id IS UNIQUE")
                        except Exception as e3:
                            print(f"Could not create constraint with legacy syntax: {e3}")
                    
                    if not any("devicegroup_id_unique" in constraint for constraint in existing_constraints):
                        print("Creating devicegroup constraint (Neo4j 3.x/4.x syntax)")
                        try:
                            session.run("CREATE CONSTRAINT ON (g:DeviceGroup) ASSERT g.id IS UNIQUE")
                        except Exception as e3:
                            print(f"Could not create constraint with legacy syntax: {e3}")
                
                # Try creating relationship constraint but don't fail if it errors
                # Some Neo4j versions handle relationship constraints differently
                try:
                    if not any("connects_id_unique" in constraint for constraint in existing_constraints):
                        print("Creating relationship constraint")
                        if modern_syntax:
                            session.run("CREATE CONSTRAINT connects_id_unique IF NOT EXISTS FOR ()-[r:CONNECTS]-() REQUIRE r.id IS UNIQUE")
                        else:
                            # Create an index instead for older versions
                            session.run("CREATE INDEX ON :CONNECTS(id)")
                except Exception as rel_err:
                    print(f"Note: Relationship constraint creation had an issue: {rel_err}")
                    print("This is normal for some Neo4j versions - relationships will still work")
            except Exception as e:
                print(f"Warning: Error checking constraints: {e}")
                # Continue as the database might still be functional
    except Exception as e:
        # Log the error but don't fail initialization
        print(f"Warning: Error during database initialization: {e}")
        # If the schema is already set up or server is not ready, 
        # we can continue as the app may still function
        pass
    
    print("Database initialization completed (with potential warnings)")

# API endpoints
@app.route('/objects', methods=['POST'])
def add_object():
    data = request.json
    object_id = data.get('id', str(uuid.uuid4()))
    name = data.get('name', 'Unnamed Object')
    obj_type = data.get('type', 'generic')
    metadata = data.get('metadata', {})
    
    # Flatten metadata to primitive types since Neo4j doesn't support nested objects
    flat_properties = {
        'id': object_id,
        'name': name,
        'type': obj_type
    }
    
    # Add metadata fields as separate properties
    if metadata:
        for key, value in metadata.items():
            flat_properties[f"metadata_{key}"] = value
    
    with get_db_session() as session:
        # Build the Cypher query dynamically based on available properties
        query_parts = []
        for key in flat_properties:
            query_parts.append(f"{key}: ${key}")
        
        query = f"""
            CREATE (o:NetworkObject {{{', '.join(query_parts)}}})
            RETURN o
        """
        
        result = session.run(query, **flat_properties)
        record = result.single()
        
        if record:
            return jsonify({
                'id': object_id,
                'name': name,
                'type': obj_type,
                'metadata': metadata
            }), 201
        else:
            return jsonify({"error": "Failed to create object"}), 500

@app.route('/objects', methods=['GET'])
def get_objects():
    with get_db_session() as session:
        # Query to retrieve all objects and reconstruct metadata from flattened properties
        result = session.run("""
            MATCH (o:NetworkObject)
            WITH o, 
                 [k in keys(o) WHERE k STARTS WITH 'metadata_'] AS metadata_keys,
                 o.id as id, o.name as name, o.type as type
            
            WITH o, metadata_keys, id, name, type,
                 apoc.map.fromLists(
                    [k in metadata_keys | substring(k, 9)],
                    [k in metadata_keys | o[k]]
                 ) AS metadata_map
            
            RETURN id, name, type, metadata_map as metadata
        """)
        objects = [dict(record) for record in result]
        return jsonify(objects)

@app.route('/relationships', methods=['POST'])
def add_relationship():
    data = request.json
    source_id = data.get('source_id')
    target_id = data.get('target_id')
    relationship_id = data.get('id', str(uuid.uuid4()))
    
    # Handle both 'type' and 'rel_type' for backwards compatibility
    connection_type = data.get('type', data.get('rel_type', 'ethernet'))
    metadata = data.get('metadata', {})
    
    if not source_id or not target_id:
        return jsonify({"error": "Source and target IDs are required"}), 400
    
    # Handle metadata properly - Neo4j doesn't support complex types as properties
    # Instead flatten any metadata properties or store as JSON string
    rel_properties = {
        'id': relationship_id,
        'type': connection_type
    }
    
    # Process metadata to ensure all values are primitive types
    if metadata:
        if isinstance(metadata, dict):
            # Flatten simple key/value pairs
            for key, value in metadata.items():
                if isinstance(value, (str, int, float, bool)) or (isinstance(value, list) and all(isinstance(x, (str, int, float, bool)) for x in value)):
                    # For primitive values, store directly
                    rel_properties[f'metadata_{key}'] = value
                else:
                    # For complex values, serialize to JSON
                    rel_properties[f'metadata_{key}_json'] = json.dumps(value)
    
    with get_db_session() as session:
        # Check if both objects exist
        result = session.run(
            """
            MATCH (source:NetworkObject {id: $source_id})
            MATCH (target:NetworkObject {id: $target_id})
            CREATE (source)-[r:CONNECTS $properties]->(target)
            RETURN source.id as source_id, target.id as target_id, r.id as id, r.type as type
            """,
            source_id=source_id, target_id=target_id, properties=rel_properties
        )
        record = result.single()
        
        if record:
            # Extract all metadata properties from the relationship
            response_data = dict(record)
            
            # Add any metadata back into the response in a structured way
            metadata = {}
            for key in rel_properties:
                if key.startswith('metadata_'):
                    # Strip the 'metadata_' prefix to get original key
                    original_key = key[9:]
                    if key.endswith('_json'):
                        # Parse JSON for complex types
                        original_key = original_key[:-5]  # Remove '_json' suffix
                        try:
                            metadata[original_key] = json.loads(rel_properties[key])
                        except (ValueError, TypeError):
                            metadata[original_key] = rel_properties[key]
                    else:
                        metadata[original_key] = rel_properties[key]
            
            # Add metadata to response if any exists
            if metadata:
                response_data['metadata'] = metadata
                
            return jsonify(response_data), 201
        else:
            return jsonify({"error": "Failed to create relationship"}), 500

@app.route('/relationships', methods=['GET'])
def get_relationships():
    with get_db_session() as session:
        result = session.run(
            """
            MATCH (source:NetworkObject)-[r:CONNECTS]->(target:NetworkObject)
            RETURN source.id as source_id, target.id as target_id, r.id as id, r.type as type,
                   properties(r) as properties
            """
        )
        
        # Process relationships to extract metadata
        relationships = []
        for record in result:
            rel_data = dict(record)
            properties = rel_data.pop('properties', {})
            
            # Extract metadata into a structured object
            metadata = {}
            for key, value in properties.items():
                if key.startswith('metadata_'):
                    # Strip the 'metadata_' prefix
                    orig_key = key[9:]
                    if key.endswith('_json'):
                        # Parse JSON for complex values
                        orig_key = orig_key[:-5]  # Remove '_json' suffix
                        try:
                            metadata[orig_key] = json.loads(value)
                        except (ValueError, TypeError):
                            metadata[orig_key] = value
                    else:
                        metadata[orig_key] = value
            
            # Add metadata if it exists
            if metadata:
                rel_data['metadata'] = metadata
                
            relationships.append(rel_data)
            
        return jsonify(relationships)

@app.route('/relationships/<relationship_id>', methods=['PATCH'])
def update_relationship(relationship_id):
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Prepare update properties
    update_props = {}
    
    # Handle type update
    if 'type' in data:
        update_props['type'] = data['type']
    
    # Handle metadata updates
    if 'metadata' in data:
        metadata = data['metadata']
        if isinstance(metadata, dict):
            for key, value in metadata.items():
                if isinstance(value, (str, int, float, bool)) or (isinstance(value, list) and all(isinstance(x, (str, int, float, bool)) for x in value)):
                    update_props[f'metadata_{key}'] = value
                else:
                    update_props[f'metadata_{key}_json'] = json.dumps(value)
    
    if not update_props:
        return jsonify({"error": "No valid properties to update"}), 400
    
    with get_db_session() as session:
        # Build SET clause dynamically
        set_clauses = []
        for key in update_props:
            set_clauses.append(f"r.{key} = ${key}")
        
        query = f"""
            MATCH ()-[r:CONNECTS]->()
            WHERE r.id = $id
            SET {', '.join(set_clauses)}
            RETURN r.id as id, r.type as type, properties(r) as properties
        """
        
        result = session.run(query, id=relationship_id, **update_props)
        record = result.single()
        
        if record:
            # Process response to include metadata
            rel_data = dict(record)
            properties = rel_data.pop('properties', {})
            
            # Extract metadata
            metadata = {}
            for key, value in properties.items():
                if key.startswith('metadata_'):
                    orig_key = key[9:]
                    if key.endswith('_json'):
                        orig_key = orig_key[:-5]
                        try:
                            metadata[orig_key] = json.loads(value)
                        except (ValueError, TypeError):
                            metadata[orig_key] = value
                    else:
                        metadata[orig_key] = value
            
            if metadata:
                rel_data['metadata'] = metadata
                
            return jsonify(rel_data), 200
        else:
            return jsonify({"error": "Relationship not found"}), 404

@app.route('/relationships/<relationship_id>', methods=['DELETE'])
def delete_relationship(relationship_id):
    with get_db_session() as session:
        result = session.run(
            """
            MATCH ()-[r:CONNECTS]->()
            WHERE r.id = $id
            DELETE r
            RETURN count(r) as deleted
            """,
            id=relationship_id
        )
        
        record = result.single()
        if record and record["deleted"] > 0:
            return jsonify({"message": "Relationship deleted successfully"}), 200
        else:
            return jsonify({"error": "Relationship not found"}), 404

@app.route('/network', methods=['GET'])
def get_network():
    with get_db_session() as session:
        # Get all objects
        objects_result = session.run("""
            MATCH (o:NetworkObject)
            RETURN o
        """)
        
        nodes = []
        for record in objects_result:
            node = dict(record["o"].items())
            nodes.append(node)
        
        # Get all relationships
        relationships_result = session.run("""
            MATCH (source:NetworkObject)-[r:CONNECTS]->(target:NetworkObject)
            RETURN r.id AS id, source.id AS source, target.id AS target, r.type AS type,
                   properties(r) AS properties
        """)
        
        links = []
        for record in relationships_result:
            # Extract basic link properties
            link = {
                "id": record["id"],
                "source": record["source"],
                "target": record["target"],
                "type": record["type"]
            }
            
            # Process metadata from properties
            properties = record.get("properties", {})
            metadata = {}
            
            for key, value in properties.items():
                if key.startswith('metadata_'):
                    # Strip the 'metadata_' prefix
                    orig_key = key[9:]
                    if key.endswith('_json'):
                        # Parse JSON for complex values
                        orig_key = orig_key[:-5]  # Remove '_json' suffix
                        try:
                            metadata[orig_key] = json.loads(value)
                        except (ValueError, TypeError):
                            metadata[orig_key] = value
                    else:
                        metadata[orig_key] = value
            
            # Add metadata if it exists
            if metadata:
                link['metadata'] = metadata
            links.append(link)
        
        # Get all device groups
        groups_result = session.run("""
            MATCH (g:DeviceGroup)
            OPTIONAL MATCH (g)-[:CONTAINS]->(o:NetworkObject)
            RETURN g AS group, COLLECT(o.id) AS nodeIds
        """)
        
        groups = []
        for record in groups_result:
            group_data = dict(record["group"].items())
            group_data["nodeIds"] = record["nodeIds"]
            groups.append(group_data)
        
        return jsonify({
            "nodes": nodes,
            "links": links,
            "groups": groups
        })

@app.route('/objects/<object_id>', methods=['DELETE'])
def delete_object(object_id):
    with get_db_session() as session:
        # First delete all relationships involving this object
        session.run(
            """
            MATCH (n:NetworkObject {id: $id})-[r]-() 
            DELETE r
            """,
            id=object_id
        )
        
        # Then delete the object itself
        result = session.run(
            """
            MATCH (n:NetworkObject {id: $id})
            DELETE n
            RETURN count(n) as deleted
            """,
            id=object_id
        )
        
        record = result.single()
        if record and record["deleted"] > 0:
            return jsonify({"message": "Object deleted successfully"}), 200
        else:
            return jsonify({"error": "Object not found"}), 404

@app.route('/objects/<object_id>', methods=['PATCH'])
def update_object(object_id):
    data = request.json
    metadata = data.get('metadata', {})
    
    # Flatten metadata to primitive types
    flat_properties = {}
    if metadata:
        for key, value in metadata.items():
            if value is not None:  # Only include non-null values
                flat_properties[f"metadata_{key}"] = value
    
    if not flat_properties:
        return jsonify({"error": "No properties to update"}), 400
    
    with get_db_session() as session:
        # Build the Cypher query to set each property
        set_clauses = []
        for key in flat_properties:
            set_clauses.append(f"o.{key} = ${key}")
        
        # Remove properties that are set to null
        for key, value in metadata.items():
            if value is None:
                set_clauses.append(f"REMOVE o.metadata_{key}")
        
        query = f"""
            MATCH (o:NetworkObject {{id: $id}})
            SET {', '.join(set_clauses)}
            WITH o,
                 [k in keys(o) WHERE k STARTS WITH 'metadata_'] AS metadata_keys,
                 o.id as id, o.name as name, o.type as type
            
            WITH o, metadata_keys, id, name, type,
                 apoc.map.fromLists(
                    [k in metadata_keys | substring(k, 9)],
                    [k in metadata_keys | o[k]]
                 ) AS metadata_map
            
            RETURN id, name, type, metadata_map as metadata
        """
        
        result = session.run(query, id=object_id, **flat_properties)
        record = result.single()
        
        if record:
            return jsonify(dict(record)), 200
        else:
            return jsonify({"error": "Object not found"}), 404

@app.route('/groups', methods=['GET'])
def get_all_groups():
    with get_db_session() as session:
        result = session.run("""
            MATCH (g:DeviceGroup)
            OPTIONAL MATCH (g)-[:CONTAINS]->(o:NetworkObject)
            RETURN g AS group, COLLECT(o.id) AS nodeIds
        """)
        
        groups = []
        for record in result:
            group_data = record["group"]
            group = dict(group_data.items())
            group["nodeIds"] = record["nodeIds"]
            groups.append(group)
            
        return jsonify(groups)

@app.route('/groups', methods=['POST'])
def create_group():
    data = request.json
    group_id = data.get('id', str(uuid.uuid4()))
    name = data.get('name', 'Unnamed Group')
    node_ids = data.get('nodeIds', [])
    x = data.get('x', 0)
    y = data.get('y', 0)
    expanded = data.get('expanded', False)
    
    with get_db_session() as session:
        # Create the group node
        group_result = session.run("""
            CREATE (g:DeviceGroup {id: $id, name: $name, x: $x, y: $y, expanded: $expanded})
            RETURN g
        """, id=group_id, name=name, x=x, y=y, expanded=expanded)
        
        # Link the group to its member nodes
        for node_id in node_ids:
            session.run("""
                MATCH (g:DeviceGroup {id: $group_id})
                MATCH (o:NetworkObject {id: $node_id})
                CREATE (g)-[:CONTAINS]->(o)
            """, group_id=group_id, node_id=node_id)
        
        # Return the created group
        group = group_result.single()["g"]
        return jsonify({
            "id": group["id"],
            "name": group["name"],
            "x": group["x"],
            "y": group["y"],
            "expanded": group["expanded"],
            "nodeIds": node_ids
        })

@app.route('/groups/<group_id>', methods=['DELETE'])
def delete_group(group_id):
    with get_db_session() as session:
        # Delete the group's relationships first
        session.run("""
            MATCH (g:DeviceGroup {id: $id})-[r:CONTAINS]->()
            DELETE r
        """, id=group_id)
        
        # Delete the group
        result = session.run("""
            MATCH (g:DeviceGroup {id: $id})
            DELETE g
            RETURN COUNT(g) AS deleted
        """, id=group_id)
        
        count = result.single()["deleted"]
        if count == 0:
            return jsonify({"error": "Group not found"}), 404
        
        return jsonify({"message": "Group deleted successfully"})

@app.route('/groups/<group_id>', methods=['PATCH'])
def update_group(group_id):
    data = request.json
    updates = {}
    
    # Only allow updating specific fields
    if 'name' in data:
        updates["name"] = data["name"]
    if 'x' in data:
        updates["x"] = data["x"]
    if 'y' in data:
        updates["y"] = data["y"]
    if 'expanded' in data:
        updates["expanded"] = data["expanded"]
    
    update_clause = ", ".join([f"g.{key} = ${key}" for key in updates.keys()])
    
    with get_db_session() as session:
        if update_clause:
            result = session.run(f"""
                MATCH (g:DeviceGroup {{id: $id}})
                SET {update_clause}
                RETURN g
            """, id=group_id, **updates)
        else:
            result = session.run("""
                MATCH (g:DeviceGroup {id: $id})
                RETURN g
            """, id=group_id)
        
        group = result.single()
        if not group:
            return jsonify({"error": "Group not found"}), 404
        
        # Update node memberships if nodeIds is provided
        if 'nodeIds' in data:
            new_node_ids = data['nodeIds']
            
            # Remove all existing relationships
            session.run("""
                MATCH (g:DeviceGroup {id: $id})-[r:CONTAINS]->()
                DELETE r
            """, id=group_id)
            
            # Create new relationships
            for node_id in new_node_ids:
                session.run("""
                    MATCH (g:DeviceGroup {id: $group_id})
                    MATCH (o:NetworkObject {id: $node_id})
                    CREATE (g)-[:CONTAINS]->(o)
                """, group_id=group_id, node_id=node_id)
        
        # Get the updated group with its node IDs
        final_result = session.run("""
            MATCH (g:DeviceGroup {id: $id})
            OPTIONAL MATCH (g)-[:CONTAINS]->(o:NetworkObject)
            RETURN g AS group, COLLECT(o.id) AS nodeIds
        """, id=group_id)
        
        record = final_result.single()
        group_data = dict(record["group"].items())
        group_data["nodeIds"] = record["nodeIds"]
        
        return jsonify(group_data)

@app.route('/healthcheck', methods=['GET'])
def health_check():
    try:
        # Check database connection
        with get_db_session() as session:
            result = session.run("RETURN 1 as n")
            result.single()
        
        return jsonify({
            "status": "ok",
            "message": "Service is healthy",
            "timestamp": datetime.datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "timestamp": datetime.datetime.now().isoformat()
        }), 500

# Serve static files
@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# Production-ready initialization
with app.app_context():
    # This will be executed when the app context is created
    # which happens once in Gunicorn worker initialization
    pass

# This allows for both development and production modes
if __name__ == '__main__':
    # Initialize database immediately in development mode
    init_db()
    # Only use the Flask development server when running directly
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
