// assets/js/route-loader.js
(function() {
    'use strict';
    
    // Проверяем URL параметры для загрузки сохраненного маршрута
    function checkForSavedRoute() {
        const urlParams = new URLSearchParams(window.location.search);
        const routeId = urlParams.get('load_route');
        
        if (routeId) {
            console.log('[ROUTE LOADER] Found route_id in URL:', routeId);
            // Даем время на инициализацию модулей
            setTimeout(() => {
                loadSavedRoute(routeId);
            }, 500);
        }
    }
    
    // Загрузка сохраненного маршрута
    function loadSavedRoute(routeId) {
        console.log('[ROUTE LOADER] Loading route ID:', routeId);
        
        fetch(`api.php?action=load_route&route_id=${routeId}`)
            .then(response => response.json())
            .then(result => {
                if (result.success && result.data) {
                    console.log('[ROUTE LOADER] Route loaded successfully:', result);
                    
                    // Восстанавливаем маршрут на карте в зависимости от типа
                    if (result.route_type === 'simple') {
                        restoreSimpleRoute(result.data);
                    } else if (result.route_type === 'smart') {
                        restoreSmartRoute(result.data);
                    } else if (result.route_type === 'smart_walk') {
                        restoreSmartWalk(result.data);
                    }
                    
                    // Убираем параметр из URL
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                } else {
                    console.error('[ROUTE LOADER] Failed to load route:', result.error);
                    alert('Не удалось загрузить маршрут: ' + (result.error || 'Неизвестная ошибка'));
                }
            })
            .catch(error => {
                console.error('[ROUTE LOADER] Error loading route:', error);
                alert('Ошибка при загрузке маршрута');
            });
    }
    
    // Восстановление простого маршрута
    function restoreSimpleRoute(data) {
        console.log('[ROUTE LOADER] Restoring simple route:', data);
        
        if (window.MapCore && window.MapCore.map) {
            const ymaps = window.ymaps;
            
            ymaps.route([data.start_point, data.end_point], {
                mapStateAutoApply: true,
                routingMode: data.mode || 'auto'
            }).then(route => {
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
            }).catch(error => {
                console.error('[ROUTE LOADER] Error building simple route:', error);
                alert('Ошибка при построении маршрута');
            });
        }
    }
    
    // Восстановление умного маршрута
    function restoreSmartRoute(data) {
        console.log('[ROUTE LOADER] Restoring smart route:', data);
        
        if (window.MapRouteBuilder) {
            window.MapRouteBuilder.displayRoute(data);
        } else {
            console.error('[ROUTE LOADER] MapRouteBuilder not available');
        }
    }
    
    // Восстановление умной прогулки
    function restoreSmartWalk(data) {
        console.log('[ROUTE LOADER] Restoring smart walk:', data);
        
        // ИЗМЕНЕНО: используем специальное событие для загруженных маршрутов
        if (window.EventBus) {
            // Важно: используем событие route:loaded вместо route:updated
            window.EventBus.emit('route:loaded', data);
        } else {
            console.error('[ROUTE LOADER] EventBus not available');
        }
    }
    
    // Экспорт функций
    window.RouteLoader = {
        loadRoute: loadSavedRoute,
        restoreSimpleRoute,
        restoreSmartRoute,
        restoreSmartWalk
    };
    
    // Автоматическая проверка при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkForSavedRoute);
    } else {
        checkForSavedRoute();
    }
})();
