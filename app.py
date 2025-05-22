from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from neo4j import GraphDatabase
import uuid
import os
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

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def get_db_session():
    return driver.session()

# Initialize Neo4j with constraints
def init_db():
    with get_db_session() as session:
        # Create unique constraint on object id
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (o:NetworkObject) REQUIRE o.id IS UNIQUE")

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
    rel_type = data.get('rel_type', 'CONNECTED_TO')
    
    if not source_id or not target_id:
        return jsonify({"error": "Source and target IDs are required"}), 400
        
    with get_db_session() as session:
        # Check if both objects exist
        result = session.run(
            """
            MATCH (source:NetworkObject {id: $source_id})
            MATCH (target:NetworkObject {id: $target_id})
            CREATE (source)-[r:`" + rel_type + "`]->(target)
            RETURN source.id as source_id, target.id as target_id, type(r) as rel_type
            """,
            source_id=source_id, target_id=target_id
        )
        record = result.single()
        
        if record:
            return jsonify(dict(record)), 201
        else:
            return jsonify({"error": "Failed to create relationship"}), 500

@app.route('/relationships', methods=['GET'])
def get_relationships():
    with get_db_session() as session:
        result = session.run(
            """
            MATCH (source:NetworkObject)-[r]->(target:NetworkObject)
            RETURN source.id as source_id, target.id as target_id, type(r) as rel_type
            """
        )
        relationships = [dict(record) for record in result]
        return jsonify(relationships)

@app.route('/network', methods=['GET'])
def get_network():
    with get_db_session() as session:
        objects_result = session.run("""
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
        
        rels_result = session.run(
            """
            MATCH (source:NetworkObject)-[r]->(target:NetworkObject)
            RETURN source.id as source_id, target.id as target_id, type(r) as rel_type
            """
        )
        
        objects = [dict(record) for record in objects_result]
        relationships = [dict(record) for record in rels_result]
        
        return jsonify({
            'objects': objects,
            'relationships': relationships
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
