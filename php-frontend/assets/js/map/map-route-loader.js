/**
 * MapRouteLoader - модуль для загрузки и отображения сохраненных маршрутов на карте
 * Отвечает за:
 * 1. Загрузку маршрута из БД
 * 2. Восстановление маршрута на карте
 * 3. Отображение информации о маршруте
 * 4. Управление визуализацией загруженного маршрута
 */

class MapRouteLoader {
    constructor(map) {
        this.map = map;
        this.currentLoadedRoute = null;
        this.loadedRouteMultiRoutes = [];
        this.isLoading = false;
        
        if (!this.map) {
            console.error('[MapRouteLoader] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapRouteLoader] Initialized');
    }
    
    init() {
        // Слушаем событие загрузки маршрута с параметрами URL
        window.EventBus?.on('route:load-by-id', (routeId) => {
            console.log('[MapRouteLoader] Load route event received, ID:', routeId);
            this.loadRouteById(routeId);
        });
        
        // Проверяем параметр load_route в URL при инициализации
        const urlParams = new URLSearchParams(window.location.search);
        const loadRouteId = urlParams.get('load_route');
        
        if (loadRouteId) {
            console.log('[MapRouteLoader] Route ID from URL:', loadRouteId);
            setTimeout(() => {
                this.loadRouteById(parseInt(loadRouteId));
            }, 1000); // Ждем инициализации карты
        }
    }
    
    /**
     * Загружает маршрут из БД по ID
     * @param {number} routeId - ID маршрута в БД
     */
    async loadRouteById(routeId) {
        if (this.isLoading) {
            console.log('[MapRouteLoader] Already loading, skipping');
            return;
        }
        
        this.isLoading = true;
        console.log('[MapRouteLoader] 📥 Starting route load: ID', routeId);
        
        try {
            const response = await fetch(`api.php?action=load_route&route_id=${routeId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            console.log('[MapRouteLoader] 📥 Server response:', result);
            
            if (!result.success) {
                console.error('[MapRouteLoader] ❌ Failed to load route:', result.error);
                this.showNotification('❌ Ошибка загрузки маршрута', 'error');
                return;
            }
            
            const routeData = result.data;
            const routeType = result.route_type;
            
            console.log('[MapRouteLoader] ✓ Route loaded successfully');
            console.log('[MapRouteLoader] ✓ Route type:', routeType);
            console.log('[MapRouteLoader] ✓ Route data:', routeData);
            
            // Восстанавливаем маршрут на карте в зависимости от типа
            if (routeType === 'smart_walk' || routeType === 'smart') {
                await this.visualizeSmartRoute(routeData);
            } else if (routeType === 'simple') {
                await this.visualizeSimpleRoute(routeData);
            } else {
                console.warn('[MapRouteLoader] Unknown route type:', routeType);
            }
            
            // Вызываем событие загрузки маршрута для других компонентов
            window.EventBus?.emit('route:loaded', {
                ...routeData,
                isLoaded: true,
                routeId: routeId
            });
            
            this.showNotification('✅ Маршрут загружен на карту', 'success');
            
        } catch (error) {
            console.error('[MapRouteLoader] ❌ Error loading route:', error);
            this.showNotification('❌ Ошибка при загрузке маршрута', 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Визуализирует умный маршрут (smart walk или smart route)
     * @param {Object} routeData - Данные маршрута
     */
    async visualizeSmartRoute(routeData) {
        console.log('[MapRouteLoader] 🎯 Visualizing smart route');
        
        this.clearLoadedRoute();
        this.currentLoadedRoute = routeData;
        
        if (!routeData.places || routeData.places.length < 2) {
            console.warn('[MapRouteLoader] Not enough places');
            return;
        }
        
        const places = routeData.places;
        console.log(`[MapRouteLoader] Building route through ${places.length} places`);
        
        // Определяем, это ли сегмент возврата
        const lastPlaceIsStart = routeData.return_to_start && 
            places[0].coordinates[0] === places[places.length - 1].coordinates[0] &&
            places[0].coordinates[1] === places[places.length - 1].coordinates[1];
        
        let returnSegmentIndex = -1;
        if (lastPlaceIsStart) {
            returnSegmentIndex = places.length - 2;
        }
        
        // Рисуем сегменты маршрута
        for (let i = 0; i < places.length - 1; i++) {
            const isReturnSegment = (i === returnSegmentIndex);
            await this.drawLoadedSegment(
                places[i],
                places[i + 1],
                i,
                isReturnSegment
            );
        }
        
        // Добавляем маркеры для всех мест
        this.addPlaceMarkers(places);
        
        // Подгоняем карту под маршрут
        setTimeout(() => {
            this.fitMapToLoadedRoute();
            
            // Показываем информационную панель
            this.displayRouteInfo(routeData);
        }, 500);
        
        console.log('[MapRouteLoader] ✓ Smart route visualization complete');
    }
    
    /**
     * Визуализирует простой маршрут
     * @param {Object} routeData - Данные маршрута
     */
    async visualizeSimpleRoute(routeData) {
        console.log('[MapRouteLoader] 🗺️ Visualizing simple route');
        
        this.clearLoadedRoute();
        this.currentLoadedRoute = routeData;
        
        try {
            // Для простого маршрута рисуем прямую линию между точками
            const routePoints = [];
            
            if (routeData.start_point && routeData.start_point.coords) {
                routePoints.push(routeData.start_point.coords);
            }
            
            if (routeData.waypoints && Array.isArray(routeData.waypoints)) {
                routeData.waypoints.forEach(wp => {
                    if (wp.coords) {
                        routePoints.push(wp.coords);
                    }
                });
            }
            
            if (routeData.end_point && routeData.end_point.coords) {
                routePoints.push(routeData.end_point.coords);
            }
            
            if (routePoints.length >= 2) {
                for (let i = 0; i < routePoints.length - 1; i++) {
                    await this.drawLoadedSegment(
                        { name: `Точка ${i + 1}`, coordinates: routePoints[i] },
                        { name: `Точка ${i + 2}`, coordinates: routePoints[i + 1] },
                        i,
                        false
                    );
                }
            }
            
            // Добавляем маркеры начальной и конечной точек
            if (routeData.start_point) {
                this.addPlaceMarker(routeData.start_point, '🚩', '#4A90E2');
            }
            if (routeData.end_point) {
                this.addPlaceMarker(routeData.end_point, '🏁', '#FF6B6B');
            }
            
            setTimeout(() => {
                this.fitMapToLoadedRoute();
                this.displayRouteInfo(routeData);
            }, 500);
            
            console.log('[MapRouteLoader] ✓ Simple route visualization complete');
            
        } catch (error) {
            console.error('[MapRouteLoader] Error visualizing simple route:', error);
        }
    }
    
    /**
     * Рисует сегмент маршрута (загруженный)
     * @param {Object} fromPlace - Начальная точка
     * @param {Object} toPlace - Конечная точка
     * @param {number} segmentIndex - Индекс сегмента
     * @param {boolean} isReturnSegment - Это ли сегмент возврата
     */
    async drawLoadedSegment(fromPlace, toPlace, segmentIndex, isReturnSegment = false) {
        const mode = toPlace.transport_mode || 'pedestrian';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapRouteLoader] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name}`);
        
        try {
            const routingMode = this.convertModeToYandex(mode);
            
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
            this.loadedRouteMultiRoutes.push(multiRoute);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout'));
                }, 5000);
                
                multiRoute.model.events.once('requestsuccess', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                multiRoute.model.events.once('requestfail', () => {
                    clearTimeout(timeout);
                    reject(new Error('Route building failed'));
                });
            });
            
            const activeRoute = multiRoute.getActiveRoute();
            if (activeRoute) {
                const distance = activeRoute.properties.get('distance').value;
                const duration = activeRoute.properties.get('duration').value;
                console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            }
            
        } catch (error) {
            console.error(`[MapRouteLoader] Error building segment ${segmentIndex}:`, error);
        }
    }
    
    /**
     * Добавляет маркеры для всех мест в маршруте
     * @param {Array} places - Массив мест
     */
    addPlaceMarkers(places) {
        places.forEach((place, index) => {
            let color = '#4A90E2';
            let icon = '📍';
            
            // Первая точка - зеленая
            if (index === 0) {
                color = '#2ECC71';
                icon = '🚩';
            }
            // Последняя точка - красная
            else if (index === places.length - 1) {
                color = '#FF6B6B';
                icon = '🏁';
            }
            // Промежуточные точки - синие
            else {
                color = '#4A90E2';
                icon = this.getCategoryIcon(place.category);
            }
            
            this.addPlaceMarker(place, icon, color);
        });
    }
    
    /**
     * Добавляет маркер на карту
     * @param {Object} place - Место с координатами и названием
     * @param {string} icon - Иконка (эмодзи или текст)
     * @param {string} color - Цвет маркера (hex)
     */
    addPlaceMarker(place, icon = '📍', color = '#4A90E2') {
        if (!place.coordinates) return;
        
        try {
            const placemark = new ymaps.Placemark(
                place.coordinates,
                {
                    balloonContent: `
                        <div style="padding: 10px; font-family: Arial; font-size: 12px;">
                            <h4 style="margin: 0 0 8px 0;">${icon} ${place.name || 'Место'}</h4>
                            ${place.address ? `<p style="margin: 0 0 8px 0; color: #666;">${place.address}</p>` : ''}
                            ${place.category ? `<p style="margin: 0; color: #999;">Категория: ${place.category}</p>` : ''}
                        </div>
                    `
                },
                {
                    preset: 'islands#blueIcon',
                    iconColor: color,
                    hasHint: true
                }
            );
            
            this.map.geoObjects.add(placemark);
        } catch (error) {
            console.error('[MapRouteLoader] Error adding placemark:', error);
        }
    }
    
    /**
     * Отображает информацию о маршруте в панели
     * @param {Object} routeData - Данные маршрута
     */
    displayRouteInfo(routeData) {
        const panel = document.getElementById('routeInfoPanel');
        if (!panel) {
            console.warn('[MapRouteLoader] Route info panel not found');
            return;
        }
        
        const statsDiv = document.getElementById('routeInfoStats');
        if (!statsDiv) return;
        
        // Вычисляем статистику
        let totalDistance = 0;
        let totalTime = 0;
        let placesCount = 0;
        
        if (routeData.places) {
            placesCount = routeData.places.length;
        }
        
        // Если есть готовая статистика
        if (routeData.summary) {
            totalDistance = routeData.summary.total_distance || 0;
            totalTime = routeData.summary.total_duration || 0;
        } else if (routeData.total_distance !== undefined) {
            totalDistance = routeData.total_distance;
            totalTime = routeData.total_time || 0;
        }
        
        const distanceKm = (totalDistance / 1000).toFixed(1);
        const timeMinutes = Math.round(totalTime / 60);
        
        statsDiv.innerHTML = `
            <div class="route-stat-item">
                <span class="stat-icon">📏</span>
                <span class="stat-label">Расстояние:</span>
                <span class="stat-value">${distanceKm} км</span>
            </div>
            <div class="route-stat-item">
                <span class="stat-icon">⏱️</span>
                <span class="stat-label">Время:</span>
                <span class="stat-value">${timeMinutes} мин</span>
            </div>
            <div class="route-stat-item">
                <span class="stat-icon">📍</span>
                <span class="stat-label">Мест:</span>
                <span class="stat-value">${placesCount}</span>
            </div>
        `;
        
        // Отображаем список мест
        const stagesList = document.getElementById('routeStagesList');
        if (stagesList && routeData.places) {
            stagesList.innerHTML = '<h4 style="margin: 16px 0 12px 0;">📍 Маршрут:</h4>' +
                routeData.places.map((place, idx) => `
                    <div class="route-stage">
                        <span class="stage-number">${idx + 1}</span>
                        <div class="stage-info">
                            <div class="stage-name">${place.name}</div>
                            ${place.address ? `<div class="stage-address">${place.address}</div>` : ''}
                        </div>
                    </div>
                `).join('');
        }
        
        // Показываем панель
        panel.style.display = 'block';
    }
    
    /**
     * Очищает загруженный маршрут с карты
     */
    clearLoadedRoute() {
        console.log(`[MapRouteLoader] Clearing ${this.loadedRouteMultiRoutes.length} loaded routes`);
        
        this.loadedRouteMultiRoutes.forEach(route => {
            this.map.geoObjects.remove(route);
        });
        
        this.loadedRouteMultiRoutes = [];
        this.currentLoadedRoute = null;
    }
    
    /**
     * Подгоняет карту под загруженный маршрут
     */
    fitMapToLoadedRoute() {
        if (this.loadedRouteMultiRoutes.length === 0) {
            console.warn('[MapRouteLoader] No routes to fit');
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
            console.error('[MapRouteLoader] Error fitting map:', error);
        }
    }
    
    /**
     * Преобразует режим транспорта в формат Yandex
     */
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
    
    /**
     * Получает иконку для категории места
     */
    getCategoryIcon(category) {
        const icons = {
            'cafe': '☕',
            'restaurant': '🍽️',
            'bar': '🍺',
            'park': '🌳',
            'museum': '🏛️',
            'monument': '🗿',
            'shop': '🛍️',
            'cinema': '🎬',
            'theater': '🎭',
            'church': '⛪'
        };
        return icons[category] || '📍';
    }
    
    /**
     * Показывает уведомление пользователю
     */
    showNotification(message, type = 'info') {
        if (window.routeModal && typeof window.routeModal.showNotification === 'function') {
            window.routeModal.showNotification(message, type);
            return;
        }
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    /**
     * Получает загруженный маршрут
     */
    getLoadedRoute() {
        return this.currentLoadedRoute;
    }
}

window.MapRouteLoader = MapRouteLoader;
console.log('[MapRouteLoader] Class loaded');
