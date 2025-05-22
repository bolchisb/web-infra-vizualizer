// Device Selection Fix
// This script fixes any issues with clicking on device type items in the sidebar

document.addEventListener('DOMContentLoaded', function() {
    // Add backup event listeners for device type selection
    const deviceTypeList = document.querySelector('.device-type-list');
    const deviceItems = document.querySelectorAll('.device-type-list li');
    
    if (!deviceTypeList || !deviceItems.length) {
        console.error("Device selection elements not found!");
        return;
    }
    
    // Make sure each device type is properly clickable
    deviceItems.forEach(item => {
        // Direct click handler for each item
        item.onclick = function(e) {
            console.log("Direct click handler for", this.getAttribute('data-type'));
            selectDevice(this);
            e.stopPropagation();
        };
        
        // Make sure the parent doesn't interfere with clicks
        item.parentNode.addEventListener('click', function(e) {
            const target = e.target.closest('li');
            if (!target) return;
            
            console.log("Parent click handler for", target.getAttribute('data-type'));
            selectDevice(target);
        });
    });
    
    function selectDevice(element) {
        if (!element) return;
        
        // Get the device type
        const deviceType = element.getAttribute('data-type');
        console.log("Selecting device:", deviceType);
        
        // Apply visual selection
        deviceItems.forEach(i => i.classList.remove('selected'));
        element.classList.add('selected');
        
        // Notify the main application code via custom event
        const event = new CustomEvent('deviceSelected', { 
            detail: { type: deviceType } 
        });
        document.dispatchEvent(event);
    }
    
    // Listen for device selection events from the main application
    document.addEventListener('deviceSelected', function(e) {
        if (window.selectDeviceType && typeof window.selectDeviceType === 'function') {
            const deviceType = e.detail.type;
            const element = document.querySelector(`.device-type-list li[data-type="${deviceType}"]`);
            if (element) {
                window.selectDeviceType(element);
            }
        }
    });
});
