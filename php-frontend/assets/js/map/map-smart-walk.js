/**
 * Map Smart Walk - Complete rewrite
 * Handles route building, visualization, and state synchronization
 * Integrated with StateManager, EventBus, and new backend API
 */

class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.routeLines = [];
        this.currentRouteData = null;
        this.isBuilding = false;
        
        if (!this.map) {
            console.error('[MapSmartWalk] Map instance is required');
            return;
        }
        
        this.init();
        console.log('[MapSmartWalk] Initialized');
    }
    
    init() {
        // Subscribe to state changes
        window.StateManager?.subscribe((newState, oldState) => {
            // Rebuild route when places or mode changes
            if (this.shouldRebuildRoute(newState, oldState)) {
                this.buildRoute(newState.places, newState.mode);
            }
        });
        
        // Subscribe to place changes
        window.EventBus?.on('place:changed', (data) => {
            console.log('[MapSmartWalk] Place changed, rebuilding route');
            const places = window.StateManager?.get('places');
            const mode = window.StateManager?.get('mode');
            if (places && places.length >= 2) {
                this.buildRoute(places, mode);
            }
        });
        
        // Subscribe to mode changes
        window.EventBus?.on('mode:changed', (mode) => {
            console.log('[MapSmartWalk] Mode changed to', mode);
            const places = window.StateManager?.get('places');
            if (places && places.length >= 2) {
                this.buildRoute(places, mode);
            }
        });
    }
    
    shouldRebuildRoute(newState, oldState) {
        // Check if places array changed
        if (JSON.stringify(newState.places) !== JSON.stringify(oldState.places)) {
            return newState.places && newState.places.length >= 2;
        }
        
        // Check if mode changed
        if (newState.mode !== oldState.mode) {
            return newState.places && newState.places.length >= 2;
        }
        
        return false;
    }
    
    /**
     * Build route through multiple places
     */
    async buildRoute(places, mode = 'pedestrian') {
        if (!places || places.length < 2) {
            console.warn('[MapSmartWalk] Need at least 2 places to build route');
            return;
        }
        
        if (this.isBuilding) {
            console.log('[MapSmartWalk] Already building route, skipping');
            return;
        }
        
        this.isBuilding = true;
        window.StateManager?.setLoading(true);
        window.EventBus?.emit('route:building');
        
        console.log(`[MapSmartWalk] Building route for ${places.length} places in ${mode} mode`);
        
        try {
            // Call backend API
            const response = await fetch('/api/route/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    places: places,
                    mode: mode,
                    optimize: true
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const routeData = await response.json();
            
            if (!routeData.success) {
                throw new Error(routeData.error || 'Failed to build route');
            }
            
            // Store route data
            this.currentRouteData = routeData;
            
            // Update state
            window.StateManager?.setRouteData(routeData);
            
            // Visualize route
            this.visualizeRoute(routeData);
            
            console.log('[MapSmartWalk] Route built successfully');
            
        } catch (error) {
            console.error('[MapSmartWalk] Error building route:', error);
            window.StateManager?.setError(error.message);
            window.EventBus?.emit('route:error', error);
            alert(`Ошибка построения маршрута: ${error.message}`);
        } finally {
            this.isBuilding = false;
            window.StateManager?.setLoading(false);
        }
    }
    
    /**
     * Visualize route on map
     */
    visualizeRoute(routeData) {
        // Clear existing route lines
        this.clearRouteLines();
        
        if (!routeData || !routeData.segments) {
            console.warn('[MapSmartWalk] No segments to visualize');
            return;
        }
        
        console.log(`[MapSmartWalk] Visualizing ${routeData.segments.length} segments`);
        
        // Draw each segment
        routeData.segments.forEach((segment, idx) => {
            this.drawSegment(segment, idx);
        });
        
        // Fit map to show all route
        this.fitMapToRoute();
    }
    
    /**
     * Draw a single segment
     */
    drawSegment(segment, index) {
        if (!segment.geometry || segment.geometry.length === 0) {
            console.warn(`[MapSmartWalk] Segment ${index} has no geometry`);
            return;
        }
        
        const style = segment.style || {};
        const color = style.color || '#2E86DE';
        const lineStyle = style.line_style || 'solid';
        
        // Create polyline
        const polyline = new ymaps.Polyline(
            segment.geometry,
            {
                hintContent: segment.instructions,
                balloonContent: `
                    <div class="segment-balloon">
                        <strong>${segment.from.name}</strong> → <strong>${segment.to.name}</strong><br>
                        <span>${style.icon} ${segment.mode_display}</span><br>
                        <span>📏 ${this.formatDistance(segment.distance)}</span><br>
                        <span>⏱️ ${this.formatDuration(segment.duration)}</span>
                    </div>
                `
            },
            {
                strokeColor: color,
                strokeWidth: 5,
                strokeOpacity: 0.8,
                strokeStyle: lineStyle === 'dashed' ? '5 5' : 'solid'
            }
        );
        
        // Add click handler
        polyline.events.add('click', () => {
            console.log(`[MapSmartWalk] Segment ${index} clicked`);
            window.EventBus?.emit('segment:clicked', { index, segment });
        });
        
        this.map.geoObjects.add(polyline);
        this.routeLines.push(polyline);
    }
    
    /**
     * Clear all route lines
     */
    clearRouteLines() {
        this.routeLines.forEach(line => {
            this.map.geoObjects.remove(line);
        });
        this.routeLines = [];
    }
    
    /**
     * Fit map to show entire route
     */
    fitMapToRoute() {
        if (this.routeLines.length === 0) return;
        
        try {
            // Get bounds of all route lines
            const bounds = this.map.geoObjects.getBounds();
            
            if (bounds) {
                this.map.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 50,
                    duration: 500
                }).then(() => {
                    // Ensure minimum zoom level
                    const zoom = this.map.getZoom();
                    if (zoom < 10) {
                        this.map.setZoom(12);
                    }
                });
            }
        } catch (error) {
            console.error('[MapSmartWalk] Error fitting map:', error);
        }
    }
    
    /**
     * Update a specific place in route
     */
    async updatePlace(placeIndex, newPlace) {
        console.log(`[MapSmartWalk] Updating place ${placeIndex}`);
        
        try {
            window.StateManager?.setLoading(true);
            
            const response = await fetch('/api/route/update-place', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    route_data: this.currentRouteData,
                    place_index: placeIndex,
                    new_place: newPlace
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const updatedRoute = await response.json();
            
            if (!updatedRoute.success) {
                throw new Error(updatedRoute.error || 'Failed to update place');
            }
            
            // Update state and visualize
            this.currentRouteData = updatedRoute;
            window.StateManager?.setRouteData(updatedRoute);
            this.visualizeRoute(updatedRoute);
            
            console.log('[MapSmartWalk] Place updated successfully');
            
        } catch (error) {
            console.error('[MapSmartWalk] Error updating place:', error);
            window.StateManager?.setError(error.message);
            alert(`Ошибка обновления места: ${error.message}`);
        } finally {
            window.StateManager?.setLoading(false);
        }
    }
    
    /**
     * Clear map
     */
    clearMap() {
        this.clearRouteLines();
        this.currentRouteData = null;
        console.log('[MapSmartWalk] Map cleared');
    }
    
    /**
     * Get current route data
     */
    getRouteData() {
        return this.currentRouteData;
    }
    
    // Utility methods
    formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} км`;
        }
        return `${Math.round(meters)} м`;
    }
    
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)} сек`;
        }
        if (seconds < 3600) {
            return `${Math.round(seconds / 60)} мин`;
        }
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return `${hours} ч ${minutes} мин`;
    }
}

// Will be initialized after map is ready
window.MapSmartWalk = MapSmartWalk;

console.log('[MapSmartWalk] Class loaded');
