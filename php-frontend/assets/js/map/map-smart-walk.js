class MapSmartWalk {
    constructor(map) {
        this.map = map;
        this.multiRoutes = [];
        this.currentRouteData = null;
        this.segmentDataArray = [];
        this.returnSegmentIndex = -1;
        this.isLoadedRoute = false;
        this.isSaving = false;
        
        if (!this.map) {
            console.error('[MapSmartWalk] Map instance required');
            return;
        }
        
        this.init();
        console.log('[MapSmartWalk] Initialized');
    }
    
    init() {
        window.EventBus?.on('route:updated', (routeData) => {
            console.log('[MapSmartWalk] Route updated event received (NEW route)');
            this.visualizeRoute(routeData, false);
        });
        
        window.EventBus?.on('route:loaded', (routeData) => {
            console.log('[MapSmartWalk] Route loaded event received (LOADED route)');
            this.visualizeRoute(routeData, true);
        });
    }
    
    async visualizeRoute(routeData, isLoadedRoute = false) {
        console.log('[MapSmartWalk] =========================================');
        console.log('[MapSmartWalk] Visualizing route...');
        console.log('[MapSmartWalk] Is loaded route:', isLoadedRoute);
        console.log('[MapSmartWalk] Route data:', routeData);
        
        this.clearRouteLines();
        this.segmentDataArray = [];
        this.returnSegmentIndex = -1;
        this.isLoadedRoute = isLoadedRoute;
        this.currentRouteData = routeData;
        
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
        
        console.log('[MapSmartWalk] ⏳ Waiting 500ms before post-route tasks...');
        
        setTimeout(() => {
            console.log('[MapSmartWalk] ✓ Timeout complete, executing post-route tasks');
            
            this.fitMapToRoute();
            
            if (window.MapRouteBuilder) {
                window.MapRouteBuilder.updateSegmentData(this.segmentDataArray);
            }
            
            if (!this.isLoadedRoute) {
                console.log('[MapSmartWalk] 📞 This is a NEW route, calling saveRouteToDB...');
                this.saveRouteToDB(routeData);
            } else {
                console.log('[MapSmartWalk] ⏭️ This is a LOADED route, skipping save');
            }
        }, 500);
        
        console.log('[MapSmartWalk] Route visualization complete');
        console.log('[MapSmartWalk] =========================================');
    }
    
    async saveRouteToDB(routeData) {
        if (this.isSaving) {
            console.log('[MapSmartWalk] ⚠️ Already saving, skipping duplicate call');
            return;
        }
        
        this.isSaving = true;
        console.log('[MapSmartWalk] 💾 ==== STARTING SAVE PROCESS ====');
        
        try {
            const bodyElement = document.querySelector('body');
            const isLoggedIn = bodyElement && bodyElement.dataset.loggedIn === 'true';
            
            console.log('[MapSmartWalk] User logged in:', isLoggedIn);
            
            if (!isLoggedIn) {
                console.log('[MapSmartWalk] ⚠️ User not logged in, skipping save');
                return;
            }
            
            console.log('[MapSmartWalk] ✓ User is logged in, proceeding with save');
            
            const places = routeData.places.map(place => ({
                name: place.name || 'Точка',
                address: place.address || '',
                coordinates: place.coordinates || [0, 0],
                category: place.category || '',
                transport_mode: place.transport_mode || 'pedestrian',
                description: place.description || ''
            }));
            
            const segments = this.segmentDataArray.map(seg => ({
                index: seg.index,
                fromPlace: seg.fromPlace,
                toPlace: seg.toPlace,
                distance: seg.distance,
                duration: seg.duration,
                mode: seg.mode,
                isReturn: seg.isReturn || false
            }));
            
            const totalDistance = this.segmentDataArray.reduce((sum, seg) => sum + (seg.distance || 0), 0);
            const totalDuration = this.segmentDataArray.reduce((sum, seg) => sum + (seg.duration || 0), 0);
            
            const saveData = {
                start_point: {
                    name: places[0].name,
                    address: places[0].address,
                    coords: places[0].coordinates
                },
                end_point: routeData.return_to_start ? {
                    name: places[0].name,
                    address: places[0].address,
                    coords: places[0].coordinates
                } : (places.length > 1 ? {
                    name: places[places.length - 1].name,
                    address: places[places.length - 1].address,
                    coords: places[places.length - 1].coordinates
                } : null),
                
                categories: this.extractCategories(places),
                time_limit_minutes: Math.round(totalDuration / 60),
                return_to_start: routeData.return_to_start || false,
                mode: routeData.mode || this.extractTransportMode(places),
                
                places: places,
                segments: segments,
                
                // КРИТИЧНО: Добавляем в корневой объект для api.php
                total_distance: totalDistance,
                total_time: totalDuration,
                
                summary: {
                    total_distance: totalDistance,
                    total_distance_km: (totalDistance / 1000).toFixed(2),
                    total_duration: totalDuration,
                    total_duration_minutes: Math.round(totalDuration / 60),
                    number_of_places: places.length
                },
                
                settings: routeData.settings || {
                    pace: 'balanced',
                    time_strictness: 5
                }
            };
            
            console.log('[MapSmartWalk] 📦 Prepared save data:', saveData);
            
            const savedRoutes = JSON.parse(localStorage.getItem('recently_saved_routes') || '[]');
            const routeSignature = this.getRouteSignature(saveData);
            
            console.log('[MapSmartWalk] 🔍 Route signature:', routeSignature);
            
            const isDuplicate = savedRoutes.some(sig => sig === routeSignature);
            if (isDuplicate) {
                console.log('[MapSmartWalk] ⚠️ Route already saved recently, skipping duplicate');
                return;
            }
            
            console.log('[MapSmartWalk] ✓ No duplicate found, proceeding to API call');
            
            console.log('[MapSmartWalk] 📤 Sending POST request to api.php?action=build_smart_walk');
            const response = await fetch('api.php?action=build_smart_walk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveData)
            });
            
            console.log('[MapSmartWalk] 📥 Response status:', response.status);
            
            const responseText = await response.text();
            console.log('[MapSmartWalk] 📥 Response text:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('[MapSmartWalk] ❌ Failed to parse JSON:', e);
                throw new Error('Invalid JSON response: ' + responseText.substring(0, 100));
            }
            
            console.log('[MapSmartWalk] 📥 Parsed result:', result);
            
            if (result.success) {
                console.log('[MapSmartWalk] ✅ Route saved successfully!');
                console.log('[MapSmartWalk] ✅ Route ID:', result.route_id);
                console.log('[MapSmartWalk] ✅ Saved flag:', result.saved);
                
                savedRoutes.push(routeSignature);
                if (savedRoutes.length > 10) {
                    savedRoutes.shift();
                }
                localStorage.setItem('recently_saved_routes', JSON.stringify(savedRoutes));
                console.log('[MapSmartWalk] ✓ Signature saved to localStorage');
                
                this.showNotification('✅ Маршрут успешно сохранен!', 'success');
            } else {
                console.error('[MapSmartWalk] ❌ Failed to save route:', result.error);
                this.showNotification('❌ Ошибка сохранения маршрута', 'error');
            }
            
        } catch (error) {
            console.error('[MapSmartWalk] ❌ Error saving route:', error);
            console.error('[MapSmartWalk] ❌ Error stack:', error.stack);
            this.showNotification('❌ Ошибка сохранения маршрута', 'error');
        } finally {
            this.isSaving = false;
            console.log('[MapSmartWalk] 💾 ==== SAVE PROCESS COMPLETE ====');
        }
    }
    
    getRouteSignature(routeData) {
        const coords = routeData.places.map(p => p.coordinates.join(',')).join('|');
        const categories = (routeData.categories || []).sort().join(',');
        const mode = routeData.mode || 'pedestrian';
        return `${coords}_${categories}_${mode}_${routeData.return_to_start}`;
    }
    
    showNotification(message, type = 'info') {
        if (window.routeModal && typeof window.routeModal.showNotification === 'function') {
            window.routeModal.showNotification(message, type);
            return;
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
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
    
    extractTransportMode(places) {
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
        this.isLoadedRoute = false;
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
