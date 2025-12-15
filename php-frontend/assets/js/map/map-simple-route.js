/**
 * Простой маршрут A -> B
 * Полностью переписан на основе MapSmartWalk для правильной работы
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
        window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
        console.log('[MapSimpleRoute] Global function registered');
    }
    
    async displaySimpleRoute(routeData) {
        console.log('[MapSimpleRoute] =========================================');
        console.log('[MapSimpleRoute] Building simple route...');
        console.log('[MapSimpleRoute] Route data:', routeData);
        
        this.clearRouteLines();
        
        try {
            const points = [];
            const pointNames = [];
            
            console.log('[MapSimpleRoute] Geocoding start point:', routeData.start_point);
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
            
            console.log('[MapSimpleRoute] Geocoding end point:', routeData.end_point);
            const endCoords = await this.geocode(routeData.end_point);
            points.push(endCoords);
            pointNames.push(routeData.end_point);
            
            console.log('[MapSimpleRoute] All points geocoded:', points);
            
            const places = [];
            const mode = routeData.mode || 'auto';
            
            places.push({
                name: pointNames[0],
                coordinates: points[0],
                address: pointNames[0],
                type: 'start',
                transport_mode: mode
            });
            
            for (let i = 1; i < points.length - 1; i++) {
                places.push({
                    name: pointNames[i],
                    coordinates: points[i],
                    address: pointNames[i],
                    type: 'waypoint',
                    transport_mode: mode
                });
            }
            
            places.push({
                name: pointNames[pointNames.length - 1],
                coordinates: points[points.length - 1],
                address: pointNames[pointNames.length - 1],
                type: 'end',
                transport_mode: mode
            });
            
            console.log('[MapSimpleRoute] Places prepared:', places);
            
            this.currentRouteData = {
                places: places,
                start_point: points[0],
                end_point: points[points.length - 1],
                return_to_start: false,
                mode: mode,
                activities: []
            };
            
            for (let i = 0; i < places.length - 1; i++) {
                await this.drawSegment(places[i], places[i + 1], i);
            }
            
            console.log('[MapSimpleRoute] All segments drawn');
            console.log('[MapSimpleRoute] Total multiRoutes:', this.multiRoutes.length);
            
            setTimeout(() => {
                console.log('[MapSimpleRoute] ⏰ Post-route tasks');
                
                const startCoords = places[0].coordinates;
                const endCoords = places[places.length - 1].coordinates;
                const centerLat = (startCoords[0] + endCoords[0]) / 2;
                const centerLon = (startCoords[1] + endCoords[1]) / 2;
                
                console.log('[MapSimpleRoute] Moving to:', [centerLat, centerLon]);
                
                this.map.setCenter([centerLat, centerLon], 13, {
                    duration: 500
                });
                
                if (window.MapRouteBuilder) {
                    window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
                    setTimeout(() => {
                        window.MapRouteBuilder.showRouteInfoPanel(places);
                    }, 500);
                }
                
                this.saveRouteToDB(this.currentRouteData);
                
            }, 1000);
            
            console.log('[MapSimpleRoute] ✅ Route built!');
            console.log('[MapSimpleRoute] =========================================');
            
        } catch (error) {
            console.error('[MapSimpleRoute] ❌ Error:', error);
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
    
    async drawSegment(fromPlace, toPlace, segmentIndex) {
        const mode = toPlace.transport_mode || 'auto';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapSimpleRoute] 🛣️ Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name}`);
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            
            // РАДИКАЛЬНОЕ РЕШЕНИЕ: УБИРАЕМ ВСЕ ОПЦИИ, ИСПОЛЬЗУЕМ ДЕФОЛТНЫЕ
            // Оставляем ТОЛЬКО стиль линии
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, {
                // МИНИМАЛЬНЫЕ опции - пусть Yandex решает как отображать
                routeActiveStrokeWidth: 6,
                routeActiveStrokeColor: '#007AFF'
            });
            
            console.log(`[MapSimpleRoute]   ✓ MultiRoute created`);
            
            this.map.geoObjects.add(multiRoute);
            this.multiRoutes.push(multiRoute);
            
            console.log(`[MapSimpleRoute]   ✓ Added to map. Total: ${this.multiRoutes.length}`);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout'));
                }, 10000);
                
                multiRoute.model.events.once('requestsuccess', () => {
                    clearTimeout(timeout);
                    console.log(`[MapSimpleRoute]   ✓ Route loaded`);
                    
                    // ПРИНУДИТЕЛЬНО ПОКАЗЫВАЕМ ВСЕ МАРШРУТЫ
                    const routes = multiRoute.getRoutes();
                    console.log(`[MapSimpleRoute]   Routes available: ${routes.getLength()}`);
                    
                    routes.each((route, idx) => {
                        console.log(`[MapSimpleRoute]   Route ${idx}:`, route);
                        // Принудительно делаем видимым
                        try {
                            route.options.set('visible', true);
                            route.options.set('opacity', 1);
                            console.log(`[MapSimpleRoute]     ✓ Route ${idx} set visible`);
                        } catch(e) {
                            console.log(`[MapSimpleRoute]     ⚠️ Can't set visible:`, e.message);
                        }
                    });
                    
                    resolve();
                });
                
                multiRoute.model.events.once('requestfail', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSimpleRoute] ⚠️ No active route`);
                return;
            }
            
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`[MapSimpleRoute]   ✓ ${(distance / 1000).toFixed(2)} km, ${(duration / 60).toFixed(0)} min`);
            
            this.segmentDataArray.push({
                index: segmentIndex,
                distance: distance,
                duration: duration,
                mode: mode,
                fromPlace: fromPlace.name,
                toPlace: toPlace.name,
                isReturn: false
            });
            
        } catch (error) {
            console.error(`[MapSimpleRoute] ❌ Error segment ${segmentIndex}:`, error);
            throw error;
        }
    }
    
    async saveRouteToDB(routeData) {
        if (this.isSaving) return;
        
        this.isSaving = true;
        
        try {
            const bodyElement = document.querySelector('body');
            const isLoggedIn = bodyElement && bodyElement.dataset.loggedIn === 'true';
            
            if (!isLoggedIn) {
                console.log('[MapSimpleRoute] Not logged in, skipping save');
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
                console.log('[MapSimpleRoute] Already saved, skipping');
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
        return mapping[mode] || 'auto';
    }
    
    clearRouteLines() {
        console.log(`[MapSimpleRoute] Clearing ${this.multiRoutes.length} routes`);
        this.multiRoutes.forEach(route => this.map.geoObjects.remove(route));
        this.multiRoutes = [];
        this.segmentDataArray = [];
    }
}

window.MapSimpleRoute = MapSimpleRoute;
console.log('[MapSimpleRoute] Class loaded');
