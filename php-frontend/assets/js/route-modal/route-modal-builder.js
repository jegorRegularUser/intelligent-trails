/**
 * Route Builder - КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ
 * НАЧАЛЬНАЯ ТОЧКА ВСЕГДА ОТПРАВЛЯЕТСЯ НА БЭКЕНД!
 * Бэк ищет места по категориям РЯДОМ с начальной точкой!
 */

window.RouteModalBuilder = {
    init(modalInstance) {
        this.modal = modalInstance;
        this.bindEvents();
        console.log('[RouteModalBuilder] ✅ Initialized - start point always sent to backend');
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
        } else {
            console.error('[RouteModalBuilder] ❌ Build button not found!');
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] 🚀 Starting route build...');
        
        // 1. Собираем данные
        const data = this.collectData();
        
        if (!data) {
            return; // Ошибка уже показана
        }

        console.log('[RouteModalBuilder] 📦 Collected data:', data);

        // 2. Показываем загрузку
        this.modal.showLoading(true);

        try {
            // 3. Отправляем запрос
            const routeData = await this.sendRequest(data);

            // 4. Обрабатываем успех
            this.handleSuccess(routeData);

        } catch (error) {
            console.error('[RouteModalBuilder] ❌ Error:', error);
            this.modal.showNotification('Ошибка: ' + error.message, 'error');
        } finally {
            this.modal.showLoading(false);
        }
    },

    /**
     * ✅ КРИТИЧЕСКАЯ ФУНКЦИЯ!
     * Собирает данные для отправки на бэкенд
     * ОБЯЗАТЕЛЬНО включает start_point!
     */
    collectData() {
        if (this.modal.currentRouteType === 'smart') {
            return this.collectSmartData();
        } else {
            return this.collectSimpleData();
        }
    },

    collectSmartData() {
        // ✅ 1. НАЧАЛЬНАЯ ТОЧКА - КРИТИЧЕСКАЯ!
        const startCoords = this.getCoordsFromInput('smartStartPoint');
        
        if (!startCoords) {
            this.modal.showNotification('❌ Укажите начальную точку!', 'error');
            console.error('[RouteModalBuilder] ❌ No start point!');
            return null;
        }

        console.log('[RouteModalBuilder] ✅ Start point:', startCoords);

        // ✅ 2. КАТЕГОРИИ ИЗ АКТИВНОСТЕЙ
        const categories = [];
        const places = [];

        this.modal.activities.forEach((act, idx) => {
            if (act.type === 'place') {
                const transport = act.transport_mode || 'pedestrian';
                
                if (act.coords && act.coords.length === 2 && (act.coords[0] !== 0 || act.coords[1] !== 0)) {
                    // Конкретное место с координатами
                    places.push({
                        name: act.name || act.specificPlaceAddress,
                        coordinates: act.coords,
                        type: 'must_visit',
                        transport_mode: transport
                    });
                    console.log(`[RouteModalBuilder] ✅ Added specific place: ${act.name}`);
                    
                } else if (act.category) {
                    // Категория - бэк найдет координаты
                    categories.push({
                        category: act.category,
                        transport_mode: transport
                    });
                    console.log(`[RouteModalBuilder] ✅ Added category: ${act.category}`);
                }
            }
        });

        if (categories.length === 0 && places.length === 0) {
            this.modal.showNotification('❌ Добавьте хотя бы одно место!', 'error');
            return null;
        }

        // ✅ 3. КОНЕЧНАЯ ТОЧКА
        const routeEndType = document.querySelector('input[name="routeEnd"]:checked')?.value;
        let end_point = null;
        let return_to_start = false;
        let smart_ending = false;

        if (routeEndType === 'return') {
            return_to_start = true;
            console.log('[RouteModalBuilder] ✅ Return to start');
            
        } else if (routeEndType === 'custom') {
            const endCoords = this.getCoordsFromInput('smartEndPoint');
            if (endCoords) {
                end_point = endCoords;
                console.log('[RouteModalBuilder] ✅ Custom end point:', endCoords);
            }
            
        } else if (routeEndType === 'smart') {
            smart_ending = true;
            console.log('[RouteModalBuilder] ✅ Smart ending enabled');
        }

        // ✅ 4. ФОРМИРУЕМ PAYLOAD
        return {
            start_point: startCoords,  // ✅ КРИТИЧЕСКОЕ!
            categories: categories,
            places: places,
            end_point: end_point,
            return_to_start: return_to_start,
            smart_ending: smart_ending
        };
    },

    collectSimpleData() {
        const startCoords = this.getCoordsFromInput('simpleStartPoint');
        const endCoords = this.getCoordsFromInput('simpleEndPoint');
        
        if (!startCoords) {
            this.modal.showNotification('❌ Укажите начальную точку!', 'error');
            return null;
        }

        let globalMode = 'pedestrian';
        const transportInput = document.querySelector('input[name="simpleTransport"]:checked');
        if (transportInput) {
            globalMode = transportInput.value;
            if (globalMode === 'auto') globalMode = 'driving';
            if (globalMode === 'public_transport') globalMode = 'masstransit';
        }

        const places = [
            { 
                name: 'Начало', 
                coordinates: startCoords, 
                type: 'must_visit',
                transport_mode: globalMode
            }
        ];

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
        }

        return {
            places: places,
            optimize: true
        };
    },

    getCoordsFromInput(id) {
        const input = document.getElementById(id);
        if (input && input.dataset.coords) {
            const coords = input.dataset.coords.split(',').map(Number);
            return coords;
        }
        return null;
    },

    async sendRequest(data) {
        console.log('[RouteModalBuilder] 🚀 Sending request to API...');
        
        const API_URL = 'https://intelligent-trails.onrender.com/api/route/build'; 
        // const API_URL = 'http://localhost:8000/api/route/build';

        console.log('[RouteModalBuilder] 📦 Request payload:', JSON.stringify(data, null, 2));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            console.error('[RouteModalBuilder] ❌ Server error:', errorData);
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('[RouteModalBuilder] ✅ Server response:', result);
        
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
        
        return result;
    },

    handleSuccess(routeData) {
        console.log('[RouteModalBuilder] ✅ Route built successfully!', routeData);
        
        this.modal.close();

        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }

        if (window.MapSmartWalkInstance) {
            window.MapSmartWalkInstance.visualizeRoute(routeData);
        } else if (window.MapCore && window.MapCore.mapSmartWalk) {
            window.MapCore.mapSmartWalk.visualizeRoute(routeData);
        }

        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(routeData.places);
        }

        const summary = routeData.summary || {};
        const numPlaces = summary.number_of_places || routeData.places?.length || 0;
        const distanceKm = summary.total_distance_km?.toFixed(1) || '?';
        const durationMin = summary.total_duration_minutes || '?';
        
        this.modal.showNotification(
            `✅ Маршрут построен! ${numPlaces} мест, ${distanceKm} км, ${durationMin} мин`,
            'success'
        );
    }
};

window.RouteBuilder = window.RouteModalBuilder;

console.log('[RouteModalBuilder] ✅ Module loaded - start_point always sent!');
