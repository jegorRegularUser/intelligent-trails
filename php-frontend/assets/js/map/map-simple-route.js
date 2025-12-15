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
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: это настоящий экземпляр карты?
        console.log('[MapSimpleRoute] 🗺️ Map instance received:', this.map);
        console.log('[MapSimpleRoute] 🗺️ Map container:', this.map.container);
        console.log('[MapSimpleRoute] 🗺️ Map center:', this.map.getCenter());
        console.log('[MapSimpleRoute] 🗺️ Map zoom:', this.map.getZoom());
        console.log('[MapSimpleRoute] 🗺️ Map geoObjects:', this.map.geoObjects);
        console.log('[MapSimpleRoute] 🗺️ Is this the same as MapCore.map?', this.map === window.MapCore?.map);
        
        this.init();
        console.log('[MapSimpleRoute] Initialized');
    }
    
    init() {
        // Глобальная функция для вызова из внешних модулей
        window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
        console.log('[MapSimpleRoute] Global function registered');
    }
    
    async displaySimpleRoute(routeData) {
        console.log('[MapSimpleRoute] =========================================');
        console.log('[MapSimpleRoute] Building simple route...');
        console.log('[MapSimpleRoute] Route data:', routeData);
        
        // ПРОВЕРКА: карта всё ещё та же?
        console.log('[MapSimpleRoute] 🔍 Checking map instance before building...');
        console.log('[MapSimpleRoute] 🔍 this.map exists:', !!this.map);
        console.log('[MapSimpleRoute] 🔍 this.map === MapCore.map:', this.map === window.MapCore?.map);
        console.log('[MapSimpleRoute] 🔍 Map current center:', this.map.getCenter());
        console.log('[MapSimpleRoute] 🔍 Map current zoom:', this.map.getZoom());
        
        this.clearRouteLines();
        
        try {
            // Геокодирование всех точек
            const points = [];
            const pointNames = [];
            
            // Стартовая точка
            console.log('[MapSimpleRoute] Geocoding start point:', routeData.start_point);
            const startCoords = await this.geocode(routeData.start_point);
            points.push(startCoords);
            pointNames.push(routeData.start_point);
            
            // Промежуточные точки (waypoints)
            if (routeData.waypoints && routeData.waypoints.length > 0) {
                for (const waypoint of routeData.waypoints) {
                    console.log('[MapSimpleRoute] Geocoding waypoint:', waypoint);
                    const coords = await this.geocode(waypoint);
                    points.push(coords);
                    pointNames.push(waypoint);
                }
            }
            
            // Конечная точка
            console.log('[MapSimpleRoute] Geocoding end point:', routeData.end_point);
            const endCoords = await this.geocode(routeData.end_point);
            points.push(endCoords);
            pointNames.push(routeData.end_point);
            
            console.log('[MapSimpleRoute] All points geocoded:', points);
            
            // Создаём waypoints для визуализации
            const places = [];
            const mode = routeData.mode || 'auto';
            
            // Стартовая точка
            places.push({
                name: pointNames[0],
                coordinates: points[0],
                address: pointNames[0],
                type: 'start',
                transport_mode: mode
            });
            
            // Промежуточные точки
            for (let i = 1; i < points.length - 1; i++) {
                places.push({
                    name: pointNames[i],
                    coordinates: points[i],
                    address: pointNames[i],
                    type: 'waypoint',
                    transport_mode: mode
                });
            }
            
            // Конечная точка
            places.push({
                name: pointNames[pointNames.length - 1],
                coordinates: points[points.length - 1],
                address: pointNames[pointNames.length - 1],
                type: 'end',
                transport_mode: mode
            });
            
            console.log('[MapSimpleRoute] Places prepared:', places);
            
            // Сохраняем данные маршрута
            this.currentRouteData = {
                places: places,
                start_point: points[0],
                end_point: points[points.length - 1],
                return_to_start: false,
                mode: mode,
                activities: []
            };
            
            // Строим сегменты маршрута
            for (let i = 0; i < places.length - 1; i++) {
                await this.drawSegment(places[i], places[i + 1], i);
            }
            
            console.log('[MapSimpleRoute] All segments drawn, waiting for final tasks...');
            console.log('[MapSimpleRoute] Total multiRoutes on map:', this.multiRoutes.length);
            console.log('[MapSimpleRoute] Map geoObjects count:', this.map.geoObjects.getLength());
            
            // КРИТИЧЕСКАЯ ПРОВЕРКА: выводим ВСЕ geoObjects
            console.log('[MapSimpleRoute] 🔍 Listing ALL geoObjects on map:');
            this.map.geoObjects.each((geoObject, index) => {
                console.log(`  [${index}] Type:`, geoObject.constructor.name, 'Object:', geoObject);
            });
            
            // Подождём и выполним финальные задачи
            setTimeout(() => {
                console.log('[MapSimpleRoute] ⏰ Executing post-route tasks');
                
                // ПРЯМОЕ ПЕРЕМЕЩЕНИЕ к середине между точками
                const startCoords = places[0].coordinates;
                const endCoords = places[places.length - 1].coordinates;
                const centerLat = (startCoords[0] + endCoords[0]) / 2;
                const centerLon = (startCoords[1] + endCoords[1]) / 2;
                
                console.log('[MapSimpleRoute] 🎯 Manually moving map to center: [', centerLat, ',', centerLon, ']');
                
                this.map.setCenter([centerLat, centerLon], 13, {
                    duration: 500
                }).then(() => {
                    console.log('[MapSimpleRoute] ✓ Map moved to center!');
                    console.log('[MapSimpleRoute] ✓ New center:', this.map.getCenter());
                    console.log('[MapSimpleRoute] ✓ New zoom:', this.map.getZoom());
                });
                
                // Обновляем данные сегментов в MapRouteBuilder
                if (window.MapRouteBuilder) {
                    window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
                    console.log('[MapSimpleRoute] ✓ Segment data updated in MapRouteBuilder');
                    
                    // Показываем инфо-панель
                    setTimeout(() => {
                        window.MapRouteBuilder.showRouteInfoPanel(places);
                        console.log('[MapSimpleRoute] ✓ Route info panel shown');
                    }, 500);
                }
                
                // Сохраняем маршрут в БД если пользователь залогинен
                this.saveRouteToDB(this.currentRouteData);
                
            }, 1000);
            
            console.log('[MapSimpleRoute] ✅ Route built successfully!');
            console.log('[MapSimpleRoute] =========================================');
            
        } catch (error) {
            console.error('[MapSimpleRoute] ❌ Error building route:', error);
            alert('Ошибка построения маршрута: ' + error.message);
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
            throw new Error(`Не удалось найти адрес: ${address}`);
        }
    }
    
    async drawSegment(fromPlace, toPlace, segmentIndex) {
        const mode = toPlace.transport_mode || 'auto';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapSimpleRoute] 🛣️ Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name} (${mode})`);
        console.log(`[MapSimpleRoute]   From coords: [${fromCoords[0]}, ${fromCoords[1]}]`);
        console.log(`[MapSimpleRoute]   To coords: [${toCoords[0]}, ${toCoords[1]}]`);
        
        // ПРОВЕРКА: this.map всё ещё тот же экземпляр?
        console.log(`[MapSimpleRoute]   🔍 Drawing on map:`, this.map);
        console.log(`[MapSimpleRoute]   🔍 Is same as MapCore.map:`, this.map === window.MapCore?.map);
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            console.log(`[MapSimpleRoute]   Yandex routing mode: ${routingMode}`);
            
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
                routeActiveStrokeWidth: 8,
                routeActiveStrokeStyle: 'solid',
                routeActiveStrokeColor: '#FF4500',
                routeActiveStrokeOpacity: 1.0,
                routeStrokeWidth: 6,
                routeStrokeStyle: 'shortdash',
                routeStrokeColor: '#999999',
                routeStrokeOpacity: 0.5,
                visible: true
            };
            
            console.log(`[MapSimpleRoute]   Creating multiRoute...`);
            
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, routeOptions);
            
            console.log(`[MapSimpleRoute]   ✓ MultiRoute object created:`, multiRoute);
            console.log(`[MapSimpleRoute]   Adding to this.map.geoObjects...`);
            
            this.map.geoObjects.add(multiRoute);
            this.multiRoutes.push(multiRoute);
            
            console.log(`[MapSimpleRoute]   ✓ Added! Total routes in array: ${this.multiRoutes.length}`);
            console.log(`[MapSimpleRoute]   ✓ Map geoObjects count after add: ${this.map.geoObjects.getLength()}`);
            
            // Ждём успешного построения маршрута
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error(`[MapSimpleRoute]   ❌ Timeout waiting for route`);
                    reject(new Error('Timeout waiting for route'));
                }, 10000);
                
                multiRoute.model.events.once('requestsuccess', () => {
                    clearTimeout(timeout);
                    console.log(`[MapSimpleRoute]   ✓ Route request successful`);
                    
                    const routes = multiRoute.getRoutes();
                    console.log(`[MapSimpleRoute]   Routes count: ${routes.getLength()}`);
                    
                    resolve();
                });
                
                multiRoute.model.events.once('requestfail', (error) => {
                    clearTimeout(timeout);
                    console.error(`[MapSimpleRoute]   ❌ Route request failed:`, error);
                    reject(error);
                });
            });
            
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSimpleRoute] ⚠️ No active route for segment ${segmentIndex}`);
                return;
            }
            
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`[MapSimpleRoute]   ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            const segmentData = {
                index: segmentIndex,
                distance: distance,
                duration: duration,
                mode: mode,
                fromPlace: fromPlace.name,
                toPlace: toPlace.name,
                isReturn: false
            };
            this.segmentDataArray.push(segmentData);
            
            console.log(`[MapSimpleRoute]   ✅ Segment ${segmentIndex + 1} drawn successfully`);
            
        } catch (error) {
            console.error(`[MapSimpleRoute] ❌ Error building segment ${segmentIndex}:`, error);
            throw error;
        }
    }
    
    async saveRouteToDB(routeData) {
        if (this.isSaving) {
            console.log('[MapSimpleRoute] ⚠️ Already saving, skipping duplicate call');
            return;
        }
        
        this.isSaving = true;
        console.log('[MapSimpleRoute] 💾 ==== STARTING SAVE PROCESS ====');
        
        try {
            const bodyElement = document.querySelector('body');
            const isLoggedIn = bodyElement && bodyElement.dataset.loggedIn === 'true';
            
            console.log('[MapSimpleRoute] User logged in:', isLoggedIn);
            
            if (!isLoggedIn) {
                console.log('[MapSimpleRoute] ⚠️ User not logged in, skipping save');
                return;
            }
            
            console.log('[MapSimpleRoute] ✓ User is logged in, proceeding with save');
            
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
            
            console.log('[MapSimpleRoute] 📦 Prepared save data:', saveData);
            
            const savedRoutes = JSON.parse(localStorage.getItem('recently_saved_routes') || '[]');
            const routeSignature = this.getRouteSignature(saveData);
            
            console.log('[MapSimpleRoute] 🔍 Route signature:', routeSignature);
            
            const isDuplicate = savedRoutes.some(sig => sig === routeSignature);
            if (isDuplicate) {
                console.log('[MapSimpleRoute] ⚠️ Route already saved recently, skipping duplicate');
                return;
            }
            
            console.log('[MapSimpleRoute] ✓ No duplicate found, proceeding to API call');
            
            console.log('[MapSimpleRoute] 📤 Sending POST request to api.php?action=build_smart_walk');
            const response = await fetch('api.php?action=build_smart_walk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveData)
            });
            
            console.log('[MapSimpleRoute] 📥 Response status:', response.status);
            
            const responseText = await response.text();
            console.log('[MapSimpleRoute] 📥 Response text:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('[MapSimpleRoute] ❌ Failed to parse JSON:', e);
                throw new Error('Invalid JSON response: ' + responseText.substring(0, 100));
            }
            
            console.log('[MapSimpleRoute] 📥 Parsed result:', result);
            
            if (result.success) {
                console.log('[MapSimpleRoute] ✅ Route saved successfully!');
                console.log('[MapSimpleRoute] ✅ Route ID:', result.route_id);
                
                savedRoutes.push(routeSignature);
                if (savedRoutes.length > 10) {
                    savedRoutes.shift();
                }
                localStorage.setItem('recently_saved_routes', JSON.stringify(savedRoutes));
                console.log('[MapSimpleRoute] ✓ Signature saved to localStorage');
                
                this.showNotification('✅ Маршрут успешно сохранен!', 'success');
            } else {
                console.error('[MapSimpleRoute] ❌ Failed to save route:', result.error);
                this.showNotification('❌ Ошибка сохранения маршрута', 'error');
            }
            
        } catch (error) {
            console.error('[MapSimpleRoute] ❌ Error saving route:', error);
            console.error('[MapSimpleRoute] ❌ Error stack:', error.stack);
            this.showNotification('❌ Ошибка сохранения маршрута', 'error');
        } finally {
            this.isSaving = false;
            console.log('[MapSimpleRoute] 💾 ==== SAVE PROCESS COMPLETE ====');
        }
    }
    
    getRouteSignature(routeData) {
        const coords = routeData.places.map(p => p.coordinates.join(',')).join('|');
        const mode = routeData.mode || 'auto';
        return `${coords}_simple_${mode}`;
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
        console.log(`[MapSimpleRoute] 🧹 Clearing ${this.multiRoutes.length} routes`);
        
        this.multiRoutes.forEach(route => {
            this.map.geoObjects.remove(route);
        });
        this.multiRoutes = [];
        this.segmentDataArray = [];
        
        console.log(`[MapSimpleRoute] ✓ Routes cleared. Map geoObjects count: ${this.map.geoObjects.getLength()}`);
    }
}

window.MapSimpleRoute = MapSimpleRoute;
console.log('[MapSimpleRoute] Class loaded');
