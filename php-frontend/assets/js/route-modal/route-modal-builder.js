/**
 * Route Builder - ИСПРАВЛЕННАЯ ВЕРСИЯ
 * Поддержка индивидуальных transport_mode для каждого места
 * Обработка "Закончить в интересном месте"
 * FIX: Начальная точка ВСЕГДА отправляется на бэкенд!
 */

window.RouteModalBuilder = {
    init(modalInstance) {
        this.modal = modalInstance;
        this.bindEvents();
        console.log('[RouteModalBuilder] Initialized with individual transport modes support');
    },

    bindEvents() {
        const buildBtn = document.getElementById('buildRoute');
        if (buildBtn) {
            const newBtn = buildBtn.cloneNode(true);
            buildBtn.parentNode.replaceChild(newBtn, buildBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[RouteModalBuilder] Build button clicked');
                this.handleBuildClick();
            });
        } else {
            console.error('[RouteModalBuilder] Build button not found!');
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] Starting route build...');
        
        // 1. Собираем данные
        const places = this.collectPlaces();
        
        console.log('[RouteModalBuilder] Collected places:', places);
        
        if (places.length < 2) {
            this.modal.showNotification('Добавьте хотя бы 2 места', 'error');
            return;
        }

        // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: начальная точка должна быть с реальными координатами!
        const firstPlace = places[0];
        if (!firstPlace.coordinates || 
            firstPlace.coordinates.length !== 2 || 
            (firstPlace.coordinates[0] === 0 && firstPlace.coordinates[1] === 0)) {
            this.modal.showNotification('❌ Начальная точка не указана! Укажите стартовую точку на карте.', 'error');
            console.error('[RouteModalBuilder] ❌ Start point missing or invalid:', firstPlace);
            return;
        }

        // 2. Показываем загрузку
        this.modal.showLoading(true);

        try {
            // 3. Отправляем запрос
            const routeData = await this.sendRequest(places);

            // 4. Обрабатываем успех
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
            // SMART MODE
            const startCoords = this.getCoordsFromInput('smartStartPoint');
            
            // ✅ 1. Стартовая точка (всегда первая) - КРИТИЧЕСКАЯ!
            if (!startCoords) {
                console.error('[RouteModalBuilder] ❌ CRITICAL: No start coordinates!');
                return [];  // Возвращаем пустой массив - покажется ошибка
            }
            
            places.push({ 
                name: 'Старт', 
                coordinates: startCoords, 
                type: 'must_visit',
                transport_mode: 'pedestrian'  // Старт не имеет входящего транспорта
            });
            console.log('[RouteModalBuilder] ✅ Added start point:', startCoords);
            
            // ✅ 2. Активности с индивидуальными transport_mode
            this.modal.activities.forEach((act, idx) => {
                if (act.type === 'place') {
                    const transport = act.transport_mode || 'pedestrian';
                    
                    if (act.coords && act.coords.length === 2 && (act.coords[0] !== 0 || act.coords[1] !== 0)) {
                        // Конкретное место с координатами
                        places.push({
                            name: act.name || act.specificPlaceAddress,
                            coordinates: act.coords,
                            type: 'must_visit',
                            transport_mode: transport  // ✅ Индивидуальный режим!
                        });
                        console.log(`[RouteModalBuilder] ✅ Added place: ${act.name}, mode=${transport}`);
                        
                    } else if (act.category) {
                        // Категорийное место - бэкенд найдет координаты РЯДОМ со СТАРТОМ!
                        places.push({
                            name: act.category,
                            coordinates: [0, 0],  // Бэкенд найдет координаты
                            type: 'must_visit',
                            category: act.category,
                            transport_mode: transport  // ✅ Индивидуальный режим!
                        });
                        console.log(`[RouteModalBuilder] ✅ Added category: ${act.category}, mode=${transport}`);
                        
                    } else {
                        console.warn(`[RouteModalBuilder] ⚠️ Activity ${idx} skipped - no coords and no category`);
                    }
                } else if (act.type === 'walk') {
                    // Прогулки не добавляем как отдельные точки
                    // Они влияют только на режим передвижения между местами
                    console.log(`[RouteModalBuilder] Walk activity ${idx} (${act.transport_mode}) - merged into route`);
                }
            });
            
            // ✅ 3. Конечная точка
            const routeEndType = document.querySelector('input[name="routeEnd"]:checked')?.value;
            
            if (routeEndType === 'return') {
                // Вернуться к старту
                if (startCoords) {
                    places.push({ 
                        name: 'Возврат к старту', 
                        coordinates: startCoords, 
                        type: 'must_visit',
                        transport_mode: 'pedestrian'
                    });
                    console.log('[RouteModalBuilder] ✅ Added return to start');
                }
                
            } else if (routeEndType === 'custom') {
                // Конкретное место
                const endCoords = this.getCoordsFromInput('smartEndPoint');
                if (endCoords) {
                    places.push({ 
                        name: 'Финиш', 
                        coordinates: endCoords, 
                        type: 'must_visit',
                        transport_mode: 'pedestrian'
                    });
                    console.log('[RouteModalBuilder] ✅ Added custom end point');
                }
                
            } else if (routeEndType === 'smart') {
                // ✅ НОВАЯ ЛОГИКА: Закончить в интересном месте
                // Отправляем специальную категорию - бэкенд найдет интересное место
                const interestingCategories = ['музей', 'парк', 'памятник', 'сквер'];
                const randomCategory = interestingCategories[Math.floor(Math.random() * interestingCategories.length)];
                
                places.push({
                    name: 'Интересное место',
                    coordinates: [0, 0],
                    type: 'must_visit',
                    category: randomCategory,
                    transport_mode: 'pedestrian'
                });
                console.log(`[RouteModalBuilder] ✅ Added smart ending (${randomCategory})`);
            }
            
        } else {
            // SIMPLE MODE
            const startCoords = this.getCoordsFromInput('simpleStartPoint');
            const endCoords = this.getCoordsFromInput('simpleEndPoint');
            
            // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА
            if (!startCoords) {
                console.error('[RouteModalBuilder] ❌ SIMPLE MODE: No start coordinates!');
                return [];
            }
            
            // Определяем глобальный режим для Simple Mode
            let globalMode = 'pedestrian';
            const transportInput = document.querySelector('input[name="simpleTransport"]:checked');
            if (transportInput) {
                globalMode = transportInput.value;
                if (globalMode === 'auto') globalMode = 'driving';
                if (globalMode === 'public_transport') globalMode = 'masstransit';
            }
            
            places.push({ 
                name: 'Начало', 
                coordinates: startCoords, 
                type: 'must_visit',
                transport_mode: globalMode
            });
            console.log('[RouteModalBuilder] ✅ SIMPLE: Added start:', startCoords);
            
            // Промежуточные точки
            const waypoints = document.querySelectorAll('.waypoint-input');
            waypoints.forEach(input => {
                const coords = input.dataset.coords;
                if (coords) {
                    places.push({ 
                        name: input.value, 
                        coordinates: coords.split(',').map(Number),
                        type: 'must_visit',
                        transport_mode: globalMode
                    });
                }
            });

            if (endCoords) {
                places.push({ 
                    name: 'Конец', 
                    coordinates: endCoords,
                    type: 'must_visit',
                    transport_mode: globalMode
                });
                console.log('[RouteModalBuilder] ✅ SIMPLE: Added end:', endCoords);
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

    async sendRequest(places) {
        console.log('[RouteModalBuilder] Sending request to API...');
        
        const API_URL = 'https://intelligent-trails.onrender.com/api/route/build'; 
        // const API_URL = 'http://localhost:8000/api/route/build';  // Для локальной разработки

        const payload = {
            places: places,
            optimize: true  // mode убран - теперь каждое место имеет свой transport_mode
        };

        console.log('[RouteModalBuilder] Request payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            console.error('[RouteModalBuilder] ❌ Server error:', errorData);
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[RouteModalBuilder] ✅ Server response:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        return data;
    },

    handleSuccess(routeData) {
        console.log('[RouteModalBuilder] ✅ Route built successfully!', routeData);
        
        // 1. Закрываем модалку
        this.modal.close();

        // 2. Сохраняем в StateManager
        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }

        // 3. Рисуем на карте через MapSmartWalk (с Yandex routing)
        if (window.MapSmartWalkInstance) {
            window.MapSmartWalkInstance.visualizeRoute(routeData);
        } else if (window.MapCore && window.MapCore.mapSmartWalk) {
            window.MapCore.mapSmartWalk.visualizeRoute(routeData);
        }

        // 4. Ставим маркеры мест
        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(routeData.places);
        }

        // 5. Уведомление об успехе
        const summary = routeData.summary || {};
        const numPlaces = summary.number_of_places || routeData.places?.length || 0;
        const distanceKm = summary.total_distance_km?.toFixed(1) || '?';
        const durationMin = summary.total_duration_minutes || '?';
        
        this.modal.showNotification(
            `✅ Маршрут построен! ${numPlaces} мест, ${distanceKm} км, ${durationMin} мин`,
            'success'
        );
        
        console.log('[RouteModalBuilder] ✅ Visualization complete');
    }
};

// Алиас для совместимости
window.RouteBuilder = window.RouteModalBuilder;

console.log('[RouteModalBuilder] Module loaded');
