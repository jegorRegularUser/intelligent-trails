/**
 * Route Builder - FIXED VERSION with proper category handling
 * Handles the "Build Route" button click and API calls
 */

window.RouteModalBuilder = {
    init(modalInstance) {
        this.modal = modalInstance;
        this.bindEvents();
        console.log('[RouteModalBuilder] Initialized and bound to button');
    },

    bindEvents() {
        const buildBtn = document.getElementById('buildRoute');
        if (buildBtn) {
            // Удаляем старые слушатели (клонированием), чтобы избежать дублирования
            const newBtn = buildBtn.cloneNode(true);
            buildBtn.parentNode.replaceChild(newBtn, buildBtn);
            
            // Вешаем новый слушатель
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[RouteModalBuilder] Button clicked!');
                this.handleBuildClick();
            });
        } else {
            console.error('[RouteModalBuilder] Button #buildRoute not found!');
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] Handling click...');
        
        // 1. Собираем данные (места)
        const places = this.collectPlaces();
        
        console.log('[RouteModalBuilder] Collected places:', places);
        
        if (places.length < 2) {
            this.modal.showNotification('Добавьте хотя бы 2 места (или место + прогулку)', 'error');
            return;
        }

        // 2. Показываем загрузку
        this.modal.showLoading(true);

        try {
            // 3. Определяем режим (из активной вкладки или инпута)
            let mode = 'pedestrian';
            
            if (this.modal.currentRouteType === 'smart') {
                // В Smart режиме пока всегда пешком
                mode = 'pedestrian';
            } else {
                // В Simple режиме берем из radio buttons
                const transportInput = document.querySelector('input[name="simpleTransport"]:checked');
                if (transportInput) {
                    mode = transportInput.value;
                    // Маппинг для нашего API
                    if (mode === 'auto') mode = 'driving';
                    if (mode === 'public_transport') mode = 'masstransit';
                }
            }

            console.log('[RouteModalBuilder] Using mode:', mode);

            // 4. Отправляем запрос на сервер
            const routeData = await this.sendRequest(places, mode);

            // 5. Обрабатываем успех
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
            // Добавляем старт с правильным типом
            const startCoords = this.getCoordsFromInput('smartStartPoint');
            if (startCoords) {
                places.push({ 
                    name: 'Старт', 
                    coordinates: startCoords, 
                    type: 'must_visit'
                });
            }
            
            // Добавляем активности
            this.modal.activities.forEach((act, idx) => {
                if (act.type === 'place') {
                    if (act.coords) {
                        // Конкретное место с координатами
                        places.push({
                            name: act.name || act.specificPlaceAddress,
                            coordinates: act.coords,
                            type: 'must_visit'
                        });
                        console.log(`[RouteModalBuilder] Added specific place: ${act.name}`);
                    } else if (act.category) {
                        // Категорийное место - отправляем категорию и временные координаты
                        // Бэкенд сам найдет место этой категории
                        places.push({
                            name: act.category,
                            coordinates: startCoords || [0, 0], // Временные координаты для поиска
                            type: 'must_visit',
                            category: act.category  // ✅ КЛЮЧЕВОЕ ПОЛЕ для бэкенда
                        });
                        console.log(`[RouteModalBuilder] Added category place: ${act.category}`);
                    } else {
                        console.warn(`[RouteModalBuilder] Activity ${idx} has no coords and no category:`, act);
                    }
                }
            });
            
            // Добавляем конец, если нужно
            const returnToStart = document.querySelector('input[name="routeEnd"]:checked')?.value === 'return';
            if (returnToStart && startCoords) {
                places.push({ 
                    name: 'Возврат к старту', 
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
            
            // Промежуточные точки
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
        console.warn(`[RouteModalBuilder] No coords in input ${id}`);
        return null;
    },

    async sendRequest(places, mode) {
        console.log('[RouteModalBuilder] Sending request...', { places, mode });
        
        // Используем правильный URL бекенда (Render или Localhost)
        const API_URL = 'https://intelligent-trails.onrender.com/api/route/build'; 
        // const API_URL = 'http://localhost:8000/api/route/build'; // Для локальных тестов

        const payload = {
            places: places,
            mode: mode,
            optimize: true
        };

        console.log('[RouteModalBuilder] Request payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[RouteModalBuilder] Server error response:', errorText);
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[RouteModalBuilder] Server response:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        return data;
    },

    handleSuccess(routeData) {
        console.log('[RouteModalBuilder] Success!', routeData);
        
        // 1. Закрываем модалку
        this.modal.close();

        // 2. Сохраняем в StateManager (новая архитектура)
        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }

        // 3. Рисуем на карте (через SmartWalk или напрямую)
        if (window.MapSmartWalkInstance) {
            window.MapSmartWalkInstance.visualizeRoute(routeData);
        } else if (window.MapCore && window.MapCore.mapSmartWalk) {
            window.MapCore.mapSmartWalk.visualizeRoute(routeData);
        }

        // 4. Ставим маркеры
        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(routeData.places);
        }

        // 5. Уведомление об успехе
        this.modal.showNotification(
            `✅ Маршрут построен! ${routeData.places?.length || 0} мест, ${routeData.summary?.total_distance_km?.toFixed(1) || '?'} км`,
            'success'
        );
    }
};

// Для совместимости с новым кодом
window.RouteBuilder = window.RouteModalBuilder;
