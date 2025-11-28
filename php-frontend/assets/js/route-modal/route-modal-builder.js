/**
 * Route Builder - UNIFIED VERSION
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
            console.error('[RouteModalBuilder] Button #buildRouteBtn not found!');
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] Handling click...');
        
        // 1. Собираем данные (места)
        const places = this.collectPlaces();
        
        if (places.length < 2) {
            this.modal.showNotification('Добавьте хотя бы 2 места (или место + прогулку)', 'error');
            return;
        }

        // 2. Показываем загрузку
        this.modal.showLoading(true);

        try {
            // 3. Определяем режим (из активной вкладки или инпута)
            let mode = 'pedestrian';
            const transportInput = document.querySelector('input[name="simpleTransport"]:checked');
            if (transportInput) {
                mode = transportInput.value;
                // Маппинг для нашего API
                if (mode === 'auto') mode = 'driving';
                if (mode === 'public_transport') mode = 'masstransit';
            }

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
        // Добавляем старт
        const startCoords = this.getCoordsFromInput('smartStartPoint');
        if (startCoords) {
            places.push({ 
                name: 'Старт', 
                coordinates: startCoords, 
                type: 'start' 
            });
        }
        
        // Добавляем активности
        this.modal.activities.forEach(act => {
            if (act.type === 'place') {
                if (act.coords) {
                    // Конкретное место с координатами
                    places.push({
                        name: act.name || act.specificPlaceAddress,
                        coordinates: act.coords,
                        type: 'must_visit'
                    });
                } else if (act.category) {
                    // Категорийное место - отправляем категорию, бэкенд сам найдет
                    places.push({
                        name: act.category,
                        coordinates: startCoords || [0, 0], // Временные координаты
                        type: 'category',
                        category: act.category
                    });
                }
            }
        });
        
        // Добавляем конец, если нужно
        const returnToStart = document.querySelector('input[name="routeEnd"]:checked')?.value === 'return';
        if (returnToStart && startCoords) {
            places.push({ 
                name: 'Возврат к старту', 
                coordinates: startCoords, 
                type: 'end' 
            });
        } else {
            const endCoords = this.getCoordsFromInput('smartEndPoint');
            if (endCoords) {
                places.push({ 
                    name: 'Конец', 
                    coordinates: endCoords, 
                    type: 'end' 
                });
            }
        }
    } else {
        // Simple Mode - оставляем как есть
        const startCoords = this.getCoordsFromInput('simpleStartPoint');
        const endCoords = this.getCoordsFromInput('simpleEndPoint');
        
        if (startCoords) places.push({ name: 'Начало', coordinates: startCoords });
        
        const waypoints = document.querySelectorAll('.waypoint-input');
        waypoints.forEach(input => {
            const coords = input.dataset.coords;
            if (coords) {
                places.push({ name: input.value, coordinates: coords.split(',').map(Number) });
            }
        });

        if (endCoords) places.push({ name: 'Конец', coordinates: endCoords });
    }

    return places;
},

    getCoordsFromInput(id) {
        const input = document.getElementById(id);
        if (input && input.dataset.coords) {
            return input.dataset.coords.split(',').map(Number);
        }
        return null;
    },

    async sendRequest(places, mode) {
        console.log('[RouteModalBuilder] Sending request...', { places, mode });
        
        // Используем правильный URL бекенда (Render или Localhost)
        const API_URL = 'https://intelligent-trails.onrender.com/api/route/build'; 
        // const API_URL = 'http://localhost:8000/api/route/build'; // Для локальных тестов

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                places: places,
                mode: mode,
                optimize: true
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
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
    }
};

// Для совместимости с новым кодом
window.RouteBuilder = window.RouteModalBuilder;
