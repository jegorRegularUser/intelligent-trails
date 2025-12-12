class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.routeLines = [];
        this.currentRouteData = null;
        this.isBuilding = false;
        this.yandexRoutes = [];
        
        if (!this.map) {
            console.error('[MapSmartWalk] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapSmartWalk] Initialized with Yandex routing');
    }
    
    init() {
        window.EventBus?.on('route:updated', (routeData) => {
            console.log('[MapSmartWalk] Route updated event received');
            this.visualizeRoute(routeData);
        });
    }
    
    async visualizeRoute(routeData) {
        console.log('[MapSmartWalk] Visualizing route with Yandex routing...', routeData);
        
        this.clearRouteLines();
        
        if (!routeData || !routeData.places || routeData.places.length < 2) {
            console.warn('[MapSmartWalk] Not enough places to build route');
            return;
        }
        
        const places = routeData.places;
        console.log(`[MapSmartWalk] Building route through ${places.length} places`);
        
        for (let i = 0; i < places.length - 1; i++) {
            await this.drawSegmentWithYandex(places[i], places[i + 1], i);
        }
        
        setTimeout(() => this.fitMapToRoute(), 500);
        
        console.log('[MapSmartWalk] Route visualization complete');
    }
    
    async drawSegmentWithYandex(fromPlace, toPlace, segmentIndex) {
        try {
            const fromCoords = fromPlace.coordinates;
            const toCoords = toPlace.coordinates;
            const mode = toPlace.transport_mode || 'pedestrian';
            
            console.log(`[MapSmartWalk] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name} (${mode})`);
            console.log(`  From [lat,lon]: ${fromCoords}, To [lat,lon]: ${toCoords}`);
            
            const yandexMode = this.convertModeToYandex(mode);
            
            const route = await ymaps.route(
                [fromCoords, toCoords],
                {
                    mapStateAutoApply: false,
                    routingMode: yandexMode,
                    avoidTrafficJams: false
                }
            );
            
            this.yandexRoutes.push(route);
            
            const paths = route.getPaths();
            const firstPath = paths.get(0);
            
            if (!firstPath) {
                console.warn(`[MapSmartWalk] No path found for segment ${segmentIndex}`);
                this.drawFallbackLine(fromCoords, toCoords, mode);
                return;
            }
            
            const geometry = firstPath.geometry;
            const distance = firstPath.getLength();
            const duration = firstPath.getTime();
            
            console.log(`  Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            const polyline = new ymaps.Polyline(
                geometry.getCoordinates(),
                {
                    balloonContent: this.createSimpleBalloon(fromPlace, toPlace, distance, duration, mode),
                    hintContent: `${fromPlace.name} → ${toPlace.name}`
                },
                {
                    strokeColor: this.getModeColor(mode, segmentIndex),
                    strokeWidth: 6,
                    strokeOpacity: 0.7 + (segmentIndex * 0.05),
                    strokeStyle: this.getModeStyle(mode)
                }
            );
            
            this.map.geoObjects.add(polyline);
            this.routeLines.push(polyline);
            
            polyline.events.add('click', () => {
                console.log(`[MapSmartWalk] Segment ${segmentIndex} clicked`);
                window.EventBus?.emit('segment:clicked', { 
                    index: segmentIndex, 
                    from: fromPlace, 
                    to: toPlace,
                    distance: distance,
                    duration: duration,
                    mode: mode
                });
            });
            
            console.log(`  Segment ${segmentIndex + 1} drawn successfully`);
            
        } catch (error) {
            console.error(`[MapSmartWalk] Error building segment ${segmentIndex}:`, error);
            this.drawFallbackLine(fromPlace.coordinates, toPlace.coordinates, fromPlace.transport_mode || 'pedestrian');
        }
    }
    
    drawFallbackLine(fromCoords, toCoords, mode) {
        console.warn('[MapSmartWalk] Using fallback straight line');
        
        const polyline = new ymaps.Polyline(
            [fromCoords, toCoords],
            {
                hintContent: 'Прямая линия (ошибка построения маршрута)'
            },
            {
                strokeColor: '#FF6B6B',
                strokeWidth: 3,
                strokeOpacity: 0.6,
                strokeStyle: 'dot'
            }
        );
        
        this.map.geoObjects.add(polyline);
        this.routeLines.push(polyline);
    }
    
    createSimpleBalloon(fromPlace, toPlace, distance, duration, mode) {
        const icon = this.getModeIcon(mode);
        const modeName = this.getModeName(mode);
        
        return `
            <div style="padding: 10px; min-width: 250px;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px; color: #2c3e50;">
                    ${fromPlace.name} → ${toPlace.name}
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">${icon}</span>
                        <span style="color: #555;">${modeName}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">📏</span>
                        <span style="color: #555;">${this.formatDistance(distance)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">⏱️</span>
                        <span style="color: #555;">${this.formatDuration(duration)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    convertModeToYandex(mode) {
        const mapping = {
            'pedestrian': 'pedestrian',
            'walking': 'pedestrian',
            'driving': 'auto',
            'auto': 'auto',
            'masstransit': 'masstransit',
            'transit': 'masstransit',
            'bicycle': 'bicycle'
        };
        return mapping[mode] || 'pedestrian';
    }
    
    getModeColor(mode, segmentIndex) {
        const baseColors = {
            'pedestrian': ['#2E86DE', '#3D95E8', '#4CA4F2'],
            'auto': ['#EE5A6F', '#F26B7E', '#F67C8D'],
            'driving': ['#EE5A6F', '#F26B7E', '#F67C8D'],
            'masstransit': ['#26de81', '#3AE891', '#4EF2A1'],
            'bicycle': ['#FFA502', '#FFB220', '#FFBF3E']
        };
        
        const colors = baseColors[mode] || baseColors['pedestrian'];
        return colors[segmentIndex % colors.length];
    }
    
    getModeStyle(mode) {
        return (mode === 'auto' || mode === 'driving') ? 'solid' : '5 5';
    }
    
    getModeIcon(mode) {
        const icons = {
            'pedestrian': '🚶',
            'auto': '🚗',
            'driving': '🚗',
            'masstransit': '🚌',
            'bicycle': '🚴'
        };
        return icons[mode] || '🚶';
    }
    
    getModeName(mode) {
        const names = {
            'pedestrian': 'Пешком',
            'auto': 'На машине',
            'driving': 'На машине',
            'masstransit': 'Общественный транспорт',
            'bicycle': 'На велосипеде'
        };
        return names[mode] || 'Пешком';
    }
    
    clearRouteLines() {
        console.log(`[MapSmartWalk] Clearing ${this.routeLines.length} routes`);
        
        this.routeLines.forEach(line => {
            this.map.geoObjects.remove(line);
        });
        this.routeLines = [];
        this.yandexRoutes = [];
    }
    
    fitMapToRoute() {
        if (this.routeLines.length === 0) {
            console.warn('[MapSmartWalk] No routes to fit');
            return;
        }
        
        try {
            const bounds = this.map.geoObjects.getBounds();
            
            if (bounds) {
                console.log('[MapSmartWalk] Fitting map to bounds:', bounds);
                this.map.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 50,
                    duration: 500
                }).then(() => {
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
    
    clearMap() {
        this.clearRouteLines();
        this.currentRouteData = null;
        console.log('[MapSmartWalk] Map cleared');
    }
    
    getRouteData() {
        return this.currentRouteData;
    }
    
    getYandexRoutes() {
        return this.yandexRoutes;
    }
    
    formatDistance(meters) {
        if (!meters) return '0 м';
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} км`;
        }
        return `${Math.round(meters)} м`;
    }
    
    formatDuration(seconds) {
        if (!seconds) return '0 мин';
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

window.MapSmartWalk = MapSmartWalk;

console.log('[MapSmartWalk] Class loaded with Yandex routing support');
