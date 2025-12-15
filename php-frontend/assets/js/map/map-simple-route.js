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
        // Глобальная функция для вызова из внешних модулей
        window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
        console.log('[MapSimpleRoute] Global function registered');
    }
    
    async displaySimpleRoute(routeData) {
        console.log('[MapSimpleRoute] =========================================');
        console.log('[MapSimpleRoute] Building simple route...');
        console.log('[MapSimpleRoute] Route data:', routeData);
        
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
            
            // Подождём и выполним финальные задачи
            setTimeout(() => {
                console.log('[MapSimpleRoute] ⏰ Executing post-route tasks');
                
                // Подгоняем карту под маршрут
                this.fitMapToRoute();
                
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
                
            }, 1000); // Увеличено до 1000ms для надёжности
            
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
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            console.log(`[MapSimpleRoute]   Yandex routing mode: ${routingMode}`);
            
            // Критически важно: убедимся, что маршрут будет виден!
            const routeOptions = {
                boundsAutoApply: false,
                // Все эти опции скрывают маркеры, но не саму линию
                wayPointVisible: false,
                wayPointStartVisible: false,
                wayPointFinishVisible: false,
                wayPointStartIconVisible: false,
                wayPointFinishIconVisible: false,
                wayPointIconVisible: false,
                pinVisible: false,
                viaPointVisible: false,
                // Стиль линии маршрута
                routeActiveStrokeWidth: 6,
                routeActiveStrokeStyle: 'solid',
                routeActiveStrokeColor: '#4A90E2',
                routeActiveStrokeOpacity: 0.9
            };
            
            console.log(`[MapSimpleRoute]   Creating multiRoute with options:`, routeOptions);
            
            const multiRoute = new ymaps.multiRouter.MultiRoute({
                referencePoints: [fromCoords, toCoords],
                params: {
                    routingMode: routingMode
                }
            }, routeOptions);
            
            console.log(`[MapSimpleRoute]   MultiRoute created, adding to map...`);
            this.map.geoObjects.add(multiRoute);
            this.multiRoutes.push(multiRoute);
            console.log(`[MapSimpleRoute]   ✓ Added to map. Total routes: ${this.multiRoutes.length}`);
            
            // Ждём успешного построения маршрута
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error(`[MapSimpleRoute]   ❌ Timeout waiting for route`);
                    reject(new Error('Timeout waiting for route'));
                }, 10000);
                
                multiRoute.model.events.once('requestsuccess', () => {
                    clearTimeout(timeout);
                    console.log(`[MapSimpleRoute]   ✓ Route request successful`);
                    resolve();
                });
                
                multiRoute.model.events.once('requestfail', (error) => {
                    clearTimeout(timeout);
                    console.error(`[MapSimpleRoute]   ❌ Route request failed:`, error);
                    reject(error);
                });
            });
            
            // Получаем данные активного маршрута
            const activeRoute = multiRoute.getActiveRoute();
            if (!activeRoute) {
                console.warn(`[MapSimpleRoute] ⚠️ No active route for segment ${segmentIndex}`);
                return;
            }
            
            const distance = activeRoute.properties.get('distance').value;
            const duration = activeRoute.properties.get('duration').value;
            
            console.log(`[MapSimpleRoute]   ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            // Сохраняем данные сегмента
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
            
            // Проверка на дубликаты
            const savedRoutes = JSON.parse(localStorage.getItem('recently_saved_routes') || '[]');
            const routeSignature = this.getRouteSignature(saveData);
            
            console.log('[MapSimpleRoute] 🔍 Route signature:', routeSignature);
            
            const isDuplicate = savedRoutes.some(sig => sig === routeSignature);
            if (isDuplicate) {
                console.log('[MapSimpleRoute] ⚠️ Route already saved recently, skipping duplicate');
                return;
            }
            
            console.log('[MapSimpleRoute] ✓ No duplicate found, proceeding to API call');
            
            // Отправка на сервер
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
                
                // Сохраняем сигнатуру в localStorage
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
    
    fitMapToRoute() {
        console.log(`[MapSimpleRoute] 🗺️ fitMapToRoute called`);
        console.log(`[MapSimpleRoute]   multiRoutes.length: ${this.multiRoutes.length}`);
        console.log(`[MapSimpleRoute]   map.geoObjects.getLength(): ${this.map.geoObjects.getLength()}`);
        
        if (this.multiRoutes.length === 0) {
            console.warn('[MapSimpleRoute] ⚠️ No routes to fit');
            return;
        }
        
        try {
            // Получаем bounds всех геообъектов на карте
            const bounds = this.map.geoObjects.getBounds();
            console.log(`[MapSimpleRoute]   Bounds:`, bounds);
            
            if (bounds) {
                console.log(`[MapSimpleRoute]   ✓ Setting map bounds...`);
                this.map.setBounds(bounds, {
                    checkZoomRange: true,
                    zoomMargin: 80, // Увеличено для лучшей видимости
                    duration: 500
                }).then(() => {
                    const zoom = this.map.getZoom();
                    console.log(`[MapSimpleRoute]   ✓ Bounds set! Current zoom: ${zoom}`);
                    
                    if (zoom > 16) {
                        console.log(`[MapSimpleRoute]   Adjusting zoom to 15`);
                        this.map.setZoom(15);
                    }
                }).catch(err => {
                    console.error(`[MapSimpleRoute]   ❌ Error setting bounds:`, err);
                });
            } else {
                console.warn('[MapSimpleRoute] ⚠️ No bounds available');
            }
        } catch (error) {
            console.error('[MapSimpleRoute] ❌ Error fitting map:', error);
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
}

window.MapSimpleRoute = MapSimpleRoute;
console.log('[MapSimpleRoute] Class loaded');
