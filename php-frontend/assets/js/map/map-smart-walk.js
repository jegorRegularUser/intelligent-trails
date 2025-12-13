class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.routeLines = [];
        this.multiRoutes = [];
        this.currentRouteData = null;
        this.segmentDataArray = [];
        
        if (!this.map) {
            console.error('[MapSmartWalk] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapSmartWalk] Initialized');
    }
    
    init() {
        window.EventBus?.on('route:updated', (routeData) => {
            console.log('[MapSmartWalk] Route updated event received');
            this.visualizeRoute(routeData);
        });
    }
    
    async visualizeRoute(routeData) {
        console.log('[MapSmartWalk] Visualizing route...', routeData);
        
        this.clearRouteLines();
        this.segmentDataArray = [];
        
        if (!routeData || !routeData.places || routeData.places.length < 2) {
            console.warn('[MapSmartWalk] Not enough places to build route');
            return;
        }
        
        const places = routeData.places;
        console.log(`[MapSmartWalk] Building route through ${places.length} places`);
        
        for (let i = 0; i < places.length - 1; i++) {
            await this.drawSegment(places[i], places[i + 1], i);
        }
        
        setTimeout(() => {
            this.fitMapToRoute();
            if (window.MapRouteBuilder) {
                window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
            }
        }, 500);
        
        console.log('[MapSmartWalk] Route visualization complete');
    }
    
    async drawSegment(fromPlace, toPlace, segmentIndex) {
        const mode = toPlace.transport_mode || 'pedestrian';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapSmartWalk] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name} (${mode})`);
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            
            // Создаем multiRoute согласно документации
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, {
                boundsAutoApply: false,
                wayPointStartIconVisible: false,
                wayPointFinishIconVisible: false
            });
            
            this.map.geoObjects.add(multiRoute);
            this.multiRoutes.push(multiRoute);
            
            // Ждем построения маршрута
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout'));
                }, 5000);
                
                multiRoute.model.events.once('requestsuccess', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                multiRoute.model.events.once('requestfail', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            
            // Получаем активный маршрут
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSmartWalk] No active route for segment ${segmentIndex}`);
                this.drawFallbackLine(fromCoords, toCoords, mode, segmentIndex);
                return;
            }
            
            // Получаем данные маршрута
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            // ПРАВИЛЬНЫЙ способ получения координат - через geometry у Route
            const coordinates = activeRoute.geometry.getCoordinates();
            
            if (!coordinates || coordinates.length === 0) {
                console.warn(`[MapSmartWalk] No coordinates found for segment ${segmentIndex}`);
                this.drawFallbackLine(fromCoords, toCoords, mode, segmentIndex);
                return;
            }
            
            console.log(`  ✓ Got ${coordinates.length} coordinate points`);
            
            // Сохраняем данные сегмента
            const segmentData = {
                index: segmentIndex,
                distance: distance,
                duration: duration,
                mode: mode,
                fromPlace: fromPlace.name,
                toPlace: toPlace.name
            };
            this.segmentDataArray.push(segmentData);
            
            // Создаем видимую полилинию
            const polyline = new ymaps.Polyline(
                coordinates,
                {
                    balloonContent: this.createBalloonContent(fromPlace, toPlace, distance, duration, mode),
                    hintContent: `${fromPlace.name} → ${toPlace.name}`
                },
                {
                    strokeColor: this.getModeColor(mode),
                    strokeWidth: this.getStrokeWidth(mode),
                    strokeOpacity: 0.7,
                    strokeStyle: this.getModeStyle(mode),
                    zIndex: 100 + segmentIndex
                }
            );
            
            this.map.geoObjects.add(polyline);
            this.routeLines.push(polyline);
            
            polyline.events.add('click', () => {
                window.EventBus?.emit('segment:clicked', segmentData);
            });
            
            console.log(`  ✓ Segment drawn successfully`);
            
        } catch (error) {
            console.error(`[MapSmartWalk] Error building segment ${segmentIndex}:`, error);
            this.drawFallbackLine(fromCoords, toCoords, mode, segmentIndex);
        }
    }
    
    drawFallbackLine(fromCoords, toCoords, mode, segmentIndex) {
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
                strokeStyle: 'dot',
                zIndex: 100 + segmentIndex
            }
        );
        
        this.map.geoObjects.add(polyline);
        this.routeLines.push(polyline);
    }
    
    createBalloonContent(fromPlace, toPlace, distance, duration, mode) {
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
        return mapping[mode] || 'walking';
    }
    
    getModeColor(mode) {
        const colors = {
            'pedestrian': '#2E86DE',
            'auto': '#EE5A6F',
            'masstransit': '#26de81',
            'bicycle': '#FFA502'
        };
        return colors[mode] || '#2E86DE';
    }
    
    getStrokeWidth(mode) {
        return mode === 'auto' ? 5 : 6;
    }
    
    getModeStyle(mode) {
        return mode === 'auto' ? 'solid' : '5 5';
    }
    
    getModeIcon(mode) {
        const icons = {
            'pedestrian': '🚶',
            'auto': '🚗',
            'masstransit': '🚌',
            'bicycle': '🚴'
        };
        return icons[mode] || '🚶';
    }
    
    getModeName(mode) {
        const names = {
            'pedestrian': 'Пешком',
            'auto': 'На машине',
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
        
        this.multiRoutes.forEach(route => {
            this.map.geoObjects.remove(route);
        });
        this.multiRoutes = [];
        
        this.segmentDataArray = [];
    }
    
    fitMapToRoute() {
        if (this.routeLines.length === 0) {
            console.warn('[MapSmartWalk] No routes to fit');
            return;
        }
        
        try {
            const bounds = this.map.geoObjects.getBounds();
            
            if (bounds) {
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
    }
    
    getRouteData() {
        return this.currentRouteData;
    }
    
    getSegmentData() {
        return this.segmentDataArray;
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
console.log('[MapSmartWalk] Class loaded');
