/**
 * Map Place Markers Component
 * Manages interactive markers for places on the map
 * - Creates numbered markers for each place
 * - Shows popups with place information
 * - Handles click events to navigate to places
 */

class MapPlaceMarkers {
    constructor(map) {
        this.map = map;
        this.markers = [];
        this.popups = [];
        this.places = [];
        
        if (!this.map) {
            console.error('[MapPlaceMarkers] Map instance is required');
            return;
        }
        
        this.init();
        console.log('[MapPlaceMarkers] Initialized');
    }
    
    init() {
        // Subscribe to route updates
        window.EventBus?.on('route:updated', (routeData) => {
            if (routeData && routeData.places) {
                this.setPlaces(routeData.places);
            }
        });
        
        // Subscribe to place selection
        window.EventBus?.on('place:selected', (data) => {
            if (data && data.place) {
                this.focusOnPlace(data.index);
            }
        });
        
        // Subscribe to place changes
        window.EventBus?.on('place:changed', (data) => {
            if (data) {
                this.updateMarker(data.index, data.place);
            }
        });
    }
    
    /**
     * Set places and create markers
     */
    setPlaces(places) {
        this.places = places;
        this.clearMarkers();
        this.createMarkers();
        console.log(`[MapPlaceMarkers] Created ${places.length} markers`);
    }
    
    /**
     * Clear all markers from map
     */
    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.geoObjects.remove(marker);
        });
        this.markers = [];
        this.popups = [];
    }
    
    /**
     * Create markers for all places
     */
    createMarkers() {
        this.places.forEach((place, index) => {
            this.createMarker(place, index);
        });
        
        // Fit map to show all markers
        if (this.markers.length > 0) {
            this.fitBounds();
        }
    }
    
    /**
     * Create a single marker
     */
    createMarker(place, index) {
        const coords = place.coordinates;
        const markerColor = place.marker?.color || '#2E86DE';
        const markerNumber = place.marker?.number || (index + 1);
        const isStart = index === 0;
        
        // Create placemark with custom icon
        const placemark = new ymaps.Placemark(
            coords,
            {
                balloonContentHeader: `<strong>${place.name}</strong>`,
                balloonContentBody: `
                    <div class="marker-balloon">
                        ${place.address ? `<p class="marker-address">${place.address}</p>` : ''}
                        <p class="marker-order">Место #${markerNumber}</p>
                        <button onclick="window.MapPlaceMarkersInstance.centerOnPlace(${index})" class="btn-center">
                            📍 Центрировать
                        </button>
                    </div>
                `,
                balloonContentFooter: `<small>Тип: ${place.type === 'must_visit' ? 'Обязательное' : 'Опциональное'}</small>`,
                hintContent: place.name
            },
            {
                preset: isStart ? 'islands#greenCircleDotIcon' : 'islands#blueCircleDotIcon',
                iconLayout: 'default#imageWithContent',
                iconImageHref: this.createMarkerSVG(markerNumber, markerColor, isStart),
                iconImageSize: [40, 40],
                iconImageOffset: [-20, -40],
                iconContentOffset: [0, 0],
                hideIconOnBalloonOpen: false
            }
        );
        
        // Click handler
        placemark.events.add('click', () => {
            console.log(`[MapPlaceMarkers] Marker clicked: ${place.name}`);
            window.StateManager?.selectPlace(index);
            window.EventBus?.emit('place:clicked', { index, place });
        });
        
        this.map.geoObjects.add(placemark);
        this.markers.push(placemark);
    }
    
    /**
     * Create SVG marker icon
     */
    createMarkerSVG(number, color, isStart) {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="3"/>
                <text x="20" y="26" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
                    ${isStart ? '🏁' : number}
                </text>
            </svg>
        `;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }
    
    /**
     * Update existing marker
     */
    updateMarker(index, place) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        
        // Update marker position
        marker.geometry.setCoordinates(place.coordinates);
        
        // Update balloon content
        marker.properties.set({
            balloonContentHeader: `<strong>${place.name}</strong>`,
            balloonContentBody: `
                <div class="marker-balloon">
                    ${place.address ? `<p class="marker-address">${place.address}</p>` : ''}
                    <p class="marker-order">Место #${index + 1}</p>
                    <button onclick="window.MapPlaceMarkersInstance.centerOnPlace(${index})" class="btn-center">
                        📍 Центрировать
                    </button>
                </div>
            `,
            hintContent: place.name
        });
        
        console.log(`[MapPlaceMarkers] Updated marker ${index}`);
    }
    
    /**
     * Focus on a specific place (zoom and center)
     */
    focusOnPlace(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        const coords = marker.geometry.getCoordinates();
        
        // Smooth pan and zoom
        this.map.setCenter(coords, 15, {
            duration: 500,
            checkZoomRange: true
        });
        
        // Open balloon
        setTimeout(() => {
            marker.balloon.open();
        }, 600);
        
        console.log(`[MapPlaceMarkers] Focused on place ${index}`);
    }
    
    /**
     * Center map on place (without zoom change)
     */
    centerOnPlace(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        const coords = marker.geometry.getCoordinates();
        
        this.map.panTo(coords, {
            duration: 300
        });
        
        console.log(`[MapPlaceMarkers] Centered on place ${index}`);
    }
    
    /**
     * Fit map bounds to show all markers
     */
    fitBounds() {
        if (this.markers.length === 0) return;
        
        const bounds = this.map.geoObjects.getBounds();
        
        if (bounds) {
            this.map.setBounds(bounds, {
                checkZoomRange: true,
                duration: 500,
                zoomMargin: 50
            });
        }
    }
    
    /**
     * Highlight a specific marker
     */
    highlightMarker(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        // Reset all markers
        this.markers.forEach((marker, i) => {
            const place = this.places[i];
            const color = place.marker?.color || '#2E86DE';
            const number = place.marker?.number || (i + 1);
            
            marker.options.set('iconImageHref', this.createMarkerSVG(number, color, i === 0));
        });
        
        // Highlight selected marker
        const place = this.places[index];
        const number = place.marker?.number || (index + 1);
        const highlightColor = '#FF6B6B'; // Red highlight
        
        this.markers[index].options.set(
            'iconImageHref', 
            this.createMarkerSVG(number, highlightColor, index === 0)
        );
    }
    
    /**
     * Get marker by index
     */
    getMarker(index) {
        return this.markers[index];
    }
    
    /**
     * Get all markers
     */
    getMarkers() {
        return this.markers;
    }
}

// Will be initialized after map is ready
window.MapPlaceMarkers = MapPlaceMarkers;

console.log('[MapPlaceMarkers] Class loaded');
