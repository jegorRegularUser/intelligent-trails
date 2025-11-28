/**
 * Route Builder Module
 * Handles route creation logic via API
 */

window.RouteBuilder = {
    init() {
        console.log('[RouteBuilder] Initialized');
        
        // Привязать кнопку "Построить"
        const buildBtn = document.getElementById('buildRouteBtn');
        if (buildBtn) {
            buildBtn.addEventListener('click', () => this.handleBuildClick());
        }
    },

    async handleBuildClick() {
        try {
            // 1. Получить места из UI
            const places = this.getPlacesFromUI();
            
            if (!places || places.length < 2) {
                alert('Выберите минимум 2 места для маршрута');
                return;
            }

            // 2. Получить режим
            const mode = document.getElementById('transportMode')?.value || 'pedestrian';
            
            // 3. Закрыть модальное окно и показать загрузку
            if (window.routeModal) window.routeModal.close();
            
            // 4. Построить маршрут
            await this.buildSmartWalk(places, mode);

        } catch (error) {
            console.error('[RouteBuilder] Error in handleBuildClick:', error);
            alert('Ошибка: ' + error.message);
        }
    },

    getPlacesFromUI() {
        // Логика сбора мест из модального окна
        // Пытаемся получить из глобального стейта или из DOM
        
        // Вариант 1: Если используется StateManager для формы
        const statePlaces = window.StateManager?.get('modalPlaces');
        if (statePlaces && statePlaces.length > 0) {
            return statePlaces;
        }

        // Вариант 2: Сбор из DOM (fallback)
        const placeInputs = document.querySelectorAll('.waypoint-input');
        const places = [];
        
        placeInputs.forEach(input => {
            const name = input.value.trim();
            const coords = input.dataset.coords; // Предполагаем, что координаты сохранены в data-атрибуте
            
            if (name && coords) {
                places.push({
                    name: name,
                    coords: coords.split(',').map(Number)
                });
            }
        });
        
        // Если ничего не нашли, попробуем взять из глобальной переменной (если старый код так делал)
        if (places.length === 0 && window.routeModal && window.routeModal.waypoints) {
             return window.routeModal.waypoints.filter(p => p.coords);
        }

        return places;
    },

    async buildSmartWalk(places, mode = 'pedestrian') {
        try {
            // ЗАЩИТА ОТ UNDEFINED
            if (!places || !Array.isArray(places)) {
                console.error('[RouteBuilder] Invalid places:', places);
                throw new Error('Некорректные данные мест');
            }

            console.log('[RouteBuilder] Building smart walk:', places.length, 'places');
            
            // Преобразовать places в нужный формат для API
            const formattedPlaces = places.map(p => ({
                name: p.name || 'Точка маршрута',
                coordinates: p.coords || p.coordinates, // Поддержка разных форматов
                type: 'must_visit'
            }));
            
            // Вызвать новый API
            const response = await fetch('https://intelligent-trails.onrender.com/api/route/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    places: formattedPlaces,
                    mode: mode,
                    optimize: true
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const routeData = await response.json();
            
            if (!routeData.success) {
                throw new Error(routeData.error || 'Failed to build route');
            }
            
            console.log('[RouteBuilder] ✅ Route built successfully:', routeData);
            
            // Обновить состояние
            if (window.StateManager) {
                window.StateManager.setRouteData(routeData);
            }
            
            // Визуализировать через НОВЫЙ API
            if (window.MapSmartWalkInstance) {
                window.MapSmartWalkInstance.visualizeRoute(routeData);
                console.log('[RouteBuilder] ✅ Route visualized');
            } else {
                console.error('[RouteBuilder] ❌ MapSmartWalkInstance not found! Waiting for init...');
                // Попытка найти через глобальный объект
                if (window.MapCore && window.MapCore.mapSmartWalk) {
                     window.MapCore.mapSmartWalk.visualizeRoute(routeData);
                }
            }
            
            // Установить маркеры
            if (window.MapPlaceMarkersInstance) {
                window.MapPlaceMarkersInstance.setPlaces(routeData.places);
                console.log('[RouteBuilder] ✅ Markers set');
            }
            
            return routeData;
            
        } catch (error) {
            console.error('[RouteBuilder] ❌ Error building smart walk:', error);
            alert('Ошибка построения маршрута: ' + error.message);
            throw error;
        }
    },
    
    // Legacy method for compatibility
    async buildRoute() {
        return this.handleBuildClick();
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.RouteBuilder.init();
});
