class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.multiRoutes = [];
        this.currentRouteData = null;
        this.segmentDataArray = [];
        this.returnSegmentIndex = -1;
        
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
        this.returnSegmentIndex = -1;
        
        if (!routeData || !routeData.places || routeData.places.length < 2) {
            console.warn('[MapSmartWalk] Not enough places to build route');
            return;
        }
        
        const places = routeData.places;
        console.log(`[MapSmartWalk] Building route through ${places.length} places`);
        
        const lastPlaceIsStart = routeData.return_to_start && 
            places[0].coordinates[0] === places[places.length - 1].coordinates[0] &&
            places[0].coordinates[1] === places[places.length - 1].coordinates[1];
        
        if (lastPlaceIsStart) {
            this.returnSegmentIndex = places.length - 2;
        }
        
        for (let i = 0; i < places.length - 1; i++) {
            const isReturnSegment = (i === this.returnSegmentIndex);
            await this.drawSegment(places[i], places[i + 1], i, isReturnSegment);
        }
        
        setTimeout(() => {
            this.fitMapToRoute();
            if (window.MapRouteBuilder) {
                window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
            }
            
            // ВАЖНО: После построения маршрута сохраняем его в БД
            this.saveRouteToDB(routeData);
        }, 500);
        
        console.log('[MapSmartWalk] Route visualization complete');
    }
    
    async saveRouteToDB(routeData) {
        console.log('[MapSmartWalk] 💾 Saving route to database...', routeData);
        
        // Проверяем авторизацию
        const userLoggedIn = document.body.dataset.loggedIn === 'true';
        if (!userLoggedIn) {
            console.log('[MapSmartWalk] ⚠️ User not logged in, skipping save');
            return;
        }
        
        try {
            // Собираем данные для сохранения
            const saveData = {
                start_point: {
                    name: routeData.places[0].name || 'Старт',
                    coords: routeData.places[0].coordinates
                },
                categories: this.extractCategories(routeData.places),
                time_limit_minutes: this.calculateTotalTime(),
                return_to_start: routeData.return_to_start || false,
                mode: this.extractTransportMode(routeData.places),
                places: routeData.places
            };
            
            console.log('[MapSmartWalk] 📤 Sending to API:', saveData);
            
            // Отправляем на сервер
            const response = await fetch('api.php?action=build_smart_walk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveData)
            });
            
            const result = await response.json();
            console.log('[MapSmartWalk] 📥 Server response:', result);
            
            if (result.success) {
                console.log('[MapSmartWalk] ✅ Route saved successfully! ID:', result.route_id);
                // Можно показать уведомление пользователю
                if (window.routeModal) {
                    window.routeModal.showNotification('Маршрут сохранен!', 'success');
                }
            } else {
                console.error('[MapSmartWalk] ❌ Failed to save route:', result.error);
            }
            
        } catch (error) {
            console.error('[MapSmartWalk] ❌ Error saving route:', error);
        }
    }
    
    extractCategories(places) {
        const categories = [];
        places.forEach(place => {
            if (place.category && !categories.includes(place.category)) {
                categories.push(place.category);
            }
        });
        console.log('[MapSmartWalk] Extracted categories:', categories);
        return categories;
    }
    
    calculateTotalTime() {
        const totalSeconds = this.segmentDataArray.reduce((sum, seg) => sum + (seg.duration || 0), 0);
        const totalMinutes = Math.round(totalSeconds / 60);
        console.log('[MapSmartWalk] Total time:', totalMinutes, 'minutes');
        return totalMinutes;
    }
    
    extractTransportMode(places) {
        // Берем самый часто используемый транспорт
        const modes = {};
        places.forEach(place => {
            const mode = place.transport_mode || 'pedestrian';
            modes[mode] = (modes[mode] || 0) + 1;
        });
        
        let maxMode = 'pedestrian';
        let maxCount = 0;
        for (const [mode, count] of Object.entries(modes)) {
            if (count > maxCount) {
                maxMode = mode;
                maxCount = count;
            }
        }
        
        console.log('[MapSmartWalk] Dominant transport mode:', maxMode);
        return maxMode;
    }
    
    async drawSegment(fromPlace, toPlace, segmentIndex, isReturnSegment = false) {
        const mode = toPlace.transport_mode || 'pedestrian';
        const fromCoords = fromPlace.coordinates;
        const toCoords = toPlace.coordinates;
        
        console.log(`[MapSmartWalk] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name} (${mode})${isReturnSegment ? ' [RETURN]' : ''}`);
        
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
                console.warn(`[MapSmartWalk] No active route for segment ${segmentIndex}`);
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
        this.returnSegmentIndex = -1;
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
