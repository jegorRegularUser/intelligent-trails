/**
 * Route Builder - ИСПРАВЛЕННАЯ ВЕРСИЯ
 * Правильная отправка категорий и координат
 */

window.RouteModalBuilder = {
    init(modalInstance) {
        this.modal = modalInstance;
        this.bindEvents();
        console.log('[RouteModalBuilder] Initialized');
    },

    bindEvents() {
        const buildBtn = document.getElementById('buildRoute');
        if (buildBtn) {
            const newBtn = buildBtn.cloneNode(true);
            buildBtn.parentNode.replaceChild(newBtn, buildBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleBuildClick();
            });
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] Building route...');
        
        const places = this.collectPlaces();
        
        console.log('[RouteModalBuilder] Collected places:', places);
        
        if (places.length < 2) {
            this.modal.showNotification('Добавьте хотя бы 2 места', 'error');
            return;
        }

        this.modal.showLoading(true);

        try {
            let mode = 'pedestrian';
            
            if (this.modal.currentRouteType === 'smart') {
                mode = 'pedestrian';
            } else {
                const transportInput = document.querySelector('input[name="simpleTransport"]:checked');
                if (transportInput) {
                    mode = transportInput.value;
                    if (mode === 'auto') mode = 'driving';
                    if (mode === 'public_transport') mode = 'masstransit';
                }
            }

            console.log('[RouteModalBuilder] Mode:', mode);

            const routeData = await this.sendRequest(places, mode);
            this.handleSuccess(routeData);

        } catch (error) {
            console.error('[RouteModalBuilder] Error:', error);
            this.modal.showNotification('Ошибка: ' + error.message, 'error');
        } finally {
            this.modal.showLoading(false);
        }
    },

    collectPlaces() {
        let places = [];

        if (this.modal.currentRouteType === 'smart') {
            const startCoords = this.getCoordsFromInput('smartStartPoint');
            
            // ✅ Стартовая точка
            if (startCoords) {
                places.push({ 
                    name: 'Старт', 
                    coordinates: startCoords, 
                    type: 'must_visit'
                });
            }
            
            // ✅ Активности
            this.modal.activities.forEach((act, idx) => {
                if (act.type === 'place') {
                    if (act.coords && act.coords.length === 2 && act.coords[0] !== 0 && act.coords[1] !== 0) {
                        // Конкретное место с РЕАЛЬНЫМИ координатами
                        places.push({
                            name: act.name || act.specificPlaceAddress,
                            coordinates: act.coords,
                            type: 'must_visit'
                        });
                        console.log(`[RouteModalBuilder] ✅ Added place with coords: ${act.name}`);
                    } else if (act.category) {
                        // 🔥 КАТЕГОРИЙНОЕ МЕСТО - НЕ ОТПРАВЛЯЕМ [0,0]!
                        places.push({
                            name: act.category,
                            coordinates: [0, 0],  // Временные координаты для бэкенда
                            type: 'must_visit',
                            category: act.category  // ✅ ГЛАВНОЕ ПОЛЕ
                        });
                        console.log(`[RouteModalBuilder] ✅ Added category: ${act.category}`);
                    } else {
                        console.warn(`[RouteModalBuilder] ⚠️ Activity ${idx} skipped - no coords and no category`);
                    }
                }
            });
            
            // Конец маршрута
            const returnToStart = document.querySelector('input[name="routeEnd"]:checked')?.value === 'return';
            if (returnToStart && startCoords) {
                places.push({ 
                    name: 'Возврат', 
                    coordinates: startCoords, 
                    type: 'must_visit'
                });
            } else {
                const endCoords = this.getCoordsFromInput('smartEndPoint');
                if (endCoords) {
                    places.push({ 
                        name: 'Конец', 
                        coordinates: endCoords, 
                        type: 'must_visit'
                    });
                }
            }
        } else {
            // Simple Mode
            const startCoords = this.getCoordsFromInput('simpleStartPoint');
            const endCoords = this.getCoordsFromInput('simpleEndPoint');
            
            if (startCoords) {
                places.push({ 
                    name: 'Начало', 
                    coordinates: startCoords, 
                    type: 'must_visit'
                });
            }
            
            const waypoints = document.querySelectorAll('.waypoint-input');
            waypoints.forEach(input => {
                const coords = input.dataset.coords;
                if (coords) {
                    places.push({ 
                        name: input.value, 
                        coordinates: coords.split(',').map(Number),
                        type: 'must_visit'
                    });
                }
            });

            if (endCoords) {
                places.push({ 
                    name: 'Конец', 
                    coordinates: endCoords,
                    type: 'must_visit'
                });
            }
        }

        return places;
    },

    getCoordsFromInput(id) {
        const input = document.getElementById(id);
        if (input && input.dataset.coords) {
            const coords = input.dataset.coords.split(',').map(Number);
            console.log(`[RouteModalBuilder] Got coords from ${id}:`, coords);
            return coords;
        }
        console.warn(`[RouteModalBuilder] ⚠️ No coords in input ${id}`);
        return null;
    },

    async sendRequest(places, mode) {
        console.log('[RouteModalBuilder] Sending to API:', { places, mode });
        
        const API_URL = 'https://intelligent-trails.onrender.com/api/route/build'; 
        // const API_URL = 'http://localhost:8000/api/route/build';

        const payload = {
            places: places,
            mode: mode,
            optimize: true
        };

        console.log('[RouteModalBuilder] Request:', JSON.stringify(payload, null, 2));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            console.error('[RouteModalBuilder] Server error:', errorData);
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[RouteModalBuilder] ✅ Response:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        return data;
    },

    handleSuccess(routeData) {
        console.log('[RouteModalBuilder] ✅ Success!', routeData);
        
        this.modal.close();

        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }

        // Рисуем маршрут
        if (window.MapSmartWalkInstance) {
            window.MapSmartWalkInstance.visualizeRoute(routeData);
        } else if (window.MapCore && window.MapCore.mapSmartWalk) {
            window.MapCore.mapSmartWalk.visualizeRoute(routeData);
        }

        // Ставим маркеры
        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(routeData.places);
        }

        this.modal.showNotification(
            `✅ Маршрут: ${routeData.places?.length || 0} мест, ${routeData.summary?.total_distance_km?.toFixed(1) || '?'} км`,
            'success'
        );
    }
};

window.RouteBuilder = window.RouteModalBuilder;
