window.MapRouteBuilder = {
    map: null,
    placesData: null,
    activePlaces: {},
    routeSegments: [],
    
    init(mapInstance) {
        this.map = mapInstance;
        console.log('[MapRouteBuilder] Initialized');
    },
    
    async buildRoute(startPoint, placesByCategory, returnToStart) {
        console.log('[MapRouteBuilder] Building route...');
        console.log('Start:', startPoint);
        console.log('Places by category:', placesByCategory);
        console.log('Return to start:', returnToStart);
        
        this.placesData = placesByCategory;
        
        const selectedPlaces = this.selectFirstPlaceFromEachCategory(placesByCategory);
        
        if (selectedPlaces.length === 0) {
            console.error('[MapRouteBuilder] No places selected');
            if (window.routeModal) {
                window.routeModal.showNotification('Не удалось выбрать места для маршрута', 'error');
            }
            return;
        }
        
        const waypoints = this.buildWaypointsList(startPoint, selectedPlaces, returnToStart);
        
        console.log('[MapRouteBuilder] Waypoints:', waypoints);
        
        const routeData = {
            places: waypoints,
            start_point: startPoint,
            return_to_start: returnToStart
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
        
        this.showRouteInfoPanel(waypoints);
        
        console.log('[MapRouteBuilder] Route built successfully');
    },
    
    selectFirstPlaceFromEachCategory(placesByCategory) {
        const selected = [];
        this.activePlaces = {};
        
        for (const [category, places] of Object.entries(placesByCategory)) {
            if (places && places.length > 0) {
                const firstPlace = places[0];
                selected.push({
                    name: firstPlace.name,
                    coordinates: firstPlace.coords,
                    address: firstPlace.address,
                    category: category,
                    distance: firstPlace.distance,
                    transport_mode: 'pedestrian'
                });
                
                this.activePlaces[category] = 0;
                
                console.log(`[MapRouteBuilder] Selected from ${category}: ${firstPlace.name}`);
            }
        }
        
        return selected;
    },
    
    buildWaypointsList(startPoint, selectedPlaces, returnToStart) {
        const waypoints = [];
        
        waypoints.push({
            name: 'Старт',
            coordinates: startPoint,
            address: '',
            type: 'start',
            transport_mode: 'pedestrian'
        });
        
        selectedPlaces.forEach((place, index) => {
            waypoints.push({
                name: place.name,
                coordinates: place.coordinates,
                address: place.address,
                category: place.category,
                type: 'waypoint',
                transport_mode: place.transport_mode || 'pedestrian'
            });
        });
        
        if (returnToStart) {
            waypoints.push({
                name: 'Возврат к старту',
                coordinates: startPoint,
                address: '',
                type: 'end',
                transport_mode: 'pedestrian'
            });
        }
        
        return waypoints;
    },
    
    showRouteInfoPanel(waypoints) {
        const panel = document.getElementById('routeInfoPanel');
        if (!panel) {
            console.warn('[MapRouteBuilder] Route info panel not found');
            return;
        }
        
        const statsDiv = document.getElementById('routeInfoStats');
        const stagesDiv = document.getElementById('routeStagesList');
        
        if (statsDiv) {
            statsDiv.innerHTML = `
                <div class="route-stat">
                    <span class="stat-icon">📍</span>
                    <span class="stat-value">${waypoints.length}</span>
                    <span class="stat-label">точек</span>
                </div>
            `;
        }
        
        if (stagesDiv) {
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
                
                stagesHTML += `
                    <div class="route-stage">
                        <div class="stage-number">${index + 1}</div>
                        <div class="stage-content">
                            <div class="stage-name">${icon} ${point.name}</div>
                            ${categoryInfo}
                            ${point.address ? `<div class="stage-address">${point.address}</div>` : ''}
                            ${alternativesInfo}
                        </div>
                    </div>
                `;
            });
            
            stagesDiv.innerHTML = stagesHTML;
        }
        
        panel.style.display = 'block';
    },
    
    async switchPlace(category, direction) {
        console.log(`[MapRouteBuilder] Switching place in category: ${category}, direction: ${direction}`);
        
        const places = this.placesData[category];
        if (!places || places.length <= 1) {
            console.warn('[MapRouteBuilder] No alternatives available');
            return;
        }
        
        const currentIndex = this.activePlaces[category] || 0;
        let newIndex;
        
        if (direction === 'next') {
            newIndex = (currentIndex + 1) % places.length;
        } else {
            newIndex = (currentIndex - 1 + places.length) % places.length;
        }
        
        this.activePlaces[category] = newIndex;
        
        console.log(`[MapRouteBuilder] Switched from index ${currentIndex} to ${newIndex}`);
        
        const state = window.StateManager.getState();
        const startPoint = state.start_point;
        const returnToStart = state.return_to_start;
        
        await this.buildRoute(startPoint, this.placesData, returnToStart);
        
        if (window.routeModal) {
            window.routeModal.showNotification(`Изменено место: ${places[newIndex].name}`, 'success');
        }
    }
};

console.log('[MapRouteBuilder] Module loaded');
