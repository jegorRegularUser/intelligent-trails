/**
 * Простой маршрут A -> B
 * Полностью аналогичен MapSmartWalk
 */
class MapSimpleRoute {
    constructor(map) {
        this.map = map;
        this.multiRoutes = [];
        this.currentRouteData = null;
        this.segmentDataArray = [];
        this.isSaving = false;
        
        if (!this.map) {
            console.error('[MapSimpleRoute] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapSimpleRoute] Initialized');
    }
    
    init() {
        // ИСПОЛЬЗУЕМ EventBus КАК В MapSmartWalk!
        window.EventBus?.on('simple:route', (routeData) => {
            console.log('[MapSimpleRoute] simple:route event received');
            this.visualizeSimpleRoute(routeData);
        });
        
        // Оставляем старую функцию для совместимости
        window.displaySimpleRoute = (routeData) => {
            console.log('[MapSimpleRoute] displaySimpleRoute called, emitting event');
            window.EventBus?.emit('simple:route', routeData);
        };
        
        console.log('[MapSimpleRoute] Event handlers registered');
    }
    
    async visualizeSimpleRoute(routeData) {
        console.log('[MapSimpleRoute] =========================================');
        console.log('[MapSimpleRoute] Visualizing simple route...');
        console.log('[MapSimpleRoute] Route data:', routeData);
        
        this.clearRouteLines();
        this.segmentDataArray = [];
        this.currentRouteData = routeData;
        
        try {
            const points = [];
            const pointNames = [];
            
            console.log('[MapSimpleRoute] Geocoding start:', routeData.start_point);
            const startCoords = await this.geocode(routeData.start_point);
            points.push(startCoords);
            pointNames.push(routeData.start_point);
            
            if (routeData.waypoints && routeData.waypoints.length > 0) {
                for (const waypoint of routeData.waypoints) {
                    console.log('[MapSimpleRoute] Geocoding waypoint:', waypoint);
                    const coords = await this.geocode(waypoint);
                    points.push(coords);
                    pointNames.push(waypoint);
                }
            }
            
            console.log('[MapSimpleRoute] Geocoding end:', routeData.end_point);
            const endCoords = await this.geocode(routeData.end_point);
            points.push(endCoords);
            pointNames.push(routeData.end_point);
            
            console.log('[MapSimpleRoute] All points geocoded:', points);
            
            const places = [];
            const mode = routeData.mode || 'auto';
            
            for (let i = 0; i < points.length; i++) {
                places.push({
                    name: pointNames[i],
                    coordinates: points[i],
                    address: pointNames[i],
                    type: i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'waypoint'),
                    transport_mode: mode
                });
            }
            
            console.log(`[MapSimpleRoute] Building route through ${places.length} places`);
            
            // СТРОИМ СЕГМЕНТЫ ТОЧНО КАК В MapSmartWalk
            for (let i = 0; i < places.length - 1; i++) {
                await this.drawSegment(places[i], places[i + 1], i, false);
            }
            
            console.log('[MapSimpleRoute] ⏳ Waiting 500ms before post-route tasks...');
            
            setTimeout(() => {
                console.log('[MapSimpleRoute] ✓ Executing post-route tasks');
                
                this.fitMapToRoute();
                
                if (window.MapRouteBuilder) {
                    window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
                    setTimeout(() => {
                        window.MapRouteBuilder.showRouteInfoPanel(places);
                    }, 500);
                }
                
                this.saveRouteToDB(this.currentRouteData);
                
            }, 500);
            
            console.log('[MapSimpleRoute] Route visualization complete');
            console.log('[MapSimpleRoute] =========================================');
            
        } catch (error) {
            console.error('[MapSimpleRoute] Error:', error);
            alert('Ошибка: ' + error.message);
        }
    }
    
    async geocode(address) {
        try {
            const result = await ymaps.geocode(address, { results: 1 });
            const geoObject = result.geoObjects.get(0);
            
            if (!geoObject) {
                throw new Error(`Адрес не найден: ${address}`);
            }
            
            const coords = geoObject.geometry.getCoordinates();
            console.log(`[MapSimpleRoute] Geocoded "${address}" -> [${coords[0]}, ${coords[1]}]`);
            return coords;
            
        } catch (error) {
            console.error('[MapSimpleRoute] Geocoding error:', error);
            throw new Error(`Не удалось найти: ${address}`);
        }
    }
    
    async drawSegment(fromPlace, toPlace, segmentIndex, isReturnSegment = false) {
        const mode = toPlace.transport_mode || 'pedestrian';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapSimpleRoute] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name} (${mode})`);
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            
            // ТОЧНО ТАКИЕ ЖЕ ОПЦИИ КАК В MapSmartWalk
            const routeOptions = {
                boundsAutoApply: false,
                wayPointVisible: false,
                wayPointStartVisible: false,
                wayPointFinishVisible: false,
                wayPointStartIconVisible: false,
                wayPointFinishIconVisible: false,
                wayPointIconVisible: false,
                pinVisible: false,
                viaPointVisible: false,
                routeActiveStrokeWidth: 5,
                routeActiveStrokeStyle: 'solid'
            };
            
            if (isReturnSegment) {
                routeOptions.routeActiveStrokeColor = '#FF6B6B';
                routeOptions.routeActiveStrokeStyle = 'shortdash';
            } else {
                routeOptions.routeActiveStrokeColor = '#4A90E2';
            }
            
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, routeOptions);
            
            this.map.geoObjects.add(multiRoute);
            this.multiRoutes.push(multiRoute);
            
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
            
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSimpleRoute] No active route for segment ${segmentIndex}`);
                return;
            }
            
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            const segmentData = {
                index: segmentIndex,
                distance: distance,
                duration: duration,
                mode: mode,
                fromPlace: fromPlace.name,
                toPlace: toPlace.name,
                isReturn: isReturnSegment
            };
            this.segmentDataArray.push(segmentData);
            
            console.log(`  ✓ Segment drawn successfully`);
            
        } catch (error) {
            console.error(`[MapSimpleRoute] Error building segment ${segmentIndex}:`, error);
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
    
    clearRouteLines() {
        console.log(`[MapSimpleRoute] Clearing ${this.multiRoutes.length} routes`);
        
        this.multiRoutes.forEach(route => {
            this.map.geoObjects.remove(route);
        });
        this.multiRoutes = [];
        this.segmentDataArray = [];
    }
    
    fitMapToRoute() {
        if (this.multiRoutes.length === 0) {
            console.warn('[MapSimpleRoute] No routes to fit');
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
            console.error('[MapSimpleRoute] Error fitting map:', error);
        }
    }
    
    async saveRouteToDB(routeData) {
        if (this.isSaving) return;
        
        this.isSaving = true;
        
        try {
            const bodyElement = document.querySelector('body');
            const isLoggedIn = bodyElement && bodyElement.dataset.loggedIn === 'true';
            
            if (!isLoggedIn) {
                console.log('[MapSimpleRoute] Not logged in');
                return;
            }
            
            const places = routeData.places.map(place => ({
                name: place.name || 'Точка',
                address: place.address || '',
                coordinates: place.coordinates || [0, 0],
                category: '',
                transport_mode: place.transport_mode || 'auto',
                description: ''
            }));
            
            const segments = this.segmentDataArray.map(seg => ({
                index: seg.index,
                fromPlace: seg.fromPlace,
                toPlace: seg.toPlace,
                distance: seg.distance,
                duration: seg.duration,
                mode: seg.mode,
                isReturn: false
            }));
            
            const totalDistance = this.segmentDataArray.reduce((sum, seg) => sum + (seg.distance || 0), 0);
            const totalDuration = this.segmentDataArray.reduce((sum, seg) => sum + (seg.duration || 0), 0);
            
            const saveData = {
                start_point: {
                    name: places[0].name,
                    address: places[0].address,
                    coords: places[0].coordinates
                },
                end_point: places.length > 1 ? {
                    name: places[places.length - 1].name,
                    address: places[places.length - 1].address,
                    coords: places[places.length - 1].coordinates
                } : null,
                
                categories: [],
                time_limit_minutes: Math.round(totalDuration / 60),
                return_to_start: false,
                mode: routeData.mode || 'auto',
                
                places: places,
                segments: segments,
                
                total_distance: totalDistance,
                total_time: totalDuration,
                
                summary: {
                    total_distance: totalDistance,
                    total_distance_km: (totalDistance / 1000).toFixed(2),
                    total_duration: totalDuration,
                    total_duration_minutes: Math.round(totalDuration / 60),
                    number_of_places: places.length
                },
                
                settings: {
                    pace: 'balanced',
                    time_strictness: 5
                }
            };
            
            const savedRoutes = JSON.parse(localStorage.getItem('recently_saved_routes') || '[]');
            const routeSignature = this.getRouteSignature(saveData);
            
            const isDuplicate = savedRoutes.some(sig => sig === routeSignature);
            if (isDuplicate) {
                console.log('[MapSimpleRoute] Already saved');
                return;
            }
            
            const response = await fetch('api.php?action=build_smart_walk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData)
            });
            
            const result = JSON.parse(await response.text());
            
            if (result.success) {
                savedRoutes.push(routeSignature);
                if (savedRoutes.length > 10) savedRoutes.shift();
                localStorage.setItem('recently_saved_routes', JSON.stringify(savedRoutes));
                this.showNotification('✅ Маршрут сохранен', 'success');
            }
            
        } catch (error) {
            console.error('[MapSimpleRoute] Save error:', error);
        } finally {
            this.isSaving = false;
        }
    }
    
    getRouteSignature(routeData) {
        const coords = routeData.places.map(p => p.coordinates.join(',')).join('|');
        return `${coords}_simple_${routeData.mode || 'auto'}`;
    }
    
    showNotification(message, type = 'info') {
        if (window.routeModal && typeof window.routeModal.showNotification === 'function') {
            window.routeModal.showNotification(message, type);
            return;
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

window.MapSimpleRoute = MapSimpleRoute;
console.log('[MapSimpleRoute] Class loaded');
