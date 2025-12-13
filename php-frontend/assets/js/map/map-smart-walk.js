class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.routeLines = [];
        this.currentRouteData = null;
        this.isBuilding = false;
        this.yandexRoutes = [];
        this.pathGeometries = new Map();
        this.segmentDataArray = [];
        
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
        this.pathGeometries.clear();
        this.segmentDataArray = [];
        
        if (!routeData || !routeData.places || routeData.places.length < 2) {
            console.warn('[MapSmartWalk] Not enough places to build route');
            return;
        }
        
        const places = routeData.places;
        console.log(`[MapSmartWalk] Building route through ${places.length} places`);
        
        for (let i = 0; i < places.length - 1; i++) {
            await this.drawSegmentWithYandex(places[i], places[i + 1], i);
        }
        
        setTimeout(() => {
            this.fitMapToRoute();
            if (window.MapRouteBuilder) {
                window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
            }
        }, 500);
        
        console.log('[MapSmartWalk] Route visualization complete');
    }
    
async drawSegmentWithYandex(fromPlace, toPlace, segmentIndex) {
    try {
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        const mode = toPlace.transport_mode || 'pedestrian';
        
        console.log(`[MapSmartWalk] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name}`);
        console.log(`  Transport mode FROM toPlace.transport_mode: "${mode}"`);
        
        const yandexMode = this.convertModeToYandex(mode);
        console.log(`  Yandex mode: "${yandexMode}"`);
        
        // ДЛЯ YANDEX API 2.1 нужно передавать точки как объекты с type!
        const points = [
            {
                type: 'wayPoint',
                point: fromCoords
            },
            {
                type: 'wayPoint',
                point: toCoords
            }
        ];
        
        const routeOptions = {
            mapStateAutoApply: false,
            multiRoute: true
        };
        
        //КРИТИЧНО! Для пешеходного режима используем специальный параметр
        if (yandexMode === 'pedestrian') {
            routeOptions.avoidTrafficJams = false;
            // Используем pedestrian router
            const route = await ymaps.route(points, {
                ...routeOptions,
                routingMode: 'pedestrian'
            });
            
            await this.processRoute(route, fromPlace, toPlace, mode, segmentIndex, fromCoords, toCoords);
            
        } else if (yandexMode === 'auto') {
            routeOptions.avoidTrafficJams = false;
            
            const route = await ymaps.route([fromCoords, toCoords], {
                ...routeOptions,
                routingMode: 'auto'
            });
            
            await this.processRoute(route, fromPlace, toPlace, mode, segmentIndex, fromCoords, toCoords);
            
        } else {
            // Для остальных режимов
            const route = await ymaps.route([fromCoords, toCoords], {
                ...routeOptions,
                routingMode: yandexMode
            });
            
            await this.processRoute(route, fromPlace, toPlace, mode, segmentIndex, fromCoords, toCoords);
        }
        
    } catch (error) {
        console.error(`[MapSmartWalk] Error building segment ${segmentIndex}:`, error);
        this.drawFallbackLine(fromPlace.coordinates, toPlace.coordinates, mode, segmentIndex);
    }
}

async processRoute(route, fromPlace, toPlace, mode, segmentIndex, fromCoords, toCoords) {
    this.yandexRoutes.push(route);
    
    const paths = route.getPaths();
    const firstPath = paths.get(0);
    
    if (!firstPath) {
        console.warn(`[MapSmartWalk] No path found`);
        this.drawFallbackLine(fromCoords, toCoords, mode, segmentIndex);
        return;
    }
    
    const geometry = firstPath.geometry;
    const distance = firstPath.getLength();
    const duration = firstPath.getTime();
    
    const speed = ((distance / 1000) / (duration / 3600)).toFixed(1);
    console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min, Speed: ${speed} km/h`);
    
    if (mode === 'pedestrian' && parseFloat(speed) > 10) {
        console.warn(`  ⚠️ Speed too high for pedestrian mode! Falling back to straight line.`);
        this.drawFallbackLine(fromCoords, toCoords, mode, segmentIndex);
        return;
    }
    
    const segmentData = {
        index: segmentIndex,
        distance: distance,
        duration: duration,
        mode: mode,
        fromPlace: fromPlace.name,
        toPlace: toPlace.name
    };
    this.segmentDataArray.push(segmentData);
    
    const geometryCoords = geometry.getCoordinates();
    const isOverlapping = this.checkPathOverlap(geometryCoords);
    const offsetCoords = isOverlapping ? this.applyPathOffset(geometryCoords, segmentIndex) : geometryCoords;
    
    const polyline = new ymaps.Polyline(
        offsetCoords,
        {
            balloonContent: this.createSimpleBalloon(fromPlace, toPlace, distance, duration, mode),
            hintContent: `${fromPlace.name} → ${toPlace.name}`
        },
        {
            strokeColor: this.getModeColor(mode, segmentIndex),
            strokeWidth: this.getStrokeWidth(mode, isOverlapping, segmentIndex),
            strokeOpacity: this.getStrokeOpacity(isOverlapping, segmentIndex),
            strokeStyle: this.getModeStyle(mode, isOverlapping, segmentIndex),
            zIndex: 100 + segmentIndex
        }
    );
    
    this.map.geoObjects.add(polyline);
    this.routeLines.push(polyline);
    this.pathGeometries.set(segmentIndex, geometryCoords);
    
    polyline.events.add('click', () => {
        window.EventBus?.emit('segment:clicked', segmentData);
    });
    
    console.log(`  ✓ Segment drawn with mode "${mode}"`);
}


    checkPathOverlap(newPath) {
        for (let [index, existingPath] of this.pathGeometries.entries()) {
            if (this.pathsAreSimilar(newPath, existingPath)) {
                return true;
            }
        }
        return false;
    }
    
    pathsAreSimilar(path1, path2, threshold = 0.001) {
        const samples = Math.min(5, Math.min(path1.length, path2.length));
        let matches = 0;
        
        for (let i = 0; i < samples; i++) {
            const idx1 = Math.floor((i / samples) * path1.length);
            const idx2 = Math.floor((i / samples) * path2.length);
            
            const dist = Math.sqrt(
                Math.pow(path1[idx1][0] - path2[idx2][0], 2) +
                Math.pow(path1[idx1][1] - path2[idx2][1], 2)
            );
            
            if (dist < threshold) matches++;
        }
        
        return matches >= samples * 0.6;
    }
    
    applyPathOffset(coords, segmentIndex) {
        const offsetDistance = 0.0001 * (1 + (segmentIndex % 3) * 0.5);
        const angle = (segmentIndex % 4) * (Math.PI / 2);
        
        return coords.map(coord => [
            coord[0] + Math.cos(angle) * offsetDistance,
            coord[1] + Math.sin(angle) * offsetDistance
        ]);
    }
    
    getStrokeWidth(mode, isOverlapping, segmentIndex) {
        const baseWidth = (mode === 'auto') ? 5 : 6;
        return isOverlapping ? baseWidth - 1 : baseWidth;
    }
    
    getStrokeOpacity(isOverlapping, segmentIndex) {
        if (isOverlapping) {
            return 0.6 + (segmentIndex % 2) * 0.2;
        }
        return 0.7 + (segmentIndex * 0.03);
    }
    
    getModeStyle(mode, isOverlapping, segmentIndex) {
        if (isOverlapping) {
            const patterns = ['5 5', '10 5', '2 8', '8 4'];
            return patterns[segmentIndex % patterns.length];
        }
        return (mode === 'auto') ? 'solid' : '5 5';
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
            'masstransit': ['#26de81', '#3AE891', '#4EF2A1'],
            'bicycle': ['#FFA502', '#FFB220', '#FFBF3E']
        };
        
        const colors = baseColors[mode] || baseColors['pedestrian'];
        return colors[segmentIndex % colors.length];
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
        this.yandexRoutes = [];
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

console.log('[MapSmartWalk] Class loaded with Yandex routing support');
