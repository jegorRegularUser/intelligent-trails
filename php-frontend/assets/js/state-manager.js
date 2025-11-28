/**
 * State Manager - Centralized state management for Intelligent Trails
 * Handles current route, places, mode, and UI state
 */

class StateManager {
    constructor() {
        this.state = {
            currentRoute: null,
            places: [],
            mode: 'pedestrian',
            routeData: null,
            selectedPlaceIndex: null,
            isLoading: false,
            error: null,
            mapCenter: [37.6173, 55.7539], // Default to Moscow
            mapZoom: 12
        };
        
        this.listeners = {};
        
        // Load from localStorage if available
        this.loadFromStorage();
    }
    
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Get specific state property
     */
    get(key) {
        return this.state[key];
    }
    
    /**
     * Set state and notify listeners
     */
    setState(updates) {
        const oldState = { ...this.state };
        
        // Update state
        this.state = {
            ...this.state,
            ...updates
        };
        
        // Save to localStorage
        this.saveToStorage();
        
        // Notify listeners
        this.notifyListeners(oldState, this.state);
        
        console.log('[StateManager] State updated:', updates);
    }
    
    /**
     * Subscribe to state changes
     */
    subscribe(listener) {
        const id = Date.now() + Math.random();
        this.listeners[id] = listener;
        
        return () => {
            delete this.listeners[id];
        };
    }
    
    /**
     * Notify all listeners
     */
    notifyListeners(oldState, newState) {
        Object.values(this.listeners).forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                console.error('[StateManager] Error in listener:', error);
            }
        });
    }
    
    /**
     * Set current route data
     */
    setRouteData(routeData) {
        this.setState({
            routeData: routeData,
            places: routeData?.places || [],
            mode: routeData?.mode || 'pedestrian',
            currentRoute: routeData
        });
        
        // Emit route:updated event
        window.EventBus?.emit('route:updated', routeData);
    }
    
    /**
     * Update a specific place
     */
    updatePlace(placeIndex, newPlaceData) {
        const places = [...this.state.places];
        
        if (placeIndex >= 0 && placeIndex < places.length) {
            places[placeIndex] = {
                ...places[placeIndex],
                ...newPlaceData
            };
            
            this.setState({ places });
            
            // Emit place:changed event
            window.EventBus?.emit('place:changed', {
                index: placeIndex,
                place: places[placeIndex]
            });
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Set routing mode
     */
    setMode(mode) {
        if (['pedestrian', 'driving', 'masstransit'].includes(mode)) {
            this.setState({ mode });
            
            // Emit mode:changed event
            window.EventBus?.emit('mode:changed', mode);
            
            return true;
        }
        
        console.warn('[StateManager] Invalid mode:', mode);
        return false;
    }
    
    /**
     * Select a place
     */
    selectPlace(placeIndex) {
        this.setState({ selectedPlaceIndex: placeIndex });
        
        // Emit place:selected event
        window.EventBus?.emit('place:selected', {
            index: placeIndex,
            place: this.state.places[placeIndex]
        });
    }
    
    /**
     * Set loading state
     */
    setLoading(isLoading) {
        this.setState({ isLoading });
    }
    
    /**
     * Set error state
     */
    setError(error) {
        this.setState({ error });
        
        if (error) {
            console.error('[StateManager] Error:', error);
        }
    }
    
    /**
     * Clear error
     */
    clearError() {
        this.setState({ error: null });
    }
    
    /**
     * Set map view
     */
    setMapView(center, zoom) {
        this.setState({
            mapCenter: center,
            mapZoom: zoom
        });
    }
    
    /**
     * Reset state
     */
    reset() {
        this.state = {
            currentRoute: null,
            places: [],
            mode: 'pedestrian',
            routeData: null,
            selectedPlaceIndex: null,
            isLoading: false,
            error: null,
            mapCenter: [37.6173, 55.7539],
            mapZoom: 12
        };
        
        this.saveToStorage();
        this.notifyListeners({}, this.state);
        
        console.log('[StateManager] State reset');
    }
    
    /**
     * Save state to localStorage
     */
    saveToStorage() {
        try {
            const stateToSave = {
                routeData: this.state.routeData,
                places: this.state.places,
                mode: this.state.mode,
                mapCenter: this.state.mapCenter,
                mapZoom: this.state.mapZoom
            };
            
            localStorage.setItem('intelligentTrails_state', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('[StateManager] Failed to save to localStorage:', error);
        }
    }
    
    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('intelligentTrails_state');
            
            if (saved) {
                const parsedState = JSON.parse(saved);
                
                this.state = {
                    ...this.state,
                    ...parsedState
                };
                
                console.log('[StateManager] State loaded from localStorage');
            }
        } catch (error) {
            console.warn('[StateManager] Failed to load from localStorage:', error);
        }
    }
    
    /**
     * Clear localStorage
     */
    clearStorage() {
        try {
            localStorage.removeItem('intelligentTrails_state');
            console.log('[StateManager] Storage cleared');
        } catch (error) {
            console.warn('[StateManager] Failed to clear storage:', error);
        }
    }
}

// Create global instance
window.StateManager = new StateManager();

console.log('[StateManager] Initialized');
