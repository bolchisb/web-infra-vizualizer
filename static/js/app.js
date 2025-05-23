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

    // Global variables
    let networkObjects = [];
    let networkRelationships = [];
    let deviceGroups = [];
    let selectedNodes = [];
    
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
        
        // Preload all icons for use
        preloadIcons(['router', 'switch', 'ap', 'server', 'client', 'nas', 'internet']);
    }
    
    // Preload SVG icons for better performance
    function preloadIcons(iconTypes) {
        const iconPromises = iconTypes.map(type => {
            return fetch(`/static/img/${type === 'ap' ? 'access-point' : type}.svg`)
                .then(response => response.text())
                .then(svgText => {
                    // Store SVG data in memory for quick access
                    window[`${type}Icon`] = svgText;
                })
                .catch(error => console.error(`Error loading ${type} icon:`, error));
        });
        
        Promise.all(iconPromises).then(() => {
            console.log('All icons loaded successfully');
        });
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
        
        // Handle click on canvas for adding nodes or deselecting
        svg.on('click', function(event) {
            if (addMode) {
                const coords = d3.pointer(event);
                addNodeAtPosition(coords[0], coords[1]);
            } else {
                // Clicking on the background deselects all nodes
                clearNodeSelection();
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

    // Load network data from server
    function loadNetworkData() {
        fetch(`${API_URL}network`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load network data: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Network data loaded:', data);
                // Update global data
                networkObjects = data.nodes;
                deviceGroups = data.groups || [];
                
                // Initialize groups to expanded state
                initializeGroups();
                
                // Process relationships to include direct node references
                networkRelationships = data.links.map(link => {
                    const sourceNode = networkObjects.find(n => n.id === link.source);
                    const targetNode = networkObjects.find(n => n.id === link.target);
                    
                    // Create a relationship object that works for both the API and the visualization
                    return {
                        id: link.id,
                        source_id: link.source, // Keep original IDs
                        target_id: link.target,
                        source: sourceNode || { id: link.source }, // For D3 visualization
                        target: targetNode || { id: link.target },
                        type: link.type
                    };
                });
                
                // Set initial positions if not already set
                networkObjects.forEach(node => {
                    if (node.x === undefined) {
                        node.x = width / 2 + (Math.random() - 0.5) * width / 2;
                        node.y = height / 2 + (Math.random() - 0.5) * height / 2;
                    }
                });
                
                // Set initial positions for device groups if not already set
                deviceGroups.forEach(group => {
                    if (group.x === undefined) {
                        // Calculate position based on member nodes
                        const memberNodes = networkObjects.filter(node => 
                            group.nodeIds.includes(node.id)
                        );
                        
                        if (memberNodes.length > 0) {
                            group.x = memberNodes.reduce((sum, n) => sum + n.x, 0) / memberNodes.length;
                            group.y = memberNodes.reduce((sum, n) => sum + n.y, 0) / memberNodes.length;
                        } else {
                            group.x = width / 2 + (Math.random() - 0.5) * width / 3;
                            group.y = height / 2 + (Math.random() - 0.5) * height / 3;
                        }
                    }
                });
                
                // Update the visualization
                updateVisualization();
            })
            .catch(error => {
                console.error('Error loading network data:', error);
                showToast('Failed to load network data: ' + error.message, 'error');
            });
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
            .attr('r', 20)
            .attr('fill', d => getNodeColor(d.type))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);
            
        // Add SVG icons for nodes
        nodes.append('image')
            .attr('class', 'node-icon')
            .attr('x', -14)
            .attr('y', -14)
            .attr('width', 28)
            .attr('height', 28)
            .attr('href', d => getNodeIcon(d.type));
            
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
                // Update positions - safely access source and target
                links
                    .attr('x1', d => (d.source && d.source.x) ? d.source.x : (d.source_id && getNodeById(d.source_id).x))
                    .attr('y1', d => (d.source && d.source.y) ? d.source.y : (d.source_id && getNodeById(d.source_id).y))
                    .attr('x2', d => (d.target && d.target.x) ? d.target.x : (d.target_id && getNodeById(d.target_id).x))
                    .attr('y2', d => (d.target && d.target.y) ? d.target.y : (d.target_id && getNodeById(d.target_id).y));
                
                nodes
                    .attr('transform', d => `translate(${d.x}, ${d.y})`);
            });
            
        simulation.force('link')
            .links(networkRelationships);
            
        // Restart simulation with higher alpha for better grouping
        simulation.alpha(0.8).restart();
        
        // Node click handler
        nodes.on('click', handleNodeClick);
    }

    function getNodeById(id) {
        if (!id) return { id: 'unknown', x: 0, y: 0 }; // Safe default with coordinates
        return networkObjects.find(obj => obj.id === id) || { id, x: 0, y: 0 }; // Ensure node has x,y coords
    }

    function getNodeColor(type) {
        const colors = {
            router: '#3498db',
            switch: '#2ecc71',
            ap: '#e74c3c',
            server: '#9b59b6',
            client: '#f39c12',
            nas: '#8e44ad',
            generic: '#7f8c8d'
        };
        return colors[type] || colors.generic;
    }
    
    function getNodeIcon(type) {
        const icons = {
            router: '/img/router.svg',
            switch: '/img/switch.svg',
            ap: '/img/access-point.svg',
            server: '/img/server.svg',
            client: '/img/computer.svg',
            nas: '/img/nas.svg'
        };
        return icons[type] || '/img/internet.svg'; // Default icon
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
        // Modal controls
        addNodeBtn.addEventListener('click', () => addNodeModal.style.display = 'block');
        addConnectionBtn.addEventListener('click', () => {
            updateNodeSelects();
            addConnectionModal.style.display = 'block';
        });
        
        // Close buttons for modals
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                addNodeModal.style.display = 'none';
                addConnectionModal.style.display = 'none';
                document.getElementById('create-group-modal').style.display = 'none';
            });
        });
        
        // Toggle add mode button
        document.getElementById('toggle-add-mode').addEventListener('click', function() {
            addMode = !addMode;
            this.innerText = addMode ? 'Cancel Placement' : 'Click to Place';
            this.classList.toggle('active', addMode);
            
            if (addMode) {
                showToast('Click on the canvas to place a node');
            }
        });
        
        // Handle form submissions
        addNodeForm.addEventListener('submit', handleAddNodeFormSubmit);
        addConnectionForm.addEventListener('submit', handleAddConnectionFormSubmit);
        
        // Global function to select device type (accessible to other scripts)
        window.selectDeviceType = function(element, suppressNotification = false) {
            if (!element) return;
            
            // Remove selected class from all items
            document.querySelectorAll('.device-type-list li').forEach(i => i.classList.remove('selected'));
            
            // Add selected class to clicked item
            element.classList.add('selected');
            
            // Update selected device type
            selectedDeviceType = element.getAttribute('data-type');
            
            // Force a browser reflow to ensure the style changes take effect
            void element.offsetWidth;
            
            // Show toast notification (only if not suppressed)
            if (!suppressNotification) {
                showToast(`Selected ${selectedDeviceType} device type`);
            }
            
            console.log('Device type selected:', selectedDeviceType);
            
            // Return the selected type
            return selectedDeviceType;
        };
        
        // Device type selection - mouse clicks with improved event delegation
        document.querySelector('.device-type-list').addEventListener('click', function(event) {
            // Find the clicked li element or its parent if a child was clicked
            const clickedItem = event.target.closest('li');
            if (!clickedItem) return; // Exit if click wasn't on or within an li
            
            selectDeviceType(clickedItem);
            
            // Prevent any potential event bubbling issues
            event.stopPropagation();
        });
        
        // Add mousedown handler as an alternative
        document.querySelector('.device-type-list').addEventListener('mousedown', function(event) {
            // Find the clicked li element or its parent if a child was clicked
            const clickedItem = event.target.closest('li');
            if (!clickedItem) return; // Exit if click wasn't on or within an li
            
            // Add a small data attribute to track that we've handled this event
            clickedItem.setAttribute('data-mousedown', 'true');
            
            // We'll let the click event handle the actual selection
            // This is just a backup in case click events are having issues
        });
        
        // Keyboard accessibility for device type selection
        document.querySelectorAll('.device-type-list li').forEach(item => {
            item.addEventListener('keydown', function(event) {
                // Select on Enter or Space key
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectDeviceType(this);
                }
            });
        });
        
        // Explicitly mark currently selected device type on load
        const initialDeviceType = document.querySelector('.device-type-list li.selected');
        if (initialDeviceType) {
            selectedDeviceType = initialDeviceType.getAttribute('data-type');
        }
        
        // Create group button with improved debugging
        document.getElementById('create-group-btn').addEventListener('click', function() {
            console.log("Create group button clicked. Selected nodes:", selectedNodes);
            
            if (selectedNodes.length < 2) {
                console.warn("Not enough nodes selected for grouping");
                showToast('Select at least 2 devices to create a group', 'error');
                return;
            }
            
            // Show create group modal
            const modal = document.getElementById('create-group-modal');
            modal.style.display = 'block';
            
            // Populate selected devices list
            const selectedDevicesList = document.getElementById('selected-devices-list');
            selectedDevicesList.innerHTML = '';
            
            selectedNodes.forEach(node => {
                console.log("Adding node to device list:", node.name || node.id);
                const deviceItem = document.createElement('div');
                deviceItem.className = 'selected-device-item';
                deviceItem.innerHTML = `
                    <span><div class="device-icon ${node.type}-icon"></div>${node.name || node.id}</span>
                `;
                selectedDevicesList.appendChild(deviceItem);
            });
        });
        
        // Create group form submission
        document.getElementById('create-group-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const groupName = document.getElementById('group-name').value;
            createDeviceGroup(selectedNodes, groupName);
            
            // Reset and close modal
            document.getElementById('group-name').value = '';
            document.getElementById('create-group-modal').style.display = 'none';
            
            // Show confirmation
            showToast(`Group "${groupName}" created with ${selectedNodes.length} devices`);
            
            // Clear selection
            clearNodeSelection();
            updateVisualization();
        });
        
        // Cancel group button
        document.getElementById('cancel-group').addEventListener('click', function() {
            document.getElementById('create-group-modal').style.display = 'none';
        });
        
        // Expand all groups toggle
        document.getElementById('expand-all-groups').addEventListener('change', function() {
            const expandAll = this.checked;
            
            deviceGroups.forEach(group => {
                group.expanded = expandAll;
            });
            
            updateVisualization();
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
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', function(event) {
            // Only process if not in a form field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Ctrl+G: Group selected nodes
            if (event.ctrlKey && event.key === 'g') {
                event.preventDefault();
                
                if (selectedNodes.length >= 2) {
                    // Show create group modal
                    document.getElementById('create-group-modal').style.display = 'block';
                } else {
                    showToast('Select at least 2 devices to create a group', 'error');
                }
            }
            
            // Delete: Remove selected nodes
            if (event.key === 'Delete') {
                event.preventDefault();
                
                if (selectedNodes.length > 0) {
                    const count = selectedNodes.length;
                    
                    // Confirm deletion
                    if (confirm(`Delete ${count} selected ${count > 1 ? 'devices' : 'device'}?`)) {
                        // Delete each selected node
                        const deletePromises = selectedNodes.map(node => 
                            fetch(`${API_URL}objects/${node.id}`, {
                                method: 'DELETE'
                            })
                        );
                        
                        Promise.all(deletePromises)
                            .then(() => {
                                showToast(`Deleted ${count} ${count > 1 ? 'devices' : 'device'}`);
                                loadNetworkData();
                                clearNodeSelection();
                            })
                            .catch(error => {
                                console.error('Error deleting nodes:', error);
                                showToast('Error deleting devices', 'error');
                            });
                    }
                }
            }
            
            // Escape: Clear selection
            if (event.key === 'Escape') {
                clearNodeSelection();
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
            type: relType  // Using 'type' to match backend expectations
        };
        
        // Log the request for debugging
        console.log('Sending relationship data:', relationshipData);
        
        // Send to API
        fetch(`${API_URL}relationships`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(relationshipData),
        })
        .then(response => {
            // Check for network or server errors
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Connection created successfully:', data);
            
            // Find the actual node objects
            const sourceNode = getNodeById(sourceId);
            const targetNode = getNodeById(targetId);
            
            // Add to local data with source and target references for D3
            const relationshipWithRefs = {
                ...data,
                source: sourceNode,
                target: targetNode,
                // Ensure these properties exist for compatibility
                source_id: sourceId,
                target_id: targetId
            };
            
            // Add to relationships array
            networkRelationships.push(relationshipWithRefs);
            
            // Reset and close form
            addConnectionForm.reset();
            addConnectionModal.style.display = 'none';
            
            // Show toast notification
            const source = networkObjects.find(o => o.id === data.source_id);
            const target = networkObjects.find(o => o.id === data.target_id);
            showToast(`Connected ${source?.name} to ${target?.name}`);
            
            // Clear the entire svg container and redraw everything from scratch
            // This ensures no residual elements remain
            const container = svg.select('g');
            container.selectAll('*').remove();
            
            // Update visualization with a full refresh
            updateNetworkGraph();
        })
        .catch(error => {
            console.error('Error adding relationship:', error);
            showToast('Failed to create connection: ' + error.message, 'error');
        });
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
    
    // Handle form submission for adding a new node
    function handleAddNodeFormSubmit(event) {
        event.preventDefault();
        addNetworkObject();
    }
    
    // Handle form submission for adding a new connection
    function handleAddConnectionFormSubmit(event) {
        event.preventDefault();
        addNetworkConnection();
    }
    
    // Handle clicking on a node
    function handleNodeClick(event, d) {
        // Prevent event propagation to avoid deselection
        event.stopPropagation();
        
        // Toggle selection if Ctrl/Cmd key is pressed
        if (event.ctrlKey || event.metaKey) {
            toggleNodeSelection(d);
        } else {
            // Single selection mode - clear other selections
            clearNodeSelection();
            toggleNodeSelection(d);
            
            // Flash the selected node to give immediate feedback
            const nodeElement = document.getElementById(`node-${d.id}`);
            if (nodeElement) {
                // Add a flash animation class
                nodeElement.classList.add('flash-highlight');
                // Remove it after animation completes
                setTimeout(() => {
                    nodeElement.classList.remove('flash-highlight');
                }, 500);
            }
        }
        
        // Show object details in the inspector
        showObjectDetails(d);
        
        // Debug selection state
        console.log(`Selection state after click:`, selectedNodes.map(n => n.name || n.id));
        
        // Clear the entire svg container and redraw everything from scratch
        // This ensures no residual elements remain after selection
        const container = svg.select('g');
        container.selectAll('*').remove();
        
        // Update visualization with a full refresh
        updateNetworkGraph();
    }

    // D3 drag functions
    function dragstarted(event, d) {
        // When drag starts, activate the force simulation if it's not already active
        if (!event.active) simulation.alphaTarget(0.3).restart();
        // Set fixed position during drag
        d.fx = d.x;
        d.fy = d.y;
        
        // Store the node being dragged for group movement
        window.draggedNode = d;
    }

    function dragged(event, d) {
        // Update fixed position during drag
        d.fx = event.x;
        d.fy = event.y;
        
        // Check if node is in a group and update the group position to follow node
        const nodeGroups = deviceGroups.filter(g => 
            g.nodeIds && g.nodeIds.includes(d.id) && g.expanded
        );
        
        if (nodeGroups.length > 0) {
            // Update all containing groups
            nodeGroups.forEach(group => {
                // Calculate the new center position based on all group members
                const groupMembers = networkObjects.filter(n => group.nodeIds.includes(n.id));
                if (groupMembers.length > 0) {
                    const newX = groupMembers.reduce((sum, n) => sum + (n.fx || n.x), 0) / groupMembers.length;
                    const newY = groupMembers.reduce((sum, n) => sum + (n.fy || n.y), 0) / groupMembers.length;
                    
                    // Update group position
                    group.x = newX;
                    group.y = newY;
                }
            });
        }
        
        // Clear the entire svg container and redraw everything from scratch
        // This ensures no residual elements remain during drag
        const container = svg.select('g');
        container.selectAll('*').remove();
        
        // Update visualization with a full refresh
        updateNetworkGraph();
        
        // Let the simulation handle position updates with minimal energy
        simulation.alpha(0.1).restart();
    }

    function dragended(event, d) {
        // When drag ends, reset alpha target so the simulation cools
        if (!event.active) simulation.alphaTarget(0);
        
        // Unfix node position to allow it to float around after dragging
        d.fx = null;
        d.fy = null;
        
        // Clear the dragged node reference
        window.draggedNode = null;
        
        // Clear the entire svg container and redraw everything from scratch
        // This ensures no residual elements remain after drag ends
        const container = svg.select('g');
        container.selectAll('*').remove();
        
        // Do a final complete update to fix any visual artifacts
        updateNetworkGraph();
        
        // Add a burst of energy to the simulation so nodes can start moving
        simulation.alpha(0.3).restart();
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

    // Preload SVG icons for devices to ensure they're cached
    function createDeviceIcons() {
        // List of all icon paths
        const iconPaths = [
            '/img/router.svg',
            '/img/switch.svg',
            '/img/access-point.svg',
            '/img/server.svg',
            '/img/computer.svg',
            '/img/internet.svg',
            '/img/nas.svg'
        ];
        
        // Preload each icon
        iconPaths.forEach(path => {
            const img = new Image();
            img.src = path;
        });
    }
    
    // Create a device group with selected nodes
    function createDeviceGroup(nodes, name) {
        if (!nodes || nodes.length < 1) {
            console.error("Cannot create group: No nodes provided");
            return;
        }
        
        // Generate a unique ID for the group
        const groupId = 'group_' + Date.now();
        
        console.log(`Creating group "${name}" with ${nodes.length} nodes:`, nodes.map(n => n.name || n.id));
        
        // Create the group object
        const group = {
            id: groupId,
            name: name,
            nodeIds: nodes.map(n => n.id),
            expanded: true,  // Default to expanded state for visibility
            // Calculate center position based on member nodes
            x: nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length,
            y: nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length,
        };
        
        // Add to groups array
        deviceGroups.push(group);
        
        console.log(`Group created successfully:`, group);
        
        // Save groups to the database via API
        fetch(`${API_URL}groups`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(group)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to save group: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Group saved to API:', data);
            showToast(`Group "${name}" created successfully`);
        })
        .catch(error => {
            console.error('Error saving group:', error);
            showToast(`Error saving group: ${error.message}`, 'error');
        });
        
        // Update visualization
        updateVisualization();
    }
    
    // Handle selection of network nodes
    function toggleNodeSelection(node) {
        if (!node || !node.id) {
            console.error("Invalid node passed to toggleNodeSelection:", node);
            return;
        }

        const index = selectedNodes.findIndex(n => n.id === node.id);
        
        if (index === -1) {
            // Add to selection
            selectedNodes.push(node);
            console.log(`Added node ${node.name || node.id} to selection`);
            
            // Apply visual selection feedback
            try {
                // D3 selection
                d3.select(`#node-${node.id}`).classed('selected', true);
                
                // Direct DOM manipulation for fallback
                const nodeElement = document.getElementById(`node-${node.id}`);
                if (nodeElement) {
                    nodeElement.classList.add('selected');
                    
                    // Add a brief scaling effect for immediate feedback
                    const currentTransform = nodeElement.getAttribute('transform') || '';
                    nodeElement.setAttribute('transform', currentTransform + ' scale(1.2)');
                    setTimeout(() => {
                        nodeElement.setAttribute('transform', currentTransform);
                    }, 300);
                }
            } catch (e) {
                console.error("Error applying selection:", e);
            }
        } else {
            // Remove from selection
            selectedNodes.splice(index, 1);
            console.log(`Removed node ${node.name || node.id} from selection`);
            
            // Remove visual feedback
            try {
                // D3 selection
                d3.select(`#node-${node.id}`).classed('selected', false);
                
                // Direct DOM manipulation for fallback
                const nodeElement = document.getElementById(`node-${node.id}`);
                if (nodeElement) {
                    nodeElement.classList.remove('selected');
                }
            } catch (e) {
                console.error("Error removing selection:", e);
            }
        }
        
        // Update UI to reflect selection
        updateSelectionUI();
    }
    
    // Clear all selected nodes
    function clearNodeSelection() {
        // Remove selected class from all nodes
        d3.selectAll('.network-node').classed('selected', false);
        
        // Also remove the class from DOM elements directly
        document.querySelectorAll('.network-node').forEach(node => {
            node.classList.remove('selected');
        });
        
        // Clear selection array
        selectedNodes = [];
        
        // Update UI
        updateSelectionUI();
    }
    
    // Update UI elements based on node selection
    function updateSelectionUI() {
        const createGroupBtn = document.getElementById('create-group-btn');
        
        console.log(`updateSelectionUI: ${selectedNodes.length} nodes selected`);
        
        if (selectedNodes.length >= 2) {
            createGroupBtn.classList.add('active');
            createGroupBtn.innerText = `Group ${selectedNodes.length} Devices`;
        } else {
            createGroupBtn.classList.remove('active');
            createGroupBtn.innerText = 'Create Group';
        }
    }
    
    function updateVisualization() {
        const container = svg.select('g');
        
        // Store currently selected node IDs to preserve selection state
        const selectedNodeIds = selectedNodes.map(node => node.id);
        
        // Update links
        const link = container.selectAll('.link')
            .data(networkRelationships, d => d.id);
            
        // Remove old links
        link.exit().remove();
        
        // Handle different connection types
        // First, create regular links (non-VPN)
        const regularLinks = networkRelationships.filter(d => d.type !== 'vpn');
        const regularLink = container.selectAll('.link:not(.vpn)')
            .data(regularLinks, d => d.id);
        
        // Remove old regular links
        regularLink.exit().remove();
        
        // Create new regular links
        const regularLinkEnter = regularLink.enter()
            .append('line')
            .attr('class', d => `link ${d.type || 'ethernet'}`)
            .attr('id', d => `link-${d.id}`);
            
        // Merge and update all regular links
        const regularLinkUpdate = regularLinkEnter.merge(regularLink);
        
        // Now handle VPN links separately with curved paths
        const vpnLinks = networkRelationships.filter(d => d.type === 'vpn');
        const vpnLink = container.selectAll('.link.vpn')
            .data(vpnLinks, d => d.id);
        
        // Remove old VPN links
        vpnLink.exit().remove();
        
        // Create new VPN links
        const vpnLinkEnter = vpnLink.enter()
            .append('path')
            .attr('class', 'link vpn')
            .attr('id', d => `link-${d.id}`);
            
        // Merge and update all VPN links
        const vpnLinkUpdate = vpnLinkEnter.merge(vpnLink);
        
        // Update device groups
        const group = container.selectAll('.device-group-container')
            .data(deviceGroups, d => d.id);
            
        // Remove old groups
        group.exit().remove();
        
        // Create new groups
        const groupEnter = group.enter()
            .append('g')
            .attr('class', 'device-group-container')
            .attr('id', d => `group-${d.id}`);
        
        // Add the group circle
        groupEnter.append('circle')
            .attr('class', d => `device-group ${d.expanded ? 'expanded-group' : ''}`)
            .attr('r', d => calculateGroupRadius(d))
            .on('dblclick', toggleGroupExpansion);
            
        // Add the group label
        groupEnter.append('text')
            .attr('class', 'device-group-label')
            .attr('dy', -10)
            .text(d => d.name);
        
        // Add node count for collapsed groups
        groupEnter.append('text')
            .attr('class', 'group-node-count')
            .attr('dy', 5)
            .text(d => d.expanded ? '' : `${d.nodeIds ? d.nodeIds.length : 0}`);
            
        // Merge and update all groups
        const groupUpdate = groupEnter.merge(group);
        
        // Make sure collapsed nodes are moved to their group's center
        networkObjects.forEach(node => {
            const containingGroup = deviceGroups.find(g => 
                g.nodeIds && g.nodeIds.includes(node.id)
            );
            
            if (containingGroup && !containingGroup.expanded) {
                // Move to group center
                node.x = containingGroup.x;
                node.y = containingGroup.y;
            }
        });
        
        // Update all nodes
        const node = container.selectAll('.network-node')
            .data(networkObjects, d => d.id);
            
        // Remove old nodes
        node.exit().remove();
        
        // Create new nodes
        const nodeEnter = node.enter()
            .append('g')
            .attr('class', d => {
                // Apply selected class if node was selected
                // Also add in-group class if it's in a group
                let classStr = 'network-node';
                if (selectedNodeIds.includes(d.id)) classStr += ' selected';
                
                const groupContainingNode = deviceGroups.find(g => 
                    g.nodeIds && g.nodeIds.includes(d.id)
                );
                if (groupContainingNode) classStr += ' in-group';
                
                return classStr;
            })
            .attr('id', d => `node-${d.id}`)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended))
            .on('click', handleNodeClick);
        
        // Add node image
        nodeEnter.append('circle')
            .attr('class', 'node-border')
            .attr('r', 25)
            .attr('fill', 'white')
            .attr('stroke', getNodeColor)
            .attr('stroke-width', 2);
            
        nodeEnter.append('image')
            .attr('xlink:href', d => getNodeIcon(d.type))
            .attr('width', 30)
            .attr('height', 30)
            .attr('x', -15)
            .attr('y', -15);
            
        // Add node label
        nodeEnter.append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', 35)
            .text(d => d.name || d.id);
        
        // Add network info label if available
        nodeEnter.append('text')
            .attr('class', 'network-info')
            .attr('text-anchor', 'middle')
            .attr('dy', 50)
            .text(d => getNetworkDetails(d.metadata));
        
        // Merge and update all nodes
        const nodeUpdate = nodeEnter.merge(node);
        
        // Ensure selection state is preserved during updates
        nodeUpdate.classed('selected', d => selectedNodeIds.includes(d.id));
        
        // Update simulation nodes only when needed
        if (simulation) {
            simulation.nodes(networkObjects);
            simulation.force('link').links(networkRelationships);
            
            // Set up the tick function to update elements during simulation
            simulation.on('tick', () => {
                // Update regular links - respect fixed positions
                regularLinkUpdate
                    .attr('x1', d => {
                        const sourceNode = getNodeById(d.source.id || d.source);
                        return sourceNode.fx || sourceNode.x;
                    })
                    .attr('y1', d => {
                        const sourceNode = getNodeById(d.source.id || d.source);
                        return sourceNode.fy || sourceNode.y;
                    })
                    .attr('x2', d => {
                        const targetNode = getNodeById(d.target.id || d.target);
                        return targetNode.fx || targetNode.x;
                    })
                    .attr('y2', d => {
                        const targetNode = getNodeById(d.target.id || d.target);
                        return targetNode.fy || targetNode.y;
                    });
                
                // Update VPN links with fixed positions
                vpnLinkUpdate
                    .attr('d', d => {
                        const source = getNodeById(d.source.id || d.source);
                        const target = getNodeById(d.target.id || d.target);
                        
                        // Use fixed positions if available
                        const sourcePos = {
                            x: source.fx || source.x,
                            y: source.fy || source.y
                        };
                        
                        const targetPos = {
                            x: target.fx || target.x,
                            y: target.fy || target.y
                        };
                        
                        return renderVPNPath(sourcePos, targetPos);
                    });
                
                // Update group positions
                groupUpdate.select('circle')
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y)
                    .attr('r', d => calculateGroupRadius(d))
                    .classed('expanded-group', d => d.expanded);
                    
                groupUpdate.select('text')
                    .attr('x', d => d.x)
                    .attr('y', d => d.y - calculateGroupRadius(d));
                
                // Update node positions
                nodeUpdate
                    .attr('transform', d => {
                        // Check if node is part of a collapsed group
                        const groupContainingNode = deviceGroups.find(g => 
                            g.nodeIds && g.nodeIds.includes(d.id) && !g.expanded
                        );
                        
                        if (groupContainingNode) {
                            // If node is in a collapsed group, position at the group's center
                            return `translate(${groupContainingNode.x}, ${groupContainingNode.y})`;
                        } else {
                            // Apply containment force for expanded groups
                            const expandedGroup = deviceGroups.find(g => 
                                g.nodeIds && g.nodeIds.includes(d.id) && g.expanded
                            );
                            
                            if (expandedGroup) {
                                // Calculate distance from node to group center
                                const dx = d.x - expandedGroup.x;
                                const dy = d.y - expandedGroup.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                
                                // Get the group radius
                                const radius = calculateGroupRadius(expandedGroup);
                                
                                // If node is outside group boundary, pull it back in
                                if (distance > radius - 25) {
                                    const ratio = (radius - 25) / distance;
                                    d.x = expandedGroup.x + dx * ratio;
                                    d.y = expandedGroup.y + dy * ratio;
                                }
                            }
                            
                            // Return the node's position, respecting fixed position if available
                            return `translate(${d.fx || d.x}, ${d.fy || d.y})`;
                        }
                    });
                
                // Update node visibility based on group expansion state
                nodeUpdate.style('opacity', d => {
                    const groupContainingNode = deviceGroups.find(g => 
                        g.nodeIds && g.nodeIds.includes(d.id) && !g.expanded
                    );
                    
                    // Hide nodes in collapsed groups, show all other nodes
                    return groupContainingNode ? 0 : 1;
                })
                .style('pointer-events', d => {
                    const groupContainingNode = deviceGroups.find(g => 
                        g.nodeIds && g.nodeIds.includes(d.id) && !g.expanded
                    );
                    
                    // Disable pointer events for hidden nodes
                    return groupContainingNode ? 'none' : 'all';
                });
                
                // Update class for group nodes to facilitate styling
                nodeUpdate.classed('in-group', d => {
                    return deviceGroups.some(g => 
                        g.nodeIds && g.nodeIds.includes(d.id)
                    );
                });
            });
            
            simulation.alpha(0.3).restart();
        }
        
        // Restore selected nodes after visualization update
        selectedNodes = networkObjects.filter(node => selectedNodeIds.includes(node.id));
        updateSelectionUI();
    }
    
    // Calculate the radius for a group based on its members
    function calculateGroupRadius(group) {
        const nodeCount = group.nodeIds.length;
        const baseRadius = 50;
        const radiusPerNode = 15;
        
        return baseRadius + (nodeCount * radiusPerNode / 2);
    }
    
    // Toggle the expansion state of a device group
    function toggleGroupExpansion(event, group) {
        // Toggle the expanded state
        group.expanded = !group.expanded;
        
        console.log(`Group "${group.name}" toggled to ${group.expanded ? "expanded" : "collapsed"} state`);
        
        // Update the visualization
        updateVisualization();
        
        // Restart the simulation with more energy for better distribution when expanding
        simulation.alpha(group.expanded ? 0.5 : 0.3).restart();
        
        // Stop event propagation
        event.stopPropagation();
    }
    
    // Sets the initial state of groups to expanded
    function initializeGroups() {
        deviceGroups.forEach(group => {
            // Default to expanded for better visibility
            if (group.expanded === undefined) {
                group.expanded = true;
            }
        });
    }
    
    // Render a VPN tunnel path between two points
    function renderVPNPath(source, target) {
        // Get coordinates (support both node objects and position objects)
        const sx = source.fx !== undefined ? (source.fx || source.x) : source.x;
        const sy = source.fy !== undefined ? (source.fy || source.y) : source.y;
        const tx = target.fx !== undefined ? (target.fx || target.x) : target.x;
        const ty = target.fy !== undefined ? (target.fy || target.y) : target.y;
        
        // Calculate the midpoint
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        
        // Calculate the distance
        const dx = tx - sx;
        const dy = ty - sy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Add a curve to the path
        const curvature = 0.3;
        const cx = mx - curvature * distance * Math.sin(Math.PI / 2);
        const cy = my - curvature * distance * Math.sin(Math.PI / 2);
        
        // Return the SVG path
        return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
    }
});
