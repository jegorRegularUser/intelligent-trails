// assets/js/route-loader.js
(function() {
    'use strict';
    
    console.log('[ROUTE LOADER] Module initialized');
    
    // Проверяем URL параметры для загрузки сохраненного маршрута
    function checkForSavedRoute() {
        const urlParams = new URLSearchParams(window.location.search);
        const routeId = urlParams.get('load_route');
        
        if (routeId) {
            console.log('[ROUTE LOADER] 📥 Found route_id in URL:', routeId);
            console.log('[ROUTE LOADER] ⏳ Waiting 1500ms for modules to initialize...');
            
            // Даем больше времени на инициализацию модулей
            setTimeout(() => {
                console.log('[ROUTE LOADER] ✓ Timeout complete, loading route...');
                loadSavedRoute(routeId);
            }, 1500);
        } else {
            console.log('[ROUTE LOADER] No route_id in URL, skipping load');
        }
    }
    
    // Загрузка сохраненного маршрута
    function loadSavedRoute(routeId) {
        console.log('[ROUTE LOADER] ========================================');
        console.log('[ROUTE LOADER] 📥 Loading route ID:', routeId);
        console.log('[ROUTE LOADER] Checking module availability:');
        console.log('[ROUTE LOADER] - MapCore:', !!window.MapCore);
        console.log('[ROUTE LOADER] - MapSmartWalk:', !!window.MapSmartWalk);
        console.log('[ROUTE LOADER] - EventBus:', !!window.EventBus);
        console.log('[ROUTE LOADER] - StateManager:', !!window.StateManager);
        
        fetch(`api.php?action=load_route&route_id=${routeId}`)
            .then(response => {
                console.log('[ROUTE LOADER] 📥 Response status:', response.status);
                return response.json();
            })
            .then(result => {
                console.log('[ROUTE LOADER] 📥 API Response:', result);
                
                if (result.success && result.data) {
                    console.log('[ROUTE LOADER] ✅ Route loaded successfully!');
                    console.log('[ROUTE LOADER] Route type:', result.route_type);
                    console.log('[ROUTE LOADER] Route data:', result.data);
                    
                    // Восстанавливаем маршрут на карте в зависимости от типа
                    if (result.route_type === 'simple') {
                        console.log('[ROUTE LOADER] 🗺️ Restoring SIMPLE route');
                        restoreSimpleRoute(result.data);
                    } else if (result.route_type === 'smart') {
                        console.log('[ROUTE LOADER] 🎯 Restoring SMART route');
                        restoreSmartRoute(result.data);
                    } else if (result.route_type === 'smart_walk') {
                        console.log('[ROUTE LOADER] 🚶 Restoring SMART WALK route');
                        restoreSmartWalk(result.data);
                    } else {
                        console.error('[ROUTE LOADER] ❌ Unknown route type:', result.route_type);
                    }
                    
                    // Убираем параметр из URL
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                    console.log('[ROUTE LOADER] ✓ URL cleaned');
                } else {
                    console.error('[ROUTE LOADER] ❌ Failed to load route:', result.error);
                    alert('Не удалось загрузить маршрут: ' + (result.error || 'Неизвестная ошибка'));
                }
                
                console.log('[ROUTE LOADER] ========================================');
            })
            .catch(error => {
                console.error('[ROUTE LOADER] ❌ Error loading route:', error);
                console.error('[ROUTE LOADER] ❌ Error stack:', error.stack);
                alert('Ошибка при загрузке маршрута');
                console.log('[ROUTE LOADER] ========================================');
            });
    }
    
    // Восстановление простого маршрута
    function restoreSimpleRoute(data) {
        console.log('[ROUTE LOADER] 🗺️ Restoring simple route:', data);
        
        if (!window.MapCore || !window.MapCore.map) {
            console.error('[ROUTE LOADER] ❌ MapCore not ready!');
            alert('Карта еще не готова');
            return;
        }
        
        if (!window.ymaps) {
            console.error('[ROUTE LOADER] ❌ Yandex Maps API not loaded!');
            alert('Яндекс Карты еще не загружены');
            return;
        }
        
        const ymaps = window.ymaps;
        
        ymaps.route([data.start_point, data.end_point], {
            mapStateAutoApply: true,
            routingMode: data.mode || 'auto'
        }).then(route => {
            console.log('[ROUTE LOADER] ✓ Simple route built successfully');
            window.MapCore.map.geoObjects.add(route);
            
            if (window.RouteInfoPanel) {
                const routeData = route.getWayPoints();
                window.RouteInfoPanel.show({
                    type: 'simple',
                    distance: route.getLength(),
                    time: route.getTime(),
                    start: data.start_point,
                    end: data.end_point
                });
            }
            
            showNotification('✅ Маршрут загружен!');
        }).catch(error => {
            console.error('[ROUTE LOADER] ❌ Error building simple route:', error);
            alert('Ошибка при построении маршрута');
        });
    }
    
    // Восстановление умного маршрута
    function restoreSmartRoute(data) {
        console.log('[ROUTE LOADER] 🎯 Restoring smart route:', data);
        
        if (!window.MapRouteBuilder) {
            console.error('[ROUTE LOADER] ❌ MapRouteBuilder not available');
            alert('MapRouteBuilder не загружен');
            return;
        }
        
        console.log('[ROUTE LOADER] 📤 Calling MapRouteBuilder.displayRoute()');
        window.MapRouteBuilder.displayRoute(data);
        showNotification('✅ Маршрут загружен!');
    }
    
    // Восстановление умной прогулки
    function restoreSmartWalk(data) {
        console.log('[ROUTE LOADER] 🚶 Restoring smart walk:', data);
        console.log('[ROUTE LOADER] Data structure check:');
        console.log('[ROUTE LOADER] - Has places:', !!data.places);
        console.log('[ROUTE LOADER] - Places count:', data.places?.length);
        console.log('[ROUTE LOADER] - Has segments:', !!data.segments);
        console.log('[ROUTE LOADER] - Has summary:', !!data.summary);
        
        if (!window.EventBus) {
            console.error('[ROUTE LOADER] ❌ EventBus not available!');
            alert('EventBus не загружен');
            return;
        }
        
        console.log('[ROUTE LOADER] ✓ EventBus is available');
        
        // Обновляем StateManager если доступен
        if (window.StateManager) {
            console.log('[ROUTE LOADER] 📤 Updating StateManager with loaded route data');
            window.StateManager.setRouteData(data);
        }
        
        // Используем событие route:loaded вместо route:updated
        console.log('[ROUTE LOADER] 📤 Emitting route:loaded event');
        window.EventBus.emit('route:loaded', data);
        
        console.log('[ROUTE LOADER] ✓ Event emitted successfully');
        
        // Показываем уведомление
        setTimeout(() => {
            showNotification('✅ Маршрут загружен из истории!');
        }, 1000);
    }
    
    // Показ уведомления
    function showNotification(message, type = 'success') {
        console.log(`[ROUTE LOADER] 🔔 Notification: ${message}`);
        
        // Если есть routeModal, используем его
        if (window.routeModal && typeof window.routeModal.showNotification === 'function') {
            window.routeModal.showNotification(message, type);
            return;
        }
        
        // Иначе создаем простое уведомление
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Экспорт функций
    window.RouteLoader = {
        loadRoute: loadSavedRoute,
        restoreSimpleRoute,
        restoreSmartRoute,
        restoreSmartWalk
    };
    
    console.log('[ROUTE LOADER] ✓ Functions exported to window.RouteLoader');
    
    // Автоматическая проверка при загрузке страницы
    if (document.readyState === 'loading') {
        console.log('[ROUTE LOADER] Document still loading, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', checkForSavedRoute);
    } else {
        console.log('[ROUTE LOADER] Document already loaded, checking immediately');
        checkForSavedRoute();
    }
})();
