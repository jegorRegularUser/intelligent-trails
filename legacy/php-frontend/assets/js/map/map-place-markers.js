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
        window.EventBus?.on('route:updated', (routeData) => {
            if (routeData && routeData.places) {
                this.setPlaces(routeData.places);
            }
        });
        
        window.EventBus?.on('place:selected', (data) => {
            if (data && data.place) {
                this.focusOnPlace(data.index);
            }
        });
        
        window.EventBus?.on('place:changed', (data) => {
            if (data) {
                this.updateMarker(data.index, data.place);
            }
        });
    }
    
    setPlaces(places) {
        this.places = places;
        this.clearMarkers();
        this.createMarkers();
        console.log(`[MapPlaceMarkers] Created ${places.length} markers`);
    }
    
    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.geoObjects.remove(marker);
        });
        this.markers = [];
        this.popups = [];
    }
    
    createMarkers() {
        const coordsMap = new Map();
        
        this.places.forEach((place, index) => {
            const key = `${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
            
            if (coordsMap.has(key)) {
                coordsMap.get(key).push(index);
            } else {
                coordsMap.set(key, [index]);
            }
        });
        
        this.places.forEach((place, index) => {
            const key = `${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
            const overlapping = coordsMap.get(key);
            const offsetIndex = overlapping.indexOf(index);
            
            this.createMarker(place, index, offsetIndex, overlapping.length);
        });
        
        if (this.markers.length > 0) {
            this.fitBounds();
        }
    }
    
    createMarker(place, index, offsetIndex, totalOverlapping) {
        let coords = [...place.coordinates];
        
        if (totalOverlapping > 1) {
            const angle = (Math.PI * 2 * offsetIndex) / totalOverlapping;
            const offsetDistance = 0.0002;
            coords[0] += Math.cos(angle) * offsetDistance;
            coords[1] += Math.sin(angle) * offsetDistance;
        }
        
        const markerColor = this.getMarkerColor(place, index);
        const markerNumber = index + 1;
        const isStart = place.type === 'start';
        const isEnd = place.type === 'end';
        
        const iconSize = isStart || isEnd ? [50, 50] : [40, 40];
        const iconOffset = isStart || isEnd ? [-25, -50] : [-20, -40];
        
        const placemark = new ymaps.Placemark(
            coords,
            {
                balloonContentHeader: `<strong>${place.name}</strong>`,
                balloonContentBody: `
                    <div class="marker-balloon">
                        ${place.address ? `<p class="marker-address">${place.address}</p>` : ''}
                        <p class="marker-order">Точка #${markerNumber}</p>
                        <button onclick="window.MapPlaceMarkersInstance.centerOnPlace(${index})" class="btn-center">
                            📍 Центрировать
                        </button>
                    </div>
                `,
                hintContent: place.name
            },
            {
                iconLayout: 'default#imageWithContent',
                iconImageHref: this.createMarkerSVG(markerNumber, markerColor, isStart, isEnd),
                iconImageSize: iconSize,
                iconImageOffset: iconOffset,
                iconContentOffset: [0, 0],
                hideIconOnBalloonOpen: false,
                zIndex: isStart || isEnd ? 1000 : 500 + index
            }
        );
        
        placemark.events.add('click', () => {
            console.log(`[MapPlaceMarkers] Marker clicked: ${place.name}`);
            window.StateManager?.selectPlace(index);
            window.EventBus?.emit('place:clicked', { index, place });
        });
        
        this.map.geoObjects.add(placemark);
        this.markers.push(placemark);
    }
    
    getMarkerColor(place, index) {
        if (place.type === 'start') return '#4CAF50';
        if (place.type === 'end') return '#FF5722';
        
        const colors = ['#2E86DE', '#764BA2', '#F857A6', '#FFA502', '#26de81'];
        return colors[index % colors.length];
    }
    
    createMarkerSVG(number, color, isStart, isEnd) {
        const emoji = isStart ? '🏁' : isEnd ? '🏁' : number;
        const size = isStart || isEnd ? 50 : 40;
        const radius = isStart || isEnd ? 22 : 18;
        const fontSize = isStart || isEnd ? 20 : 16;
        
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="${color}" stroke="white" stroke-width="3"/>
                ${isStart || isEnd ? 
                    `<circle cx="${size/2}" cy="${size/2}" r="${radius-3}" fill="none" stroke="white" stroke-width="1" stroke-dasharray="2,2"/>` 
                    : ''}
                <text x="${size/2}" y="${size/2 + fontSize/3}" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">
                    ${emoji}
                </text>
            </svg>
        `;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }
    
    updateMarker(index, place) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        
        marker.geometry.setCoordinates(place.coordinates);
        
        marker.properties.set({
            balloonContentHeader: `<strong>${place.name}</strong>`,
            balloonContentBody: `
                <div class="marker-balloon">
                    ${place.address ? `<p class="marker-address">${place.address}</p>` : ''}
                    <p class="marker-order">Точка #${index + 1}</p>
                    <button onclick="window.MapPlaceMarkersInstance.centerOnPlace(${index})" class="btn-center">
                        📍 Центрировать
                    </button>
                </div>
            `,
            hintContent: place.name
        });
        
        console.log(`[MapPlaceMarkers] Updated marker ${index}`);
    }
    
    focusOnPlace(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        const coords = marker.geometry.getCoordinates();
        
        this.map.setCenter(coords, 15, {
            duration: 500,
            checkZoomRange: true
        });
        
        setTimeout(() => {
            marker.balloon.open();
        }, 600);
        
        console.log(`[MapPlaceMarkers] Focused on place ${index}`);
    }
    
    centerOnPlace(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        const marker = this.markers[index];
        const coords = marker.geometry.getCoordinates();
        
        this.map.panTo(coords, {
            duration: 300
        });
        
        console.log(`[MapPlaceMarkers] Centered on place ${index}`);
    }
    
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
    
    highlightMarker(index) {
        if (index < 0 || index >= this.markers.length) return;
        
        this.markers.forEach((marker, i) => {
            const place = this.places[i];
            const color = this.getMarkerColor(place, i);
            const number = i + 1;
            const isStart = place.type === 'start';
            const isEnd = place.type === 'end';
            
            marker.options.set('iconImageHref', this.createMarkerSVG(number, color, isStart, isEnd));
        });
        
        const place = this.places[index];
        const number = index + 1;
        const highlightColor = '#FF6B6B';
        
        this.markers[index].options.set(
            'iconImageHref', 
            this.createMarkerSVG(number, highlightColor, false, false)
        );
    }
    
    getMarker(index) {
        return this.markers[index];
    }
    
    getMarkers() {
        return this.markers;
    }
}

window.MapPlaceMarkers = MapPlaceMarkers;

console.log('[MapPlaceMarkers] Class loaded');
