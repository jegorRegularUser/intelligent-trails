window.MapRouteBuilder = {
    map: null,
    placesData: null,
    activePlaces: {},
    routeSegments: [],
    segmentData: [],
    
    init(mapInstance) {
        this.map = mapInstance;
        console.log('[MapRouteBuilder] Initialized');
    },
    
    async buildRoute(startPoint, placesByCategory, returnToStart, activities = []) {
        console.log('[MapRouteBuilder] Building route...');
        
        this.placesData = placesByCategory;
        this.segmentData = [];
        
        const selectedPlaces = this.selectActivePlaces(placesByCategory);
        
        if (selectedPlaces.length === 0) {
            console.error('[MapRouteBuilder] No places selected');
            return;
        }
        
        const waypoints = this.buildWaypointsList(startPoint, selectedPlaces, returnToStart, activities);
        
        const routeData = {
            places: waypoints,
            start_point: startPoint,
            return_to_start: returnToStart,
            activities: activities
        };
        
        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }
        
        if (window.MapSmartWalkInstance) {
            await window.MapSmartWalkInstance.visualizeRoute(routeData);
        } else if (window.MapCore && window.MapCore.mapSmartWalk) {
            await window.MapCore.mapSmartWalk.visualizeRoute(routeData);
        }
        
        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(waypoints);
        } else if (window.MapCore && window.MapCore.mapPlaceMarkers) {
            window.MapCore.mapPlaceMarkers.setPlaces(waypoints);
        }
        
        await this.showRouteInfoPanel(waypoints);
        
        console.log('[MapRouteBuilder] Route built successfully');
    },
    
    selectActivePlaces(placesByCategory) {
        const selected = [];
        
        if (Object.keys(this.activePlaces).length === 0) {
            for (const category in placesByCategory) {
                this.activePlaces[category] = 0;
            }
        }
        
        for (const [category, places] of Object.entries(placesByCategory)) {
            if (places && places.length > 0) {
                const activeIndex = this.activePlaces[category] || 0;
                const selectedPlace = places[activeIndex];
                
                selected.push({
                    name: selectedPlace.name,
                    coordinates: selectedPlace.coords,
                    address: selectedPlace.address,
                    category: category,
                    distance: selectedPlace.distance,
                    transport_mode: 'pedestrian'
                });
            }
        }
        
        return selected;
    },
    
    buildWaypointsList(startPoint, selectedPlaces, returnToStart, activities = []) {
        const waypoints = [];
        const state = window.StateManager?.getState() || {};
        const defaultTransport = state.transport_mode || 'pedestrian';
        
        waypoints.push({
            name: 'Старт',
            coordinates: startPoint,
            address: '',
            type: 'start',
            transport_mode: defaultTransport
        });
        
        selectedPlaces.forEach((place) => {
            let transportMode = defaultTransport;
            
            if (activities && activities.length > 0) {
                const activityIndex = activities.findIndex(a => 
                    a.type === 'place' && 
                    (a.category === place.category || a.name === place.name)
                );
                
                if (activityIndex !== -1 && activities[activityIndex].transport_mode) {
                    transportMode = activities[activityIndex].transport_mode;
                }
            }
            
            waypoints.push({
                name: place.name,
                coordinates: place.coordinates,
                address: place.address,
                category: place.category,
                type: 'waypoint',
                transport_mode: transportMode
            });
        });
        
        if (returnToStart) {
            waypoints.push({
                name: 'Возврат к старту',
                coordinates: startPoint,
                address: '',
                type: 'end',
                transport_mode: defaultTransport
            });
        }
        
        return waypoints;
    },
    
    async showRouteInfoPanel(waypoints) {
        const panel = document.getElementById('routeInfoPanel');
        if (!panel) {
            console.warn('[MapRouteBuilder] Route info panel not found');
            return;
        }
        
        await this.geocodeAddresses(waypoints);
        
        panel.style.display = 'flex';
        
        setTimeout(() => {
            const segmentData = window.MapSmartWalkInstance?.getSegmentData() || 
                               window.MapCore?.mapSmartWalk?.getSegmentData() || [];
            this.segmentData = segmentData;
            this.updatePanelWithSegmentData(waypoints);
        }, 1500);
    },
    
    updateSegmentData(segmentDataArray) {
        this.segmentData = segmentDataArray;
        const state = window.StateManager?.getState();
        if (state && state.route_data && state.route_data.places) {
            this.updatePanelWithSegmentData(state.route_data.places);
        }
    },
    
    async geocodeAddresses(waypoints) {
        for (let point of waypoints) {
            if (!point.address && point.coordinates) {
                try {
                    const address = await this.reverseGeocode(point.coordinates);
                    point.address = address;
                } catch (e) {
                    console.warn('[MapRouteBuilder] Geocoding failed for', point.name);
                }
            }
        }
    },
    
    async reverseGeocode(coords) {
        return new Promise((resolve) => {
            ymaps.geocode(coords, {
                results: 1
            }).then((res) => {
                const firstGeoObject = res.geoObjects.get(0);
                if (firstGeoObject) {
                    resolve(firstGeoObject.getAddressLine());
                } else {
                    resolve('');
                }
            }).catch(() => {
                resolve('');
            });
        });
    },
    
    updatePanelWithSegmentData(waypoints) {
        const statsDiv = document.getElementById('routeInfoStats');
        const stagesDiv = document.getElementById('routeStagesList');
        
        if (statsDiv) {
            const totalDistance = this.segmentData.reduce((sum, seg) => sum + (seg.distance || 0), 0);
            const totalTime = this.segmentData.reduce((sum, seg) => sum + (seg.duration || 0), 0);
            
            // Проверяем авторизацию
            const isLoggedIn = document.body.dataset.loggedIn === 'true';
            const saveButtonHTML = isLoggedIn ? 
                `<button onclick="window.MapRouteBuilder.saveRoute()" class="save-route-btn" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 14px; margin-top: 10px;">
                    💾 Сохранить маршрут
                </button>` : '';
            
            statsDiv.innerHTML = `
                <div class="route-stat">
                    <span class="stat-icon">📍</span>
                    <span class="stat-value">${waypoints.length}</span>
                    <span class="stat-label">точек</span>
                </div>
                ${totalDistance > 0 ? `
                <div class="route-stat">
                    <span class="stat-icon">📏</span>
                    <span class="stat-value">${(totalDistance / 1000).toFixed(1)}</span>
                    <span class="stat-label">км</span>
                </div>
                ` : ''}
                ${totalTime > 0 ? `
                <div class="route-stat">
                    <span class="stat-icon">⏱️</span>
                    <span class="stat-value">${Math.round(totalTime / 60)}</span>
                    <span class="stat-label">мин</span>
                </div>
                ` : ''}
                <div style="width: 100%; text-align: center;">
                    ${saveButtonHTML}
                </div>
            `;
        }
        
        if (stagesDiv) {
            this.renderStages(stagesDiv, waypoints);
        }
    },
    
    async saveRoute() {
        console.log('[MapRouteBuilder] 💾 Saving route...');
        
        const state = window.StateManager?.getState();
        if (!state || !state.route_data) {
            alert('Нет данных маршрута для сохранения');
            return;
        }
        
        const routeData = state.route_data;
        const categories = [];
        
        routeData.places.forEach(place => {
            if (place.category && !categories.includes(place.category)) {
                categories.push(place.category);
            }
        });
        
        const totalTime = this.segmentData.reduce((sum, seg) => sum + (seg.duration || 0), 0);
        const totalMinutes = Math.round(totalTime / 60);
        
        const saveData = {
            start_point: {
                name: routeData.places[0]?.name || 'Старт',
                coords: routeData.start_point
            },
            categories: categories,
            time_limit_minutes: totalMinutes || 60,
            return_to_start: routeData.return_to_start || false,
            mode: routeData.places[1]?.transport_mode || 'pedestrian',
            places: routeData.places
        };
        
        console.log('[MapRouteBuilder] Sending to API:', saveData);
        
        try {
            const response = await fetch('api.php?action=build_smart_walk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveData)
            });
            
            const result = await response.json();
            console.log('[MapRouteBuilder] Server response:', result);
            
            if (result.success && result.saved) {
                alert('✅ Маршрут успешно сохранен!');
            } else if (result.success && !result.saved) {
                alert('⚠️ Маршрут построен, но не сохранен (требуется авторизация)');
            } else {
                alert('❌ Ошибка сохранения: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('[MapRouteBuilder] Error:', error);
            alert('❌ Ошибка сохранения маршрута');
        }
    },
    
    renderStages(stagesDiv, waypoints) {
        let stagesHTML = '';
        
        waypoints.forEach((point, index) => {
            const icon = point.type === 'start' ? '🏁' : 
                       point.type === 'end' ? '🏁' : '📍';
            
            const categoryInfo = point.category ? 
                `<div class="stage-category">${point.category}</div>` : '';
            
            const alternativesInfo = point.category && this.placesData[point.category] && this.placesData[point.category].length > 1 ?
                `<div class="stage-alternatives">
                    <button class="alt-btn" onclick="window.MapRouteBuilder.switchPlace('${point.category}', 'prev')">←</button>
                    <span>${this.activePlaces[point.category] + 1}/${this.placesData[point.category].length}</span>
                    <button class="alt-btn" onclick="window.MapRouteBuilder.switchPlace('${point.category}', 'next')">→</button>
                </div>` : '';
            
            const segmentInfo = this.segmentData.find(s => s.index === index);
            const distanceInfo = segmentInfo && segmentInfo.distance ? 
                `<div class="stage-distance">📏 ${this.formatDistance(segmentInfo.distance)}</div>` : '';
            const timeInfo = segmentInfo && segmentInfo.duration ? 
                `<div class="stage-time">⏱️ ${this.formatDuration(segmentInfo.duration)}</div>` : '';
            const transportIcon = this.getTransportIcon(point.transport_mode);
            
            stagesHTML += `
                <div class="route-stage" onclick="window.MapRouteBuilder.zoomToStage(${index})">
                    <div class="stage-number">${index + 1}</div>
                    <div class="stage-content">
                        <div class="stage-name">${icon} ${point.name}</div>
                        ${categoryInfo}
                        ${point.address ? `<div class="stage-address">📮 ${point.address}</div>` : ''}
                        ${distanceInfo}
                        ${timeInfo}
                        ${point.transport_mode ? `<div class="stage-transport">${transportIcon} ${this.getTransportName(point.transport_mode)}</div>` : ''}
                        ${alternativesInfo}
                    </div>
                </div>
            `;
        });
        
        stagesDiv.innerHTML = stagesHTML;
    },
    
    getTransportIcon(mode) {
        const icons = {
            'pedestrian': '🚶',
            'auto': '🚗',
            'driving': '🚗',
            'masstransit': '🚌',
            'bicycle': '🚴'
        };
        return icons[mode] || '🚶';
    },
    
    getTransportName(mode) {
        const names = {
            'pedestrian': 'Пешком',
            'auto': 'На машине',
            'driving': 'На машине',
            'masstransit': 'Общ. транспорт',
            'bicycle': 'На велосипеде'
        };
        return names[mode] || 'Пешком';
    },
    
    formatDistance(meters) {
        if (!meters) return '0 м';
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} км`;
        }
        return `${Math.round(meters)} м`;
    },
    
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
    },
    
    zoomToStage(index) {
        const state = window.StateManager?.getState();
        if (!state || !state.route_data || !state.route_data.places) return;
        
        const place = state.route_data.places[index];
        if (!place || !place.coordinates) return;
        
        if (this.map) {
            this.map.setCenter(place.coordinates, 16, {
                duration: 500
            });
        }
        
        document.querySelectorAll('.route-stage').forEach((el, i) => {
            if (i === index) {
                el.style.backgroundColor = '#e3f2fd';
            } else {
                el.style.backgroundColor = '';
            }
        });
    },
    
    async switchPlace(category, direction) {
        const places = this.placesData[category];
        if (!places || places.length <= 1) return;
        
        const currentIndex = this.activePlaces[category] || 0;
        let newIndex;
        
        if (direction === 'next') {
            newIndex = (currentIndex + 1) % places.length;
        } else {
            newIndex = (currentIndex - 1 + places.length) % places.length;
        }
        
        this.activePlaces[category] = newIndex;
        
        const state = window.StateManager.getState();
        const startPoint = state.start_point;
        const returnToStart = state.return_to_start;
        const activities = state.activities;
        
        await this.buildRoute(startPoint, this.placesData, returnToStart, activities);
    }
};

console.log('[MapRouteBuilder] Module loaded');
