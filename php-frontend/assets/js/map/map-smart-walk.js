class MapSmartWalk {
    constructor(map) {
        this.map = map;
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
            
            // Создаем multiRoute - его и оставляем на карте!
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, {
                boundsAutoApply: false,
                // Убираем только метки A и B
                wayPointStartIconVisible: false,
                wayPointFinishIconVisible: false
            });
            
            // Добавляем multiRoute на карту - он сам нарисует красивый маршрут
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
            
            // Получаем активный маршрут для сохранения данных
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSmartWalk] No active route for segment ${segmentIndex}`);
                return;
            }
            
            // Получаем данные маршрута
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
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
            
            console.log(`  ✓ Segment drawn successfully`);
            
        } catch (error) {
            console.error(`[MapSmartWalk] Error building segment ${segmentIndex}:`, error);
        }
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
        console.log(`[MapSmartWalk] Clearing ${this.multiRoutes.length} routes`);
        
        this.multiRoutes.forEach(route => {
            this.map.geoObjects.remove(route);
        });
        this.multiRoutes = [];
        this.segmentDataArray = [];
    }
    
    fitMapToRoute() {
        if (this.multiRoutes.length === 0) {
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
