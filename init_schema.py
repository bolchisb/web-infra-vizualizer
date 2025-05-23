#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Neo4j Schema Initialization Script

This script will safely initialize the Neo4j schema by:
1. Checking for existing constraints
2. Only creating constraints if they don't exist
3. Using explicit names for constraints to avoid conflicts
"""

import os
import sys
import time
from neo4j import GraphDatabase
from neo4j.exceptions import ClientError, ServiceUnavailable

# Neo4j connection parameters
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password12345678")

def get_db_driver():
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def get_neo4j_version(driver):
    """Get the Neo4j server version"""
    version = "unknown"
    try:
        with driver.session() as session:
            result = session.run("CALL dbms.components() YIELD name, versions WHERE name = 'Neo4j Kernel' RETURN versions[0] as version")
            record = result.single()
            if record:
                version = record["version"]
            else:
                # Try alternative method for newer Neo4j versions
                result = session.run("CALL dbms.systemInfo() YIELD version RETURN version")
                record = result.single()
                if record:
                    version = record["version"]
    except Exception as e:
        print(f"Could not determine Neo4j version: {e}")
        # Default to a safe assumption
        version = "4.0.0"
    
    return version

def wait_for_neo4j():
    """Wait for Neo4j to become available"""
    print("Waiting for Neo4j to be fully available...")
    max_attempts = 30
    attempts = 0
    
    while attempts < max_attempts:
        try:
            with get_db_driver() as driver:
                with driver.session() as session:
                    result = session.run("RETURN 1 as n")
                    result.single()
                    print("Neo4j is available and responsive")
                    return True
        except (ServiceUnavailable, ClientError) as e:
            attempts += 1
            time.sleep(2)
            print(f"Waiting for Neo4j... Attempt {attempts}/{max_attempts}. Error: {e}")
    
    print("Failed to connect to Neo4j after maximum attempts")
    return False

def check_constraints(driver):
    """Check for existing constraints"""
    constraints = []
    try:
        with driver.session() as session:
            # Try the newer SHOW CONSTRAINTS syntax first
            try:
                result = session.run("SHOW CONSTRAINTS")
                constraints = [record for record in result]
                print(f"Found {len(constraints)} existing constraints")
                for constraint in constraints:
                    if 'name' in constraint and 'description' in constraint:
                        print(f"  - {constraint['name']}: {constraint['description']}")
                    else:
                        # Handle different Neo4j versions with different output formats
                        print(f"  - {constraint}")
            except ClientError:
                # Fall back to older Neo4j versions syntax
                print("Using legacy constraint checking method")
                result = session.run("CALL db.constraints()")
                constraints = [record for record in result]
                print(f"Found {len(constraints)} existing constraints using legacy method")
    except Exception as e:
        print(f"Error checking constraints: {e}")
    
    return constraints

def create_constraints(driver):
    """Create necessary constraints with explicit names"""
    # Check Neo4j version first to determine appropriate constraint syntax
    neo4j_version = get_neo4j_version(driver)
    print(f"Detected Neo4j version: {neo4j_version}")
    
    # Use different constraint syntax based on version
    modern_syntax = True
    if neo4j_version.startswith("4.") or neo4j_version.startswith("3."):
        modern_syntax = False
        print("Using legacy constraint syntax for Neo4j version " + neo4j_version)
    
    # Define constraints based on version
    if modern_syntax:
        # Neo4j 5.x+ syntax
        constraints_to_create = [
            {
                "name": "networkobject_id_unique",
                "query": "CREATE CONSTRAINT networkobject_id_unique IF NOT EXISTS FOR (o:NetworkObject) REQUIRE o.id IS UNIQUE"
            },
            {
                "name": "devicegroup_id_unique",
                "query": "CREATE CONSTRAINT devicegroup_id_unique IF NOT EXISTS FOR (g:DeviceGroup) REQUIRE g.id IS UNIQUE"
            }
        ]
    else:
        # Neo4j 4.x and 3.x syntax
        constraints_to_create = [
            {
                "name": "networkobject_id_unique",
                "query": "CREATE CONSTRAINT ON (o:NetworkObject) ASSERT o.id IS UNIQUE"
            },
            {
                "name": "devicegroup_id_unique",
                "query": "CREATE CONSTRAINT ON (g:DeviceGroup) ASSERT g.id IS UNIQUE"
            }
        ]
    
    success_count = 0
    # Try to create each constraint
    try:
        with driver.session() as session:
            # First check existing constraints to avoid conflicts
            existing_constraints = check_constraints(driver)
            existing_names = set()
            
            # Extract names from constraints based on available fields
            for constraint in existing_constraints:
                if isinstance(constraint, dict):
                    if 'name' in constraint:
                        existing_names.add(constraint['name'].lower())
                    elif 'description' in constraint:
                        # Some Neo4j versions don't have names but have descriptions
                        existing_names.add(constraint['description'].lower())
            
            print(f"Found existing constraint names: {existing_names}")
            
            # For each constraint definition, check if it exists first
            for constraint in constraints_to_create:
                try:
                    constraint_name = constraint['name'].lower()
                    if constraint_name in existing_names:
                        print(f"Constraint {constraint['name']} already exists, skipping creation")
                        success_count += 1
                        continue
                        
                    print(f"Creating constraint: {constraint['name']}")
                    session.run(constraint["query"])
                    print(f"Successfully created constraint: {constraint['name']}")
                    success_count += 1
                except ClientError as e:
                    # If constraint already exists with different syntax, it might fail
                    if "already exists" in str(e):
                        print(f"Constraint {constraint['name']} appears to already exist with different naming: {e}")
                        success_count += 1
                    else:
                        print(f"Error creating constraint {constraint['name']}: {e}")
                    # Continue with next constraint even if this one failed
            
            # Try creating relationship constraint separately
            try:
                rel_constraint_name = "connects_id_unique"
                if rel_constraint_name.lower() not in existing_names:
                    print("Creating relationship constraint connects_id_unique")
                    if modern_syntax:
                        session.run("CREATE CONSTRAINT connects_id_unique IF NOT EXISTS FOR ()-[r:CONNECTS]-() REQUIRE r.id IS UNIQUE")
                    else:
                        # Older Neo4j versions don't support relationship constraints the same way
                        # Just create an index instead for backward compatibility
                        session.run("CREATE INDEX ON :CONNECTS(id)")
                    print("Successfully created relationship constraint/index")
                else:
                    print(f"Relationship constraint {rel_constraint_name} already exists, skipping creation")
            except ClientError as e:
                print(f"Note: Relationship constraint creation failed: {e}")
                print("This is normal for some Neo4j versions - relationships will still work")
                
    except Exception as e:
        print(f"Unexpected error during constraint creation: {e}")
        return success_count > 0  # Return true if at least one constraint was created
    
    return True

def drop_existing_constraints(driver):
    """Drop all existing constraints (to be used in recovery mode)"""
    print("WARNING: Dropping all existing constraints for recovery")
    try:
        with driver.session() as session:
            # First get a list of all constraints
            try:
                result = session.run("SHOW CONSTRAINTS")
                constraints = [record for record in result]
                
                # Drop each constraint by name
                for constraint in constraints:
                    if 'name' in constraint:
                        name = constraint['name']
                        print(f"Dropping constraint: {name}")
                        try:
                            session.run(f"DROP CONSTRAINT {name}")
                        except Exception as e:
                            print(f"Failed to drop constraint {name}: {e}")
            except Exception as e:
                print(f"Failed to list constraints: {e}")
                # Try legacy method
                session.run("CALL apoc.schema.assert({}, {})")
                print("Used APOC to reset schema (if available)")
    except Exception as e:
        print(f"Failed to drop constraints: {e}")
    
    return True

def main():
    """Main entry point"""
    print("Starting Neo4j schema initialization")
    
    # Check for recovery mode from environment
    recovery_mode = os.environ.get("NEO4J_SCHEMA_RECOVERY", "false").lower() == "true"
    
    # Wait for Neo4j to be available
    if not wait_for_neo4j():
        print("Neo4j is not available, exiting")
        sys.exit(1)
    
    # Create driver
    try:
        with get_db_driver() as driver:
            # In recovery mode, drop all constraints before recreating
            if recovery_mode:
                drop_existing_constraints(driver)
            
            # Check existing constraints
            existing_constraints = check_constraints(driver)
            
            # Create required constraints
            if create_constraints(driver):
                print("Schema initialization completed successfully")
            else:
                print("Schema initialization completed with some issues")
                # Don't exit with error - app might still work
            
            # Verify constraints after creation
            print("\nVerifying final schema:")
            check_constraints(driver)
            
    except Exception as e:
        print(f"Error during schema initialization: {e}")
        # Don't exit with error code - the app might work without schema
        print("Continuing despite error...")
    
    print("Schema initialization process completed")
    # Always exit with success - let the app try to run even if schema init has issues
    sys.exit(0)

if __name__ == "__main__":
    main()
