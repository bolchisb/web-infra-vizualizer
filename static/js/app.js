// Main application code
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const addNodeBtn = document.getElementById('add-node-btn');
    const addConnectionBtn = document.getElementById('add-connection-btn');
    const addNodeModal = document.getElementById('add-node-modal');
    const addConnectionModal = document.getElementById('add-connection-modal');
    const closeButtons = document.querySelectorAll('.close');
    const addNodeForm = document.getElementById('add-node-form');
    const addConnectionForm = document.getElementById('add-connection-form');
    const sourceNodeSelect = document.getElementById('source-node');
    const targetNodeSelect = document.getElementById('target-node');
    const inspectorContent = document.getElementById('inspector-content');
    const deviceTypeItems = document.querySelectorAll('.device-type-list li');

    // API URL (adjust based on your environment)
    const API_URL = '/';

    // Network data
    let networkObjects = [];
    let networkRelationships = [];

    // Force simulation for the network graph
    let simulation;
    let svg;
    const width = document.querySelector('.network-canvas').clientWidth;
    const height = document.querySelector('.network-canvas').clientHeight;
    
    // Track the currently selected device type
    let selectedDeviceType = 'router';
    
    // Track if we're in "add mode" - placing objects on the board
    let addMode = false;
    
    // Track grouping strength (adjustable by slider)
    let groupingStrength = 0.1;
    
    // Initialize the application
    init();

    function init() {
        // Set up the network visualization
        setupNetworkGraph();
        
        // Load initial data
        loadNetworkData();
        
        // Set up event listeners
        setupEventListeners();
        
        // Create device SVG icons
        createDeviceIcons();
    }

    function setupNetworkGraph() {
        // Create the SVG container
        svg = d3.select('#network-graph')
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .call(d3.zoom().on('zoom', (event) => {
                container.attr('transform', event.transform);
            }));
            
        // Create a container group for all elements
        const container = svg.append('g');
        
        // Handle click on canvas for adding nodes
        svg.on('click', function(event) {
            if (addMode) {
                const coords = d3.pointer(event);
                addNodeAtPosition(coords[0], coords[1]);
            }
        });
        
        // Initialize force simulation with more spacing between nodes and type-based grouping
        simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(150)) // Links between nodes
            .force('charge', d3.forceManyBody().strength(-300)) // General repulsion
            .force('center', d3.forceCenter(width / 2, height / 2)) // Center the graph
            .force('collision', d3.forceCollide().radius(50)) // Prevent node overlap
            .force('grouping', groupingForce()); // Custom force to group nodes by type
    }

    // Custom force to group nodes of the same type together
    function groupingForce() {
        return function(alpha) {
            // Group objects by type
            const typeGroups = {};
            
            // First pass: organize by type
            networkObjects.forEach(node => {
                if (!typeGroups[node.type]) {
                    typeGroups[node.type] = [];
                }
                typeGroups[node.type].push(node);
            });
            
            // Second pass: apply attractive forces between same-type nodes
            Object.keys(typeGroups).forEach(type => {
                const nodes = typeGroups[type];
                const strength = groupingStrength * alpha; // Use configurable strength
                
                // If we have multiple nodes of this type, apply clustering force
                if (nodes.length > 1) {
                    // Calculate center of this type group
                    let centerX = 0, centerY = 0;
                    nodes.forEach(node => {
                        centerX += node.x;
                        centerY += node.y;
                    });
                    centerX /= nodes.length;
                    centerY /= nodes.length;
                    
                    // Apply linear arrangement for nodes of the same type
                    const spacing = 80; // spacing between same-type nodes
                    nodes.forEach((node, i) => {
                        // Calculate target position in a horizontal line
                        const targetX = centerX + (i - (nodes.length - 1) / 2) * spacing;
                        const targetY = centerY;
                        
                        // Move node towards target position
                        node.vx += (targetX - node.x) * strength;
                        node.vy += (targetY - node.y) * strength;
                    });
                }
            });
        };
    }

    function loadNetworkData() {
        // Fetch network data from API
        fetch(`${API_URL}network`)
            .then(response => response.json())
            .then(data => {
                networkObjects = data.objects || [];
                networkRelationships = data.relationships || [];
                updateNetworkGraph();
                updateNodeSelects();
            })
            .catch(error => console.error('Error loading network data:', error));
    }

    function updateNetworkGraph() {
        const container = svg.select('g');
        
        // Clear previous elements
        container.selectAll('*').remove();
        
        // Add links (relationships)
        const links = container.selectAll('.link')
            .data(networkRelationships)
            .enter()
            .append('line')
            .attr('class', 'link');
        
        // Add nodes (network objects)
        const nodes = container.selectAll('.node')
            .data(networkObjects)
            .enter()
            .append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));
        
        // Add circles to nodes with icons based on type
        nodes.append('circle')
            .attr('r', 18)
            .attr('fill', d => getNodeColor(d.type));
            
        // Add icons for nodes
        nodes.append('text')
            .attr('class', 'node-icon')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('font-family', 'FontAwesome')
            .attr('font-size', '14px')
            .attr('fill', 'white')
            .text(d => getNodeIcon(d.type));
            
        // Add text labels
        nodes.append('text')
            .attr('class', 'node-label')
            .attr('dy', 32)
            .attr('text-anchor', 'middle')
            .text(d => d.name);
            
        // Add IP address/netmask labels
        nodes.append('text')
            .attr('class', 'ip-label')
            .attr('dy', 48)
            .attr('text-anchor', 'middle')
            .text(d => getNetworkDetails(d.metadata));
            
        // Update the grouping force with new data
        simulation.force('grouping', groupingForce());
        
        // Set up simulation
        simulation
            .nodes(networkObjects)
            .on('tick', () => {
                // Update positions
                links
                    .attr('x1', d => getNodeById(d.source_id).x)
                    .attr('y1', d => getNodeById(d.source_id).y)
                    .attr('x2', d => getNodeById(d.target_id).x)
                    .attr('y2', d => getNodeById(d.target_id).y);
                
                nodes
                    .attr('transform', d => `translate(${d.x}, ${d.y})`);
            });
            
        simulation.force('link')
            .links(networkRelationships.map(r => ({
                source: getNodeById(r.source_id),
                target: getNodeById(r.target_id)
            })));
            
        // Restart simulation with higher alpha for better grouping
        simulation.alpha(0.8).restart();
        
        // Node click handler
        nodes.on('click', (event, d) => {
            // Prevent event bubbling up to SVG
            event.stopPropagation();
            showObjectDetails(d);
        });
    }

    function getNodeById(id) {
        return networkObjects.find(obj => obj.id === id) || { id };
    }

    function getNodeColor(type) {
        const colors = {
            router: '#3498db',
            switch: '#2ecc71',
            ap: '#e74c3c',
            server: '#9b59b6',
            client: '#f39c12',
            generic: '#7f8c8d'
        };
        return colors[type] || colors.generic;
    }
    
    function getNodeIcon(type) {
        const icons = {
            router: '🔵', // Router - blue circle
            switch: '⬛', // Switch - grid
            ap: '📡',    // Access Point - broadcast icon
            server: '🖥️', // Server - computer
            client: '💻'  // Client - laptop
        };
        return icons[type] || '●';
    }
    
    function getNetworkDetails(metadata) {
        if (!metadata) return null;
        
        const ip = metadata.ip || null;
        const netmask = metadata.netmask || null;
        
        if (ip && netmask) {
            return `${ip}/${netmask}`;
        } else if (ip) {
            return ip;
        }
        return null;
    }

    function updateNodeSelects() {
        // Clear options
        sourceNodeSelect.innerHTML = '';
        targetNodeSelect.innerHTML = '';
        
        // Add options for each network object
        networkObjects.forEach(obj => {
            const option1 = document.createElement('option');
            option1.value = obj.id;
            option1.textContent = obj.name;
            sourceNodeSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = obj.id;
            option2.textContent = obj.name;
            targetNodeSelect.appendChild(option2);
        });
    }

    function showObjectDetails(object) {
        inspectorContent.innerHTML = `
            <h4>${object.name}</h4>
            <p><strong>ID:</strong> ${object.id}</p>
            <p><strong>Type:</strong> ${object.type}</p>
            <div class="network-details">
                <h5>Network Details</h5>
                <form id="network-details-form" data-id="${object.id}">
                    <div class="form-group">
                        <label for="ip-address">IP Address:</label>
                        <input type="text" id="ip-address" value="${object.metadata?.ip || ''}" placeholder="e.g., 192.168.1.1">
                    </div>
                    <div class="form-group">
                        <label for="netmask">Netmask:</label>
                        <input type="text" id="netmask" value="${object.metadata?.netmask || ''}" placeholder="e.g., 24 or 255.255.255.0">
                    </div>
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            </div>
            <div class="metadata">
                <h5>Other Metadata</h5>
                <pre>${JSON.stringify(object.metadata || {}, null, 2)}</pre>
            </div>
            <div class="actions">
                <button class="btn btn-delete" data-id="${object.id}">Delete</button>
            </div>
        `;
        
        // Add event listener for delete button
        const deleteBtn = inspectorContent.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (event) => {
                const objectId = event.target.getAttribute('data-id');
                deleteNetworkObject(objectId);
            });
        }
        
        // Add event listener for network details form
        const networkForm = inspectorContent.querySelector('#network-details-form');
        if (networkForm) {
            networkForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const objectId = networkForm.getAttribute('data-id');
                const ipAddress = document.getElementById('ip-address').value;
                const netmask = document.getElementById('netmask').value;
                updateNetworkDetails(objectId, ipAddress, netmask);
            });
        }
    }

    function setupEventListeners() {
        // Add node button event
        addNodeBtn.addEventListener('click', () => {
            addNodeModal.style.display = 'block';
        });
        
        // Add connection button event
        addConnectionBtn.addEventListener('click', () => {
            updateNodeSelects();
            addConnectionModal.style.display = 'block';
        });
        
        // Add node form submission
        addNodeForm.addEventListener('submit', function(event) {
            event.preventDefault();
            addNetworkObject();
        });
        
        // Add connection form submission
        addConnectionForm.addEventListener('submit', function(event) {
            event.preventDefault();
            addNetworkConnection();
        });
        
        // Close modal buttons
        closeButtons.forEach(button => {
            button.addEventListener('click', function() {
                this.closest('.modal').style.display = 'none';
            });
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
            }
        });
        
        // Toggle click-to-place mode
        document.getElementById('toggle-add-mode').addEventListener('click', function() {
            addMode = !addMode;
            this.classList.toggle('active', addMode);
            document.getElementById('network-graph').classList.toggle('add-mode', addMode);
            if (addMode) {
                showToast('Click anywhere on the canvas to place a network object');
            } else {
                showToast('Click-to-place mode disabled');
            }
        });
        
        // Device type selection
        deviceTypeItems.forEach(item => {
            item.addEventListener('click', function() {
                // Remove selected class from all items
                deviceTypeItems.forEach(i => i.classList.remove('selected'));
                
                // Add selected class to clicked item
                this.classList.add('selected');
                
                // Update selected device type
                selectedDeviceType = this.getAttribute('data-type');
                
                // Show toast notification
                showToast(`Selected ${selectedDeviceType} device type`);
            });
        });
        
        // Grouping controls
        document.getElementById('grouping-toggle').addEventListener('change', function() {
            // Enable/disable grouping
            if (this.checked) {
                simulation.force('grouping', groupingForce());
            } else {
                simulation.force('grouping', null);
            }
            simulation.alpha(0.8).restart();
        });
        
        document.getElementById('grouping-strength').addEventListener('input', function() {
            // Update grouping strength
            groupingStrength = this.value / 100 * 0.2; // Convert to a reasonable value (0-0.2)
            if (document.getElementById('grouping-toggle').checked) {
                simulation.force('grouping', groupingForce());
                simulation.alpha(0.3).restart();
            }
        });
    }
    
    function addNodeAtPosition(x, y) {
        // Generate a name for the new object based on type
        const deviceTypeCapitalized = selectedDeviceType.charAt(0).toUpperCase() + selectedDeviceType.slice(1);
        const name = `${deviceTypeCapitalized} ${networkObjects.filter(o => o.type === selectedDeviceType).length + 1}`;
        
        // Generate a UUID for the new object
        const id = generateUUID();
        
        // Create object data with position fixed to where it was clicked
        const objectData = {
            id: id,
            name: name,
            type: selectedDeviceType,
            metadata: {
                posX: Math.round(x),  // Store as separate primitive values
                posY: Math.round(y)
            }
        };
        
        // Send to API
        fetch(`${API_URL}objects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(objectData),
        })
        .then(response => response.json())
        .then(data => {
            // Add position data for the simulation
            data.x = x;
            data.y = y;
            data.fx = x; // Fix position initially
            data.fy = y;
            
            // Add to local data
            networkObjects.push(data);
            
            // Update visualization
            updateNetworkGraph();
            updateNodeSelects();
            
            // After a delay, unfix the position to allow simulation to take over
            setTimeout(() => {
                const node = networkObjects.find(n => n.id === data.id);
                if (node) {
                    node.fx = null;
                    node.fy = null;
                }
            }, 2000);
            
            // Show toast notification
            showToast(`Added ${data.name}`);
        })
        .catch(error => console.error('Error adding network object:', error));
    }

    function addNetworkObject() {
        const name = document.getElementById('node-name').value;
        const type = document.getElementById('node-type').value;
        
        // Generate a UUID for the new object
        const id = generateUUID();
        
        // Create object data
        const objectData = {
            id: id,
            name: name,
            type: type,
            metadata: {}
        };
        
        // Send to API
        fetch(`${API_URL}objects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(objectData),
        })
        .then(response => response.json())
        .then(data => {
            // Add to local data
            networkObjects.push(data);
            
            // Update visualization
            updateNetworkGraph();
            updateNodeSelects();
            
            // Reset and close form
            addNodeForm.reset();
            addNodeModal.style.display = 'none';
            
            // Show toast notification
            showToast(`Added ${data.name}`);
        })
        .catch(error => console.error('Error adding network object:', error));
    }

    function addNetworkConnection() {
        const sourceId = document.getElementById('source-node').value;
        const targetId = document.getElementById('target-node').value;
        const relType = document.getElementById('connection-type').value;
        
        // Create relationship data
        const relationshipData = {
            source_id: sourceId,
            target_id: targetId,
            rel_type: relType
        };
        
        // Send to API
        fetch(`${API_URL}relationships`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(relationshipData),
        })
        .then(response => response.json())
        .then(data => {
            // Add to local data
            networkRelationships.push(data);
            
            // Update visualization
            updateNetworkGraph();
            
            // Reset and close form
            addConnectionForm.reset();
            addConnectionModal.style.display = 'none';
            
            // Show toast notification
            const source = networkObjects.find(o => o.id === data.source_id);
            const target = networkObjects.find(o => o.id === data.target_id);
            showToast(`Connected ${source?.name} to ${target?.name}`);
        })
        .catch(error => console.error('Error adding relationship:', error));
    }
    
    function deleteNetworkObject(objectId) {
        if (!confirm('Are you sure you want to delete this object?')) {
            return;
        }
        
        // Send delete request to API
        fetch(`${API_URL}objects/${objectId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (response.ok) {
                // Also remove any relationships involving this object
                const relatedRelationships = networkRelationships.filter(
                    r => r.source_id === objectId || r.target_id === objectId
                );
                
                // Remove from local data
                networkObjects = networkObjects.filter(obj => obj.id !== objectId);
                networkRelationships = networkRelationships.filter(
                    r => r.source_id !== objectId && r.target_id !== objectId
                );
                
                // Update visualization
                updateNetworkGraph();
                updateNodeSelects();
                
                // Reset inspector
                inspectorContent.innerHTML = '<p class="empty-state">Select a network object to view details</p>';
                
                showToast('Network object deleted');
            } else {
                console.error('Error deleting network object');
            }
        })
        .catch(error => console.error('Error deleting network object:', error));
    }

    function updateNetworkDetails(objectId, ipAddress, netmask) {
        // Find the object
        const object = networkObjects.find(obj => obj.id === objectId);
        if (!object) {
            console.error('Object not found:', objectId);
            return;
        }
        
        // Create update data with new network details
        const updateData = {
            metadata: {
                ...(object.metadata || {}),
                ip: ipAddress || null,
                netmask: netmask || null
            }
        };
        
        // Send to API
        fetch(`${API_URL}objects/${objectId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        })
        .then(response => response.json())
        .then(data => {
            // Update local object data
            object.metadata = data.metadata;
            
            // Update visualization
            updateNetworkGraph();
            
            // Show toast notification
            showToast(`Updated network details for ${object.name}`);
        })
        .catch(error => {
            console.error('Error updating network details:', error);
            showToast('Failed to update network details', 'error');
        });
    }

    // D3 drag functions
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Helper functions
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // Create a toast notification
    function showToast(message, duration = 3000) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        // Add to container
        toastContainer.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300); // Wait for fade out animation
        }, duration);
    }

    // Create SVG icons for devices
    function createDeviceIcons() {
        // This would normally create SVG icons or load them
        // For now, we'll use CSS background images
    }
});
