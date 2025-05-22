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
    
    // Traffic simulation settings
    let trafficSimulationEnabled = false;
    let trafficSpeed = 5;
    let trafficDensity = 3;
    
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

    // Load network data from server
    function loadNetworkData() {
        fetch(`${API_URL}network`)
            .then(response => response.json())
            .then(data => {
                // Update global data
                networkObjects = data.nodes;
                deviceGroups = data.groups || [];
                
                // Process relationships to include direct node references
                networkRelationships = data.links.map(link => {
                    const sourceNode = networkObjects.find(n => n.id === link.source_id);
                    const targetNode = networkObjects.find(n => n.id === link.target_id);
                    return {
                        ...link,
                        source: sourceNode || { id: link.source_id },
                        target: targetNode || { id: link.target_id }
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
                showToast('Failed to load network data', 'error');
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
        nodes.on('click', (event, d) => {
            // Prevent event bubbling up to SVG
            event.stopPropagation();
            showObjectDetails(d);
        });
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
        window.selectDeviceType = function(element) {
            if (!element) return;
            
            // Remove selected class from all items
            document.querySelectorAll('.device-type-list li').forEach(i => i.classList.remove('selected'));
            
            // Add selected class to clicked item
            element.classList.add('selected');
            
            // Update selected device type
            selectedDeviceType = element.getAttribute('data-type');
            
            // Force a browser reflow to ensure the style changes take effect
            void element.offsetWidth;
            
            // Show toast notification
            showToast(`Selected ${selectedDeviceType} device type`);
            
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
        
        // Add direct click handlers to each device type as a fallback mechanism
        function setupDirectDeviceClickHandlers() {
            // Wait for DOM to be fully loaded
            setTimeout(() => {
                const deviceTypes = ['router', 'switch', 'ap', 'server', 'client', 'nas', 'internet'];
                
                deviceTypes.forEach(type => {
                    const element = document.querySelector(`.device-type-list li[data-type="${type}"]`);
                    
                    if (element) {
                        // Remove any existing click handlers first
                        const newElement = element.cloneNode(true);
                        element.parentNode.replaceChild(newElement, element);
                        
                        // Add new direct click handler
                        newElement.addEventListener('click', function(e) {
                            console.log(`Direct click on ${type}`);
                            e.preventDefault();
                            e.stopPropagation();
                            selectDeviceType(this);
                            return false;
                        });
                    }
                });
                
                console.log("Direct device click handlers initialized");
            }, 500);
        }
        
        // Call the fallback setup
        setupDirectDeviceClickHandlers();
        
        // Create group button
        document.getElementById('create-group-btn').addEventListener('click', function() {
            if (selectedNodes.length < 2) {
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
        
        // Traffic simulation toggle
        document.getElementById('traffic-toggle').addEventListener('change', function() {
            trafficSimulationEnabled = this.checked;
            
            if (trafficSimulationEnabled) {
                startTrafficSimulation();
            } else {
                stopTrafficSimulation();
            }
        });
        
        // Traffic speed control
        document.getElementById('traffic-speed').addEventListener('input', function() {
            trafficSpeed = parseInt(this.value);
            if (trafficSimulationEnabled) {
                updateTrafficSimulation();
            }
        });
        
        // Traffic density control
        document.getElementById('traffic-density').addEventListener('input', function() {
            trafficDensity = parseInt(this.value);
            if (trafficSimulationEnabled) {
                updateTrafficSimulation();
            }
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
            // Find the actual node objects
            const sourceNode = getNodeById(sourceId);
            const targetNode = getNodeById(targetId);
            
            // Add to local data with source and target references for D3
            const relationshipWithRefs = {
                ...data,
                source: sourceNode,
                target: targetNode
            };
            
            networkRelationships.push(relationshipWithRefs);
            
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
        }
        
        // Show object details in the inspector
        showObjectDetails(d);
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
        // Generate a unique ID for the group
        const groupId = 'group_' + Date.now();
        
        // Create the group object
        const group = {
            id: groupId,
            name: name,
            nodeIds: nodes.map(n => n.id),
            expanded: false,
            // Calculate center position based on member nodes
            x: nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length,
            y: nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length,
        };
        
        // Add to groups array
        deviceGroups.push(group);
        
        // Save groups to the database via API
        fetch(`${API_URL}groups`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(group)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Group saved:', data);
        })
        .catch(error => {
            console.error('Error saving group:', error);
        });
        
        // Update visualization
        updateVisualization();
    }
    
    // Handle selection of network nodes
    function toggleNodeSelection(node) {
        const index = selectedNodes.findIndex(n => n.id === node.id);
        
        if (index === -1) {
            // Add to selection
            selectedNodes.push(node);
            d3.select(`#node-${node.id}`).classed('selected', true);
        } else {
            // Remove from selection
            selectedNodes.splice(index, 1);
            d3.select(`#node-${node.id}`).classed('selected', false);
        }
        
        // Update UI to reflect selection
        updateSelectionUI();
    }
    
    // Clear all selected nodes
    function clearNodeSelection() {
        // Remove selected class from all nodes
        d3.selectAll('.network-node').classed('selected', false);
        
        // Clear selection array
        selectedNodes = [];
        
        // Update UI
        updateSelectionUI();
    }
    
    // Update UI elements based on node selection
    function updateSelectionUI() {
        const createGroupBtn = document.getElementById('create-group-btn');
        
        if (selectedNodes.length >= 2) {
            createGroupBtn.classList.add('active');
            createGroupBtn.innerText = `Group ${selectedNodes.length} Devices`;
        } else {
            createGroupBtn.classList.remove('active');
            createGroupBtn.innerText = 'Create Group';
        }
    }
    
    // Start traffic simulation animation
    function startTrafficSimulation() {
        // Clear any existing traffic particles
        d3.selectAll('.traffic-particle').remove();
        
        // Create traffic particles for each relationship
        networkRelationships.forEach(link => {
            createTrafficParticles(link);
        });
    }
    
    // Update traffic simulation based on current settings
    function updateTrafficSimulation() {
        if (!trafficSimulationEnabled) return;
        
        // Stop current simulation
        stopTrafficSimulation();
        
        // Restart with new settings
        startTrafficSimulation();
    }
    
    // Stop traffic simulation
    function stopTrafficSimulation() {
        // Remove all traffic particles
        d3.selectAll('.traffic-particle').remove();
    }
    
    // Create traffic particles for a given link
    function createTrafficParticles(link) {
        const source = getNodeById(link.source.id || link.source);
        const target = getNodeById(link.target.id || link.target);
        
        // Skip if either node is missing
        if (!source || !target) return;
        
        // Number of particles based on density setting
        const particleCount = trafficDensity;
        
        // Create particles
        for (let i = 0; i < particleCount; i++) {
            const particleId = `particle-${link.id}-${i}`;
            const startPosition = Math.random(); // Random position along the path
            
            // Create the particle
            const particle = svg.select('g').append('circle')
                .attr('id', particleId)
                .attr('class', 'traffic-particle')
                .attr('r', 3)
                .attr('opacity', 0.7);
            
            // Animate the particle
            animateParticle(particle, link, source, target, startPosition);
        }
    }
    
    // Animate a traffic particle along a path
    function animateParticle(particle, link, source, target, startPosition) {
        // Calculate speed based on settings (slower = longer duration)
        const duration = 11000 - (trafficSpeed * 1000);
        
        function animate() {
            // Get current source and target positions (they might have moved)
            const currentSource = getNodeById(link.source.id || link.source);
            const currentTarget = getNodeById(link.target.id || link.target);
            
            particle.transition()
                .duration(duration)
                .attrTween('transform', () => {
                    return (t) => {
                        // Circular motion for VPN tunnels
                        if (link.type === 'vpn') {
                            const x1 = currentSource.x;
                            const y1 = currentSource.y;
                            const x2 = currentTarget.x;
                            const y2 = currentTarget.y;
                            
                            // Calculate the midpoint
                            const mx = (x1 + x2) / 2;
                            const my = (y1 + y2) / 2;
                            
                            // Calculate the distance
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            // Add a curve to the path
                            const curvature = 0.3;
                            const cx = mx + curvature * distance * Math.sin(Math.PI / 2);
                            const cy = my + curvature * distance * Math.sin(Math.PI / 2);
                            
                            // Calculate position along the curved path
                            const point = getBezierPoint(t, x1, y1, cx, cy, x2, y2);
                            
                            return `translate(${point.x}, ${point.y})`;
                        } else {
                            // Linear motion for other connection types
                            const x = currentSource.x + (currentTarget.x - currentSource.x) * t;
                            const y = currentSource.y + (currentTarget.y - currentSource.y) * t;
                            return `translate(${x}, ${y})`;
                        }
                    };
                })
                .on('end', () => {
                    if (trafficSimulationEnabled) {
                        animate(); // Restart the animation if still enabled
                    } else {
                        particle.remove(); // Remove particle if simulation is stopped
                    }
                });
        }
        
        // Start the animation with a delay based on start position
        setTimeout(() => {
            if (trafficSimulationEnabled) {
                animate();
            }
        }, startPosition * duration);
    }
    
    // Calculate point on bezier curve (for VPN tunnel animation)
    function getBezierPoint(t, x1, y1, x2, y2, x3, y3) {
        const t1 = 1 - t;
        return {
            x: t1 * t1 * x1 + 2 * t1 * t * x2 + t * t * x3,
            y: t1 * t1 * y1 + 2 * t1 * t * y2 + t * t * y3
        };
    }
    
    function updateVisualization() {
        const container = svg.select('g');
        
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
        const regularLinkUpdate = regularLinkEnter.merge(regularLink)
            .attr('x1', d => getNodeById(d.source.id || d.source).x)
            .attr('y1', d => getNodeById(d.source.id || d.source).y)
            .attr('x2', d => getNodeById(d.target.id || d.target).x)
            .attr('y2', d => getNodeById(d.target.id || d.target).y);
        
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
        const vpnLinkUpdate = vpnLinkEnter.merge(vpnLink)
            .attr('d', d => {
                const source = getNodeById(d.source.id || d.source);
                const target = getNodeById(d.target.id || d.target);
                return renderVPNPath(source, target);
            });
        
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
            .attr('class', 'device-group')
            .attr('r', d => calculateGroupRadius(d))
            .on('dblclick', toggleGroupExpansion);
            
        // Add the group label
        groupEnter.append('text')
            .attr('class', 'device-group-label')
            .attr('dy', -10)
            .text(d => d.name);
            
        // Merge and update all groups
        const groupUpdate = groupEnter.merge(group);
        
        groupUpdate.select('circle')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', d => calculateGroupRadius(d))
            .classed('expanded-group', d => d.expanded);
            
        groupUpdate.select('text')
            .attr('x', d => d.x)
            .attr('y', d => d.y - calculateGroupRadius(d));
        
        // Update nodes
        const node = container.selectAll('.network-node')
            .data(networkObjects, d => d.id);
            
        // Remove old nodes
        node.exit().remove();
        
        // Create new nodes
        const nodeEnter = node.enter()
            .append('g')
            .attr('class', 'network-node')
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
        const nodeUpdate = nodeEnter.merge(node)
            .attr('transform', d => {
                // Check if node is part of a collapsed group
                const groupContainingNode = deviceGroups.find(g => 
                    g.nodeIds.includes(d.id) && !g.expanded
                );
                
                if (groupContainingNode) {
                    // If node is in a collapsed group, position at the group's center
                    return `translate(${groupContainingNode.x}, ${groupContainingNode.y})`;
                } else {
                    // Otherwise, use the node's own position
                    return `translate(${d.x}, ${d.y})`;
                }
            });
        
        // Update node visibility based on group expansion state
        nodeUpdate.style('opacity', d => {
            const groupContainingNode = deviceGroups.find(g => 
                g.nodeIds.includes(d.id) && !g.expanded
            );
            
            return groupContainingNode ? 0 : 1;
        });
        
        // Update simulation nodes only when needed
        if (simulation) {
            simulation.nodes(networkObjects);
            simulation.force('link').links(networkRelationships);
            simulation.alpha(0.3).restart();
        }
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
        
        // Update the visualization
        updateVisualization();
        
        // Restart the simulation
        simulation.alpha(0.3).restart();
        
        // Stop event propagation
        event.stopPropagation();
    }
    
    // Render a VPN tunnel path between two points
    function renderVPNPath(source, target) {
        // Calculate the midpoint
        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        
        // Calculate the distance
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Add a curve to the path
        const curvature = 0.3;
        const cx = mx - curvature * distance * Math.sin(Math.PI / 2);
        const cy = my - curvature * distance * Math.sin(Math.PI / 2);
        
        // Return the SVG path
        return `M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`;
    }
});
