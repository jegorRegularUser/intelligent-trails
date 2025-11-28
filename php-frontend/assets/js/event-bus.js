/**
 * Event Bus - Simple pub/sub system for component communication
 * Allows components to communicate without tight coupling
 */

class EventBus {
    constructor() {
        this.events = {};
        console.log('[EventBus] Initialized');
    }
    
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        this.events[event].push(callback);
        
        console.log(`[EventBus] Subscribed to '${event}' (${this.events[event].length} listeners)`);
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }
    
    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function to remove
     */
    off(event, callback) {
        if (!this.events[event]) return;
        
        this.events[event] = this.events[event].filter(cb => cb !== callback);
        
        console.log(`[EventBus] Unsubscribed from '${event}' (${this.events[event].length} listeners remaining)`);
    }
    
    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to listeners
     */
    emit(event, data) {
        if (!this.events[event]) return;
        
        console.log(`[EventBus] Emitting '${event}' to ${this.events[event].length} listeners`, data);
        
        this.events[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in '${event}' listener:`, error);
            }
        });
    }
    
    /**
     * Subscribe to an event once (auto-unsubscribe after first call)
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    once(event, callback) {
        const onceCallback = (data) => {
            callback(data);
            this.off(event, onceCallback);
        };
        
        return this.on(event, onceCallback);
    }
    
    /**
     * Remove all listeners for an event
     * @param {string} event - Event name
     */
    clear(event) {
        if (event) {
            delete this.events[event];
            console.log(`[EventBus] Cleared all listeners for '${event}'`);
        } else {
            this.events = {};
            console.log('[EventBus] Cleared all listeners');
        }
    }
    
    /**
     * Get all registered events
     * @returns {string[]} Array of event names
     */
    getEvents() {
        return Object.keys(this.events);
    }
    
    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    }
}

// Create global instance
window.EventBus = new EventBus();

// Define standard events
window.EventBus.EVENTS = {
    // Route events
    ROUTE_UPDATED: 'route:updated',
    ROUTE_BUILDING: 'route:building',
    ROUTE_ERROR: 'route:error',
    
    // Place events
    PLACE_SELECTED: 'place:selected',
    PLACE_CHANGED: 'place:changed',
    PLACE_ADDED: 'place:added',
    PLACE_REMOVED: 'place:removed',
    PLACE_CLICKED: 'place:clicked',
    
    // Mode events
    MODE_CHANGED: 'mode:changed',
    
    // Map events
    MAP_READY: 'map:ready',
    MAP_CLICKED: 'map:clicked',
    MAP_CENTER_CHANGED: 'map:center_changed',
    MAP_ZOOM_CHANGED: 'map:zoom_changed',
    
    // UI events
    MODAL_OPENED: 'modal:opened',
    MODAL_CLOSED: 'modal:closed',
    LOADING_START: 'loading:start',
    LOADING_END: 'loading:end',
    ERROR_OCCURRED: 'error:occurred'
};

console.log('[EventBus] Available events:', window.EventBus.EVENTS);
