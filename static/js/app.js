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
    
    // Context menu state
    let contextMenuTarget = null;
    let currentContextNode = null;
    let currentContextConnection = null;
    
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
        
        // Initialize the inspector panel
        initializeInspector();
        
        // Initialize confirmation modal
        initializeConfirmationModal();
    }
    
    // Initialize the inspector panel with an empty state message
    function initializeInspector() {
        // Make sure the inspector content element exists
        const inspectorContent = document.getElementById('inspector-content');
        if (inspectorContent) {
            inspectorContent.innerHTML = '<p class="empty-state">Select a network object to view details</p>';
        } else {
            console.error('Inspector content element not found');
        }
        
        // Initially hide the inspector
        hideInspector();
    }
    
    // Show the floating inspector with animation
    function showInspector() {
        const floatingInspector = document.getElementById('floating-inspector');
        const networkCanvas = document.querySelector('.network-canvas');
        
        if (floatingInspector && networkCanvas) {
            floatingInspector.classList.add('visible');
            networkCanvas.classList.add('inspector-visible');
        }
    }
    
    // Hide the floating inspector with animation
    function hideInspector() {
        const floatingInspector = document.getElementById('floating-inspector');
        const networkCanvas = document.querySelector('.network-canvas');
        
        if (floatingInspector && networkCanvas) {
            floatingInspector.classList.remove('visible');
            networkCanvas.classList.remove('inspector-visible');
        }
    }
    
    // Preload SVG icons for devices to ensure they're cached
    function preloadIcons(iconTypes) {
        const iconPromises = iconTypes.map(type => {
            // Map client to computer.svg for proper file loading
            let iconFileName = type;
            if (type === 'ap') {
                iconFileName = 'access-point';
            } else if (type === 'client') {
                iconFileName = 'computer';
            }
            
            return fetch(`/static/img/${iconFileName}.svg`)
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
                // Hide inspector when nothing is selected
                hideInspector();
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
                
                // Completely clear and redraw the network visualization
                const container = svg.select('g');
                container.selectAll('*').remove();
                
                // Update the visualization - use updateNetworkGraph instead of updateVisualization
                // to ensure everything is properly redrawn from scratch
                updateNetworkGraph();
                
                // Enforce a higher alpha value to ensure proper initial layout
                simulation.alpha(0.8).restart();
            })
            .catch(error => {
                console.error('Error loading network data:', error);
                showToast('Failed to load network data: ' + error.message, 'error');
            });
    }

    function updateNetworkGraph() {
        const container = svg.select('g');
        
        // Clear previous elements completely
        container.selectAll('*').remove();
        
        // Create elements in the proper order to ensure correct z-index
        // First add links (relationships) so they appear behind nodes
        const links = container.selectAll('.link')
            .data(networkRelationships)
            .enter()
            .append('line')
            .attr('class', d => `link ${d.type || 'ethernet'}`)
            .attr('id', d => `link-${d.id}`)
            .on('contextmenu', function(event, d) {
                console.log('Link right-clicked:', d.id, d.type);
                event.preventDefault();
                event.stopPropagation();
                currentContextConnection = d;
                const [x, y] = d3.pointer(event, document.body);
                console.log('Showing connection context menu at:', x, y);
                showContextMenu('connection-context-menu', x, y);
            });
        
        // Then add VPN links with curved paths
        const vpnLinks = networkRelationships.filter(d => d.type === 'vpn');
        
        console.log('Creating VPN links:', vpnLinks.length, vpnLinks);
        
        container.selectAll('.vpn-link')
            .data(vpnLinks)
            .enter()
            .append('path')
            .attr('class', 'link vpn')
            .attr('id', d => `vpn-link-${d.id}`)
            .attr('d', d => {
                const source = getNodeById(d.source_id);
                const target = getNodeById(d.target_id);
                return renderVPNPath(source, target);
            })
            .on('contextmenu', function(event, d) {
                console.log('VPN Link right-clicked:', d);
                console.log('VPN Link data structure:', {
                    id: d.id,
                    type: d.type,
                    source_id: d.source_id,
                    target_id: d.target_id,
                    source: d.source,
                    target: d.target
                });
                event.preventDefault();
                event.stopPropagation();
                currentContextConnection = d;
                console.log('Set currentContextConnection to:', currentContextConnection);
                const [x, y] = d3.pointer(event, document.body);
                console.log('Showing VPN connection context menu at:', x, y);
                showContextMenu('connection-context-menu', x, y);
            });
        
        // Add groups
        const groups = container.selectAll('.device-group')
            .data(deviceGroups)
            .enter()
            .append('g')
            .attr('class', 'device-group-container')
            .attr('id', d => `group-${d.id}`);
        
        // Add group circles
        groups.append('circle')
            .attr('class', d => `device-group ${d.expanded ? 'expanded-group' : ''}`)
            .attr('r', d => calculateGroupRadius(d))
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .on('dblclick', toggleGroupExpansion);
        
        // Add group labels
        groups.append('text')
            .attr('class', 'device-group-label')
            .attr('x', d => d.x)
            .attr('y', d => d.y - calculateGroupRadius(d))
            .attr('text-anchor', 'middle')
            .text(d => d.name);
        
        // Add node count for collapsed groups
        groups.append('text')
            .attr('class', 'group-node-count')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .text(d => d.expanded ? '' : `${d.nodeIds ? d.nodeIds.length : 0}`);
        
        // Add nodes (network objects)
        const nodes = container.selectAll('.node')
            .data(networkObjects)
            .enter()
            .append('g')
            .attr('class', 'network-node')
            .attr('id', d => `node-${d.id}`)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended))
            .on('click', handleNodeClick)
            .on('contextmenu', function(event, d) {
                console.log('Node right-clicked:', d.name, d.id);
                event.preventDefault();
                event.stopPropagation();
                currentContextNode = d;
                const [x, y] = d3.pointer(event, document.body);
                console.log('Showing node context menu at:', x, y);
                showContextMenu('node-context-menu', x, y);
            });
        
        // Add circles to nodes with icons based on type
        nodes.append('circle')
            .attr('class', 'node-border')
            .attr('r', 25)
            .attr('fill', 'white')
            .attr('stroke', d => getNodeColor(d.type))
            .attr('stroke-width', 2);
            
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
            .attr('dy', 38)
            .attr('text-anchor', 'middle')
            .text(d => d.name);
        
        // Add IP address/netmask labels with enhanced visibility
        nodes.each(function(d) {
            // Add a background for the IP text if there is network info
            const networkInfo = getNetworkDetails(d.metadata);
            if (networkInfo) {
                const node = d3.select(this);
                
                // Add a small background rectangle for better visibility
                node.append('rect')
                    .attr('class', 'ip-label-bg')
                    .attr('width', networkInfo.length * 6 + 10) // Approximate width based on text length
                    .attr('height', 18)
                    .attr('x', -(networkInfo.length * 6 + 10) / 2) // Center horizontally
                    .attr('y', 42)  // Position just below the node name
                    .attr('rx', 4) // Rounded corners
                    .attr('ry', 4)
                    .attr('fill', 'rgba(255,255,255,0.8)'); // Semi-transparent white
                    
                // Add the IP text on top of background
                node.append('text')
                    .attr('class', 'ip-label')
                    .attr('dy', 56)  // Position just below the node name
                    .attr('text-anchor', 'middle')
                    .text(networkInfo);
            }
        });
        
        // Update node positions
        nodes.attr('transform', d => {
            const containingGroup = deviceGroups.find(g => 
                g.nodeIds && g.nodeIds.includes(d.id) && !g.expanded
            );
            
            if (containingGroup) {
                // Position at group center if in collapsed group
                return `translate(${containingGroup.x}, ${containingGroup.y})`;
            } else {
                return `translate(${d.x}, ${d.y})`;
            }
        });
        
        // Update regular links
        links
            .attr('x1', d => {
                const source = getNodeById(d.source_id);
                return source.x;
            })
            .attr('y1', d => {
                const source = getNodeById(d.source_id);
                return source.y;
            })
            .attr('x2', d => {
                const target = getNodeById(d.target_id);
                return target.x;
            })
            .attr('y2', d => {
                const target = getNodeById(d.target_id);
                return target.y;
            });
        
        // Set up simulation
        simulation
            .nodes(networkObjects)
            .on('tick', () => {
                // Update positions during simulation
                links
                    .attr('x1', d => {
                        const sourceNode = getNodeById(d.source_id);
                        return sourceNode.x;
                    })
                    .attr('y1', d => {
                        const sourceNode = getNodeById(d.source_id);
                        return sourceNode.y;
                    })
                    .attr('x2', d => {
                        const targetNode = getNodeById(d.target_id);
                        return targetNode.x;
                    })
                    .attr('y2', d => {
                        const targetNode = getNodeById(d.target_id);
                        return targetNode.y;
                    });
                
                // Update VPN paths
                container.selectAll('.vpn')
                    .attr('d', d => {
                        const source = getNodeById(d.source_id);
                        const target = getNodeById(d.target_id);
                        return renderVPNPath(source, target);
                    });
                
                // Update groups
                container.selectAll('.device-group-container')
                    .each(function(d) {
                        const group = d3.select(this);
                        group.select('circle')
                            .attr('cx', d.x)
                            .attr('cy', d.y);
                        
                        group.select('.device-group-label')
                            .attr('x', d.x)
                            .attr('y', d.y - calculateGroupRadius(d));
                        
                        group.select('.group-node-count')
                            .attr('x', d.x)
                            .attr('y', d.y);
                    });
                
                // Update node positions
                nodes
                    .attr('transform', d => {
                        const containingGroup = deviceGroups.find(g => 
                            g.nodeIds && g.nodeIds.includes(d.id) && !g.expanded
                        );
                        
                        if (containingGroup) {
                            // Position at group center if in collapsed group
                            return `translate(${containingGroup.x}, ${containingGroup.y})`;
                        } else {
                            return `translate(${d.x}, ${d.y})`;
                        }
                    });
            });
        
        simulation.force('link')
            .links(networkRelationships);
        
        // Restart simulation with higher alpha for better initialization
        simulation.alpha(0.8).restart();
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
        if (!metadata) return '';
        
        const ip = metadata.ip || '';
        const netmask = metadata.netmask || '';
        
        if (ip && netmask) {
            return `${ip}/${netmask}`;
        } else if (ip) {
            return ip;
        }
        return '';
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
        // Reference the inspector content element
        const inspectorContent = document.getElementById('inspector-content');
        if (!inspectorContent) {
            console.error('Inspector content element not found');
            return;
        }
        
        console.log('Showing details for object:', object);
        
        // Show the inspector with animation
        showInspector();
        
        // Ensure metadata exists
        if (!object.metadata) {
            object.metadata = {};
        }
        
        // Make sure we have access to IP and netmask values (check for undefined/null)
        const ipValue = object.metadata.ip || '';
        const netmaskValue = object.metadata.netmask || '';
        
        // Create the HTML content for the inspector with prominent network details section
        const htmlContent = `
            <div class="object-details">
                <h4>${object.name}</h4>
                <p><strong>ID:</strong> ${object.id}</p>
                <p><strong>Type:</strong> ${object.type}</p>
                
                <div class="network-details" style="background-color: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 5px; border: 2px solid #2196F3;">
                    <h5 style="color: #0d47a1; margin-bottom: 12px; font-size: 16px;">Network Details</h5>
                    <form id="network-details-form" data-id="${object.id}">
                        <div class="form-group">
                            <label for="ip-address" style="font-weight: bold;">IP Address:</label>
                            <input type="text" id="ip-address" value="${ipValue}" placeholder="e.g., 192.168.1.1" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #bbb;">
                        </div>
                        <div class="form-group">
                            <label for="netmask" style="font-weight: bold;">Netmask:</label>
                            <input type="text" id="netmask" value="${netmaskValue}" placeholder="e.g., 24 or 255.255.255.0" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #bbb;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 10px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Update Network Details</button>
                    </form>
                </div>
                
                <div class="metadata">
                    <h5>Other Metadata</h5>
                    <pre>${JSON.stringify(object.metadata || {}, null, 2)}</pre>
                </div>
                
                <div class="actions">
                    <button class="btn btn-delete" data-id="${object.id}">Delete</button>
                </div>
            </div>
        `;
        
        // Set the HTML content
        inspectorContent.innerHTML = htmlContent;
        
        // Force layout recalculation to ensure rendering
        void inspectorContent.offsetHeight;
        
        // Add event listener for delete button
        const deleteBtn = inspectorContent.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (event) => {
                const objectId = event.target.getAttribute('data-id');
                deleteNetworkObject(objectId);
            });
        } else {
            console.error('Delete button not found in inspector');
        }
        
        // Add event listener for network details form
        const networkForm = inspectorContent.querySelector('#network-details-form');
        if (networkForm) {
            console.log('Network form found, attaching event listener');
            
            // Use addEventListener instead of onsubmit for better reliability
            networkForm.addEventListener('submit', function(event) {
                event.preventDefault();
                
                // Get the form values
                const objectId = this.getAttribute('data-id');
                const ipAddressInput = this.querySelector('#ip-address');
                const netmaskInput = this.querySelector('#netmask');
                
                if (!ipAddressInput || !netmaskInput) {
                    console.error('Form inputs not found');
                    return;
                }
                
                const ipAddress = ipAddressInput.value;
                const netmask = netmaskInput.value;
                
                console.log(`Updating network details: ID=${objectId}, IP=${ipAddress}, Netmask=${netmask}`);
                
                // Update the network details
                updateNetworkDetails(objectId, ipAddress, netmask);
            });
            
            console.log('Network details form event listener attached');
        } else {
            console.error('Network details form not found in inspector');
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
                hideUpdateConnectionModal();
            });
        });
        
        // Floating Inspector Toggle
        const inspectorToggle = document.getElementById('inspector-toggle');
        const floatingInspector = document.getElementById('floating-inspector');
        const inspectorBody = document.getElementById('inspector-body');
        
        if (inspectorToggle && floatingInspector) {
            inspectorToggle.addEventListener('click', function() {
                const isCollapsed = floatingInspector.classList.contains('collapsed');
                
                if (isCollapsed) {
                    // Expand
                    floatingInspector.classList.remove('collapsed');
                    this.textContent = '−';
                } else {
                    // Collapse
                    floatingInspector.classList.add('collapsed');
                    this.textContent = '+';
                }
            });
        }
        
        // Make the floating inspector draggable
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        const inspectorHeader = document.querySelector('.inspector-header');
        
        if (inspectorHeader && floatingInspector) {
            inspectorHeader.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
            
            function dragStart(e) {
                if (e.target.classList.contains('inspector-toggle')) {
                    return; // Don't drag when clicking the toggle button
                }
                
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                
                if (e.target === inspectorHeader || inspectorHeader.contains(e.target)) {
                    isDragging = true;
                    floatingInspector.style.cursor = 'grabbing';
                    inspectorHeader.style.cursor = 'grabbing';
                }
            }
            
            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    
                    xOffset = currentX;
                    yOffset = currentY;
                    
                    // Constrain to viewport
                    const rect = floatingInspector.getBoundingClientRect();
                    const maxX = window.innerWidth - rect.width;
                    const maxY = window.innerHeight - rect.height;
                    
                    xOffset = Math.max(0, Math.min(xOffset, maxX));
                    yOffset = Math.max(0, Math.min(yOffset, maxY));
                    
                    floatingInspector.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                }
            }
            
            function dragEnd(e) {
                if (isDragging) {
                    isDragging = false;
                    floatingInspector.style.cursor = 'default';
                    inspectorHeader.style.cursor = 'move';
                }
            }
        }
        
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
                    const nodeNames = selectedNodes.map(node => `"${node.name}"`).join(', ');
                    const deviceText = count > 1 ? 'devices' : 'device';
                    
                    showConfirmationModal(
                        `Delete ${count} ${deviceText}`,
                        `Are you sure you want to delete ${count > 1 ? 'these' : 'this'} ${deviceText}? ${count <= 3 ? nodeNames : `${count} devices`}`,
                        'Delete All',
                        function() {
                            // Delete each selected node
                            const deletePromises = selectedNodes.map(node => 
                                fetch(`${API_URL}objects/${node.id}`, {
                                    method: 'DELETE'
                                })
                            );
                            
                            Promise.all(deletePromises)
                                .then(() => {
                                    showToast(`Deleted ${count} ${deviceText} successfully`);
                                    loadNetworkData();
                                    clearNodeSelection();
                                })
                                .catch(error => {
                                    console.error('Error deleting nodes:', error);
                                    showToast('Error deleting devices', 'error');
                                });
                        }
                    );
                }
            }
            
            // Escape: Clear selection
            if (event.key === 'Escape') {
                clearNodeSelection(); // This will hide the inspector
            }
        });
        
        // Close buttons for modals
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                addNodeModal.style.display = 'none';
                addConnectionModal.style.display = 'none';
                document.getElementById('create-group-modal').style.display = 'none';
                hideUpdateConnectionModal();
            });
        });
        
        // Context Menu Event Listeners
        
        // Hide context menus when clicking elsewhere
        document.addEventListener('click', function(event) {
            console.log('Global click handler triggered. Target:', event.target, 'Closest context menu:', event.target.closest('.context-menu'));
            
            if (!event.target.closest('.context-menu')) {
                console.log('Click was outside context menu, hiding all context menus');
                hideAllContextMenus();
            } else {
                console.log('Click was inside context menu, not hiding');
            }
        });
        
        // Prevent browser context menu on canvas
        document.getElementById('network-graph').addEventListener('contextmenu', function(event) {
            event.preventDefault();
        });
        
        // Node context menu actions
        const renameNodeBtn = document.getElementById('rename-node');
        const deleteNodeBtn = document.getElementById('delete-node');
        
        if (renameNodeBtn) {
            console.log('Found rename-node button, attaching event listener');
            renameNodeBtn.addEventListener('click', function(event) {
                console.log('=== RENAME NODE BUTTON CLICKED ===');
                event.stopPropagation(); // Prevent global click handler from firing
                console.log('Rename node clicked, currentContextNode:', currentContextNode);
                
                // Get the context node from the button's data or global variable
                const contextNode = this.contextNode || currentContextNode;
                console.log('Using context node:', contextNode);
                
                if (contextNode) {
                    console.log('About to call hideAllContextMenus()');
                    hideAllContextMenus();
                    console.log('About to call showRenameModal with node:', contextNode);
                    showRenameModal(contextNode);
                } else {
                    console.warn('No current context node set');
                }
            });
        } else {
            console.error('rename-node button not found');
        }
        
        if (deleteNodeBtn) {
            console.log('Found delete-node button, attaching event listener');
            deleteNodeBtn.addEventListener('click', function(event) {
                event.stopPropagation(); // Prevent global click handler from firing
                console.log('Delete node clicked, currentContextNode:', currentContextNode);
                
                // Get the context node from the button's data or global variable
                const contextNode = this.contextNode || currentContextNode;
                console.log('Using context node:', contextNode);
                
                if (contextNode) {
                    hideAllContextMenus();
                    deleteNetworkObject(contextNode.id);
                } else {
                    console.warn('No current context node set');
                }
            });
        } else {
            console.error('delete-node button not found');
        }
        
        // Connection context menu actions
        const updateConnectionBtn = document.getElementById('update-connection');
        const deleteConnectionBtn = document.getElementById('delete-connection');
        
        if (updateConnectionBtn) {
            console.log('Found update-connection button, attaching event listener');
            updateConnectionBtn.addEventListener('click', function(event) {
                event.stopPropagation(); // Prevent global click handler from firing
                console.log('Update connection clicked, currentContextConnection:', currentContextConnection);
                
                // Get the context connection from the button's data or global variable
                const contextConnection = this.contextConnection || currentContextConnection;
                console.log('Using context connection:', contextConnection);
                
                if (contextConnection) {
                    hideAllContextMenus();
                    showUpdateConnectionModal(contextConnection);
                } else {
                    console.warn('No current context connection set');
                }
            });
        } else {
            console.error('update-connection button not found');
        }
        
        if (deleteConnectionBtn) {
            console.log('Found delete-connection button, attaching event listener');
            deleteConnectionBtn.addEventListener('click', function(event) {
                event.stopPropagation(); // Prevent global click handler from firing
                console.log('Delete connection clicked, currentContextConnection:', currentContextConnection);
                
                // Get the context connection from the button's data or global variable
                const contextConnection = this.contextConnection || currentContextConnection;
                console.log('Using context connection:', contextConnection);
                
                if (contextConnection) {
                    hideAllContextMenus();
                    deleteConnection(contextConnection.id);
                } else {
                    console.warn('No current context connection set');
                }
            });
        } else {
            console.error('delete-connection button not found');
        }
        
        // Rename modal handlers
        document.getElementById('cancel-rename').addEventListener('click', hideRenameModal);
        
        document.getElementById('confirm-rename').addEventListener('click', function() {
            console.log('Confirm rename button clicked');
            const newName = document.getElementById('rename-input').value;
            console.log('New name from input:', newName);
            console.log('Current context node:', currentContextNode);
            
            if (currentContextNode && newName.trim()) {
                console.log('Calling renameNetworkObject with:', currentContextNode.id, newName);
                renameNetworkObject(currentContextNode.id, newName);
                hideRenameModal();
            } else {
                console.warn('Cannot rename - missing context node or empty name');
            }
        });
        
        // Handle Enter key in rename input
        document.getElementById('rename-input').addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                const newName = this.value;
                if (currentContextNode && newName.trim()) {
                    renameNetworkObject(currentContextNode.id, newName);
                    hideRenameModal();
                }
            } else if (event.key === 'Escape') {
                hideRenameModal();
            }
        });
        
        // Update connection form handler
        document.getElementById('update-connection-form').addEventListener('submit', function(event) {
            event.preventDefault();
            const newType = document.getElementById('update-connection-type').value;
            if (currentContextConnection) {
                updateConnection(currentContextConnection.id, newType);
                hideUpdateConnectionModal();
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
        // Find the object to get its name for the confirmation message
        const object = networkObjects.find(obj => obj.id === objectId);
        const objectName = object ? object.name : 'this object';
        
        showConfirmationModal(
            'Delete Network Object',
            `Are you sure you want to delete "${objectName}"? This action cannot be undone.`,
            'Delete',
            function() {
                // This function will be called when user confirms
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
                        hideInspector();
                        
                        showToast(`"${objectName}" deleted successfully`);
                    } else {
                        console.error('Error deleting network object');
                        showToast('Failed to delete network object', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error deleting network object:', error);
                    showToast('Failed to delete network object: ' + error.message, 'error');
                });
            }
        );
    }

    function updateNetworkDetails(objectId, ipAddress, netmask) {
        // Find the object
        const object = networkObjects.find(obj => obj.id === objectId);
        if (!object) {
            console.error('Object not found:', objectId);
            return;
        }
        
        console.log(`Updating object ${objectId} with IP=${ipAddress}, Netmask=${netmask}`);
        
        // Ensure object has a metadata object
        if (!object.metadata) {
            object.metadata = {};
        }
        
        // Create update data with new network details
        const updateData = {
            metadata: {
                ...object.metadata,
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
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Network details updated successfully:', data);
            
            // Update local object data
            object.metadata = data.metadata || {};
            
            // Update visualization with complete refresh
            const container = svg.select('g');
            container.selectAll('*').remove();
            updateNetworkGraph();
            
            // Show toast notification
            showToast(`Updated network details for ${object.name}`);
            
            // Update the inspector to show the new values
            showObjectDetails(object);
        })
        .catch(error => {
            console.error('Error updating network details:', error);
            showToast('Failed to update network details: ' + error.message, 'error');
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
        // Log debug information
        console.log('Node clicked - ID:', d.id, 'Name:', d.name, 'Type:', d.type);
        
        // Prevent event propagation to avoid deselection
        event.stopPropagation();
        
        // Toggle selection if Ctrl/Cmd key is pressed
        if (event.ctrlKey || event.metaKey) {
            toggleNodeSelection(d);
        } else {
            // Single selection mode - clear other selections without hiding inspector
            clearNodeSelectionSilent();
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
        
        // Always show object details for the clicked node
        console.log('Calling showObjectDetails with node:', d);
        showObjectDetails(d);
        
        // Debug selection state
        console.log(`Selection state after click:`, selectedNodes.map(n => n.name || n.id));
        
        // Apply selection highlighting without full redraw
        applySelectionHighlighting();
    }

    // Apply selection highlighting to nodes without full redraw
    function applySelectionHighlighting() {
        // Remove selection from all nodes
        d3.selectAll('.network-node').classed('selected', false);
        
        // Add selection to selected nodes
        selectedNodes.forEach(node => {
            d3.select(`#node-${node.id}`).classed('selected', true);
        });
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
        
        // Don't clear and redraw during drag - let simulation handle the updates
        // Restart simulation with minimal energy to update positions
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
        
        // Hide inspector when nothing is selected
        hideInspector();
        
        // Update UI
        updateSelectionUI();
    }
    
    // Clear selection without hiding inspector (for internal use when switching selections)
    function clearNodeSelectionSilent() {
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
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .on('dblclick', toggleGroupExpansion);
            
        // Add the group label
        groupEnter.append('text')
            .attr('class', 'device-group-label')
            .attr('x', d => d.x)
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
            .on('click', handleNodeClick)
            .on('contextmenu', function(event, d) {
                console.log('Node right-clicked:', d.name, d.id);
                event.preventDefault();
                event.stopPropagation();
                currentContextNode = d;
                const [x, y] = d3.pointer(event, document.body);
                console.log('Showing node context menu at:', x, y);
                showContextMenu('node-context-menu', x, y);
            });
        
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
        
        // Add IP address/netmask labels with enhanced visibility
        nodeEnter.each(function(d) {
            // Add a background for the IP text if there is network info
            const networkInfo = getNetworkDetails(d.metadata);
            if (networkInfo) {
                const node = d3.select(this);
                
                // Add a small background rectangle for better visibility
                node.append('rect')
                    .attr('class', 'ip-label-bg')
                    .attr('width', networkInfo.length * 6 + 10) // Approximate width based on text length
                    .attr('height', 18)
                    .attr('x', -(networkInfo.length * 6 + 10) / 2) // Center horizontally
                    .attr('y', 40)  // Position just below the node name
                    .attr('rx', 4) // Rounded corners
                    .attr('ry', 4)
                    .attr('fill', 'rgba(255,255,255,0.8)'); // Semi-transparent white
                    
                // Add the IP text on top of background
                node.append('text')
                    .attr('class', 'network-info')
                    .attr('text-anchor', 'middle')
                    .attr('dy', 54)
                    .text(networkInfo);
            }
        });
        
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
        
        // Calculate the distance
        const dx = tx - sx;
        const dy = ty - sy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // For straight-line VPN connections
        if (distance < 150) {
            // Use a simple straight line for short distances
            return `M${sx},${sy} L${tx},${ty}`;
        }
        
        // For curved connections
        // Determine curve direction - perpendicular to the line
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle + Math.PI/2;
        
        // Calculate control point - perpendicular to the midpoint
        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;
        const curvature = distance * 0.2; // Adjust curve magnitude based on distance
        
        // Create control point
        const ctrlX = midX + curvature * Math.cos(perpAngle);
        const ctrlY = midY + curvature * Math.sin(perpAngle);
        
        // Return a simple quadratic curve path
        return `M${sx},${sy} Q${ctrlX},${ctrlY} ${tx},${ty}`;
    }

    // Context Menu Functions
    function showContextMenu(menuId, x, y) {
        console.log('showContextMenu called with:', menuId, x, y);
        
        // Hide any existing context menu displays (but keep context variables)
        hideContextMenuDisplays();
        
        const menu = document.getElementById(menuId);
        console.log('Found menu element:', menu);
        
        if (menu) {
            menu.style.display = 'block';
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            
            console.log('Menu positioned at:', menu.style.left, menu.style.top);
            
            // Store context data in the menu buttons as backup
            if (menuId === 'node-context-menu' && currentContextNode) {
                const renameBtn = document.getElementById('rename-node');
                const deleteBtn = document.getElementById('delete-node');
                if (renameBtn) renameBtn.contextNode = currentContextNode;
                if (deleteBtn) deleteBtn.contextNode = currentContextNode;
                console.log('Stored context node in buttons:', currentContextNode);
            } else if (menuId === 'connection-context-menu' && currentContextConnection) {
                const updateBtn = document.getElementById('update-connection');
                const deleteBtn = document.getElementById('delete-connection');
                if (updateBtn) updateBtn.contextConnection = currentContextConnection;
                if (deleteBtn) deleteBtn.contextConnection = currentContextConnection;
                console.log('Stored context connection in buttons:', currentContextConnection);
            }
            
            // Ensure menu doesn't go off screen
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (x - rect.width) + 'px';
                console.log('Adjusted left position:', menu.style.left);
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (y - rect.height) + 'px';
                console.log('Adjusted top position:', menu.style.top);
            }
            
            console.log('Context menu should now be visible');
        } else {
            console.error('Menu element not found:', menuId);
        }
    }
    
    // Hide context menu displays without clearing context variables
    function hideContextMenuDisplays() {
        document.querySelectorAll('.context-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
    
    function hideAllContextMenus() {
        console.log('hideAllContextMenus called, clearing context variables');
        console.log('Before clearing - currentContextNode:', currentContextNode, 'currentContextConnection:', currentContextConnection);
        
        hideContextMenuDisplays();
        
        // Reset context state
        currentContextNode = null;
        currentContextConnection = null;
        
        console.log('After clearing - currentContextNode:', currentContextNode, 'currentContextConnection:', currentContextConnection);
    }
    
    function showRenameModal(node) {
        console.log('showRenameModal called with node:', node);
        const modal = document.getElementById('rename-modal');
        const input = document.getElementById('rename-input');
        
        console.log('Found modal:', modal, 'input:', input);
        
        if (modal && input) {
            // Ensure we set the current context node
            currentContextNode = node;
            console.log('Set currentContextNode to:', currentContextNode);
            
            input.value = node.name || '';
            modal.style.display = 'flex';
            input.focus();
            input.select();
            console.log('Rename modal should now be visible with name:', input.value);
        } else {
            console.error('Rename modal elements not found');
        }
    }
    
    function hideRenameModal() {
        const modal = document.getElementById('rename-modal');
        if (modal) {
            modal.style.display = 'none';
            currentContextNode = null;
        }
    }
    
    function showUpdateConnectionModal(connection) {
        const modal = document.getElementById('update-connection-modal');
        const select = document.getElementById('update-connection-type');
        
        if (modal && select) {
            currentContextConnection = connection;
            select.value = connection.type || 'ethernet';
            modal.style.display = 'block';
        }
    }
    
    function hideUpdateConnectionModal() {
        const modal = document.getElementById('update-connection-modal');
        if (modal) {
            modal.style.display = 'none';
            currentContextConnection = null;
        }
    }
    
    // API Functions for Context Menu Actions
    function renameNetworkObject(objectId, newName) {
        console.log('renameNetworkObject called with:', objectId, newName);
        
        if (!newName.trim()) {
            console.error('Name cannot be empty');
            showToast('Name cannot be empty', 'error');
            return;
        }
        
        const updateData = {
            name: newName.trim()
        };
        
        console.log('Sending PATCH request to:', `${API_URL}objects/${objectId}`, 'with data:', updateData);
        
        fetch(`${API_URL}objects/${objectId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        })
        .then(response => {
            console.log('PATCH response received:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Object renamed successfully:', data);
            
            // Update local object data
            const object = networkObjects.find(obj => obj.id === objectId);
            if (object) {
                object.name = newName.trim();
                console.log('Updated local object:', object);
            } else {
                console.warn('Could not find object in local data:', objectId);
            }
            
            // Update visualization
            updateNetworkGraph();
            
            // Show toast notification
            showToast(`Renamed to "${newName.trim()}"`);
            
            // Update inspector if showing this object
            if (currentContextNode && currentContextNode.id === objectId) {
                showObjectDetails(object);
            }
        })
        .catch(error => {
            console.error('Error renaming object:', error);
            showToast('Failed to rename object: ' + error.message, 'error');
        });
    }
    
    function updateConnection(connectionId, newType) {
        const updateData = {
            type: newType
        };
        
        fetch(`${API_URL}relationships/${connectionId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Connection updated successfully:', data);
            
            // Update local relationship data
            const relationship = networkRelationships.find(rel => rel.id === connectionId);
            if (relationship) {
                relationship.type = newType;
            }
            
            // Update visualization
            updateNetworkGraph();
            
            // Show toast notification
            showToast(`Connection updated to ${newType}`);
        })
        .catch(error => {
            console.error('Error updating connection:', error);
            showToast('Failed to update connection: ' + error.message, 'error');
        });
    }
    
    function deleteConnection(connectionId) {
        // Find the connection to get details for the confirmation message
        const connection = networkRelationships.find(rel => rel.id === connectionId);
        let connectionDesc = 'this connection';
        
        if (connection) {
            const sourceNode = getNodeById(connection.source_id);
            const targetNode = getNodeById(connection.target_id);
            const sourceName = sourceNode ? sourceNode.name : 'Unknown';
            const targetName = targetNode ? targetNode.name : 'Unknown';
            connectionDesc = `the ${connection.type} connection between "${sourceName}" and "${targetName}"`;
        }
        
        showConfirmationModal(
            'Delete Connection',
            `Are you sure you want to delete ${connectionDesc}? This action cannot be undone.`,
            'Delete',
            function() {
                // This function will be called when user confirms
                fetch(`${API_URL}relationships/${connectionId}`, {
                    method: 'DELETE'
                })
                .then(response => {
                    if (response.ok) {
                        // Remove from local data
                        networkRelationships = networkRelationships.filter(rel => rel.id !== connectionId);
                        
                        // Update visualization
                        updateNetworkGraph();
                        
                        showToast('Connection deleted successfully');
                    } else {
                        console.error('Error deleting connection');
                        showToast('Failed to delete connection', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error deleting connection:', error);
                    showToast('Failed to delete connection: ' + error.message, 'error');
                });
            }
        );
    }

    // Custom Confirmation Modal Functions
    let currentConfirmationCallback = null;
    
    function showConfirmationModal(title, message, confirmText = 'Delete', onConfirm) {
        const modal = document.getElementById('confirmation-modal');
        const titleElement = document.getElementById('confirmation-title');
        const messageElement = document.getElementById('confirmation-message');
        const confirmButton = document.getElementById('confirmation-confirm');
        
        if (modal && titleElement && messageElement && confirmButton) {
            titleElement.textContent = title;
            messageElement.textContent = message;
            confirmButton.textContent = confirmText;
            
            // Store the callback
            currentConfirmationCallback = onConfirm;
            
            // Show the modal
            modal.style.display = 'block';
            
            // Add a slight delay to trigger the animation
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        }
    }
    
    function hideConfirmationModal() {
        const modal = document.getElementById('confirmation-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            currentConfirmationCallback = null;
        }
    }
    
    // Initialize confirmation modal event listeners
    function initializeConfirmationModal() {
        const cancelButton = document.getElementById('confirmation-cancel');
        const confirmButton = document.getElementById('confirmation-confirm');
        const overlay = document.querySelector('.confirmation-overlay');
        
        if (cancelButton) {
            cancelButton.addEventListener('click', hideConfirmationModal);
        }
        
        if (confirmButton) {
            confirmButton.addEventListener('click', function() {
                if (currentConfirmationCallback) {
                    currentConfirmationCallback();
                }
                hideConfirmationModal();
            });
        }
        
        if (overlay) {
            overlay.addEventListener('click', hideConfirmationModal);
        }
        
        // Close on Escape key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                const modal = document.getElementById('confirmation-modal');
                if (modal && modal.style.display === 'block') {
                    hideConfirmationModal();
                }
            }
        });
    }
});
