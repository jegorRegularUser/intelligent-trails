/**
 * Map Smart Walk - ИСПРАВЛЕННАЯ ВЕРСИЯ с отрисовкой линий
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
        // Subscribe to route updates
        window.EventBus?.on('route:updated', (routeData) => {
            console.log('[MapSmartWalk] Route updated event received');
            this.visualizeRoute(routeData);
        });
    }
    
    /**
     * Visualize route on map
     */
    visualizeRoute(routeData) {
        console.log('[MapSmartWalk] visualizeRoute called with:', routeData);
        
        // Clear existing route lines
        this.clearRouteLines();
        
        if (!routeData || !routeData.segments || routeData.segments.length === 0) {
            console.warn('[MapSmartWalk] No segments to visualize');
            return;
        }
        
        console.log(`[MapSmartWalk] Visualizing ${routeData.segments.length} segments`);
        
        // Draw each segment
        routeData.segments.forEach((segment, idx) => {
            this.drawSegment(segment, idx);
        });
        
        // Fit map to show all route
        setTimeout(() => this.fitMapToRoute(), 500);
    }
    
    /**
     * Draw a single segment
     */
    drawSegment(segment, index) {
        if (!segment.geometry || segment.geometry.length === 0) {
            console.warn(`[MapSmartWalk] Segment ${index} has no geometry`);
            return;
        }
        
        console.log(`[MapSmartWalk] Drawing segment ${index}:`, {
            from: segment.from?.name,
            to: segment.to?.name,
            pointsCount: segment.geometry.length
        });
        
        const style = segment.style || {};
        const color = style.color || '#2E86DE';
        const lineStyle = style.line_style || 'solid';
        
        // Create polyline
        const polyline = new ymaps.Polyline(
            segment.geometry,
            {
                hintContent: segment.instructions || 'Сегмент маршрута',
                balloonContent: `
                    <div class="segment-balloon">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">
                            ${segment.from?.name || 'Начало'} → ${segment.to?.name || 'Конец'}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">${style.icon || '🚶'}</span>
                                <span>${segment.mode_display || 'пешком'}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>📏</span>
                                <span>${this.formatDistance(segment.distance)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>⏱️</span>
                                <span>${this.formatDuration(segment.duration)}</span>
                            </div>
                        </div>
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
        
        console.log(`[MapSmartWalk] Segment ${index} drawn successfully`);
    }
    
    /**
     * Clear all route lines
     */
    clearRouteLines() {
        console.log(`[MapSmartWalk] Clearing ${this.routeLines.length} route lines`);
        this.routeLines.forEach(line => {
            this.map.geoObjects.remove(line);
        });
        this.routeLines = [];
    }
    
    /**
     * Fit map to show entire route
     */
    fitMapToRoute() {
        if (this.routeLines.length === 0) {
            console.warn('[MapSmartWalk] No route lines to fit');
            return;
        }
        
        try {
            // Get bounds of all route lines
            const bounds = this.map.geoObjects.getBounds();
            
            if (bounds) {
                console.log('[MapSmartWalk] Fitting map to bounds:', bounds);
                this.map.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 50,
                    duration: 500
                }).then(() => {
                    // Ensure minimum zoom level
                    const zoom = this.map.getZoom();
                    if (zoom > 17) {
                        this.map.setZoom(16);
                    }
                });
            }
        } catch (error) {
            console.error('[MapSmartWalk] Error fitting map:', error);
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
        if (!meters) return '0 м';
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} км`;
        }
        return `${Math.round(meters)} м`;
    }
    
    formatDuration(seconds) {
        if (!seconds) return '0 сек';
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

// Export class
window.MapSmartWalk = MapSmartWalk;

console.log('[MapSmartWalk] Class loaded');
