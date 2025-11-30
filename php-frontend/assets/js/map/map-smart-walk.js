/**
 * Map Smart Walk - С РЕАЛЬНЫМ YANDEX ROUTING
 * Бэкенд отправляет точки, фронтенд строит маршрут через Yandex
 */

class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.routeLines = [];
        this.currentRouteData = null;
        this.isBuilding = false;
        this.yandexRoutes = [];  // Хранилище Yandex route объектов
        
        if (!this.map) {
            console.error('[MapSmartWalk] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapSmartWalk] Initialized with Yandex routing');
    }
    
    init() {
        window.EventBus?.on('route:updated', (routeData) => {
            console.log('[MapSmartWalk] Route updated');
            this.visualizeRoute(routeData);
        });
    }
    
    /**
     * Visualize route using REAL Yandex routing
     */
    async visualizeRoute(routeData) {
        console.log('[MapSmartWalk] Visualizing with Yandex routing...', routeData);
        
        this.clearRouteLines();
        
        if (!routeData || !routeData.places || routeData.places.length < 2) {
            console.warn('[MapSmartWalk] Not enough places');
            return;
        }
        
        const places = routeData.places;
        const mode = routeData.mode || 'pedestrian';
        
        // Конвертируем режим для Yandex
        const yandexMode = this.convertModeToYandex(mode);
        
        console.log(`[MapSmartWalk] Building ${places.length - 1} segments in ${yandexMode} mode`);
        
        // 🔥 СТРОИМ МАРШРУТ ЧЕРЕЗ YANDEX для каждого сегмента
        for (let i = 0; i < places.length - 1; i++) {
            await this.drawSegmentWithYandex(places[i], places[i + 1], yandexMode, i);
        }
        
        // Fit map
        setTimeout(() => this.fitMapToRoute(), 500);
        
        console.log('[MapSmartWalk] ✅ Route visualization complete');
    }
    
    /**
     * 🔥 ГЛАВНАЯ ФУНКЦИЯ: Рисует сегмент через Yandex Router
     */
    async drawSegmentWithYandex(fromPlace, toPlace, yandexMode, segmentIndex) {
        try {
            const fromCoords = fromPlace.coordinates;
            const toCoords = toPlace.coordinates;
            
            console.log(`[MapSmartWalk] Building segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name}`);
            console.log(`  From: ${fromCoords}, To: ${toCoords}, Mode: ${yandexMode}`);
            
            // 🔥 ЗАПРОС К YANDEX ROUTER API
            const route = await ymaps.route(
                [fromCoords, toCoords],
                {
                    mapStateAutoApply: false,
                    routingMode: yandexMode,
                    avoidTrafficJams: false
                }
            );
            
            // Сохраняем route объект
            this.yandexRoutes.push(route);
            
            // Получаем путь (первый путь, если их несколько)
            const paths = route.getPaths();
            const firstPath = paths.get(0);
            
            if (!firstPath) {
                console.warn(`[MapSmartWalk] No path found for segment ${segmentIndex}`);
                // Fallback: прямая линия
                this.drawFallbackLine(fromCoords, toCoords, yandexMode);
                return;
            }
            
            // 🎨 Получаем геометрию (РЕАЛЬНАЯ геометрия дорог!)
            const geometry = firstPath.geometry;
            
            // 📊 Получаем данные о маршруте
            const distance = firstPath.getLength();  // метры
            const duration = firstPath.getTime();     // секунды
            const segments = firstPath.getSegments(); // сегменты с инструкциями
            
            console.log(`  ✅ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
            
            // 🎨 РИСУЕМ ЛИНИЮ
            const polyline = new ymaps.Polyline(
                geometry.getCoordinates(),
                {
                    // Balloon с деталями
                    balloonContent: this.createSegmentBalloon(
                        fromPlace, 
                        toPlace, 
                        distance, 
                        duration,
                        segments,
                        yandexMode
                    ),
                    hintContent: `${fromPlace.name} → ${toPlace.name}`
                },
                {
                    strokeColor: this.getModeColor(yandexMode),
                    strokeWidth: 5,
                    strokeOpacity: 0.8,
                    strokeStyle: this.getModeStyle(yandexMode)
                }
            );
            
            // Добавляем на карту
            this.map.geoObjects.add(polyline);
            this.routeLines.push(polyline);
            
            // Click handler
            polyline.events.add('click', () => {
                console.log(`[MapSmartWalk] Segment ${segmentIndex} clicked`);
                window.EventBus?.emit('segment:clicked', { 
                    index: segmentIndex, 
                    from: fromPlace, 
                    to: toPlace,
                    distance: distance,
                    duration: duration
                });
            });
            
            console.log(`  ✅ Segment ${segmentIndex + 1} drawn`);
            
        } catch (error) {
            console.error(`[MapSmartWalk] Error building segment ${segmentIndex}:`, error);
            // Fallback: прямая линия
            this.drawFallbackLine(fromPlace.coordinates, toPlace.coordinates, yandexMode);
        }
    }
    
    /**
     * Fallback: прямая линия если Yandex не вернул маршрут
     */
    drawFallbackLine(fromCoords, toCoords, yandexMode) {
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
    
    /**
     * Создать красивый balloon для сегмента
     */
    createSegmentBalloon(fromPlace, toPlace, distance, duration, segments, mode) {
        const icon = this.getModeIcon(mode);
        const modeName = this.getModeName(mode);
        
        let instructions = '';
        if (segments && segments.getLength() > 0) {
            instructions = '<div style="margin-top: 10px; font-size: 12px;"><strong>Маршрут:</strong><ol style="margin: 5px 0; padding-left: 20px;">';
            
            // Показываем первые 5 инструкций
            for (let i = 0; i < Math.min(5, segments.getLength()); i++) {
                const segment = segments.get(i);
                const street = segment.getStreet();
                if (street) {
                    instructions += `<li>${street}</li>`;
                }
            }
            
            if (segments.getLength() > 5) {
                instructions += `<li>... и еще ${segments.getLength() - 5} участков</li>`;
            }
            
            instructions += '</ol></div>';
        }
        
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
                ${instructions}
            </div>
        `;
    }
    
    /**
     * Конвертация режима в Yandex формат
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
     * Цвет линии по режиму
     */
    getModeColor(yandexMode) {
        const colors = {
            'pedestrian': '#2E86DE',  // Синий
            'auto': '#EE5A6F',        // Красный
            'masstransit': '#26de81', // Зеленый
            'bicycle': '#FFA502'      // Оранжевый
        };
        return colors[yandexMode] || '#2E86DE';
    }
    
    /**
     * Стиль линии по режиму
     */
    getModeStyle(yandexMode) {
        return yandexMode === 'auto' ? 'solid' : '5 5';
    }
    
    /**
     * Иконка по режиму
     */
    getModeIcon(yandexMode) {
        const icons = {
            'pedestrian': '🚶',
            'auto': '🚗',
            'masstransit': '🚌',
            'bicycle': '🚴'
        };
        return icons[yandexMode] || '🚶';
    }
    
    /**
     * Название режима
     */
    getModeName(yandexMode) {
        const names = {
            'pedestrian': 'Пешком',
            'auto': 'На машине',
            'masstransit': 'Общественный транспорт',
            'bicycle': 'На велосипеде'
        };
        return names[yandexMode] || 'Пешком';
    }
    
    /**
     * Clear all route lines
     */
    clearRouteLines() {
        console.log(`[MapSmartWalk] Clearing ${this.routeLines.length} routes`);
        
        this.routeLines.forEach(line => {
            this.map.geoObjects.remove(line);
        });
        this.routeLines = [];
        
        // Очищаем Yandex route объекты
        this.yandexRoutes = [];
    }
    
    /**
     * Fit map to show entire route
     */
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
    
    /**
     * Clear map
     */
    clearMap() {
        this.clearRouteLines();
        this.currentRouteData = null;
        console.log('[MapSmartWalk] Map cleared');
    }
    
    /**
     * Get current route data
     */
    getRouteData() {
        return this.currentRouteData;
    }
    
    /**
     * Get Yandex route objects (для доступа к деталям)
     */
    getYandexRoutes() {
        return this.yandexRoutes;
    }
    
    // Utility methods
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

// Export
window.MapSmartWalk = MapSmartWalk;

console.log('[MapSmartWalk] Class loaded with Yandex routing support');
