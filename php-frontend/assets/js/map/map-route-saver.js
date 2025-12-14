/**
 * Универсальный модуль для сохранения всех типов маршрутов
 * Работает со Smart Walk, Smart Route и Simple Route
 */
class MapRouteSaver {
    constructor() {
        this.isSaving = false;
        this.savedRoutes = this.loadSavedRoutesCache();
        console.log('[MapRouteSaver] Initialized');
    }
    
    /**
     * Загрузка кэша сохраненных маршрутов из localStorage
     */
    loadSavedRoutesCache() {
        try {
            const cache = localStorage.getItem('recently_saved_routes');
            return cache ? JSON.parse(cache) : [];
        } catch (e) {
            console.error('[MapRouteSaver] Failed to load cache:', e);
            return [];
        }
    }
    
    /**
     * Сохранение кэша в localStorage
     */
    saveSavedRoutesCache() {
        try {
            // Храним только последние 20 сигнатур
            if (this.savedRoutes.length > 20) {
                this.savedRoutes = this.savedRoutes.slice(-20);
            }
            localStorage.setItem('recently_saved_routes', JSON.stringify(this.savedRoutes));
        } catch (e) {
            console.error('[MapRouteSaver] Failed to save cache:', e);
        }
    }
    
    /**
     * Создание уникальной сигнатуры маршрута
     */
    getRouteSignature(routeData) {
        try {
            const places = routeData.places || [];
            const coords = places.map(p => 
                (p.coordinates || p.coords || [0, 0]).join(',')
            ).join('|');
            
            const categories = (routeData.categories || []).sort().join(',');
            const mode = routeData.mode || routeData.transport_mode || 'pedestrian';
            const type = routeData.route_type || 'smart';
            
            return `${type}_${coords}_${categories}_${mode}_${routeData.return_to_start || false}`;
        } catch (e) {
            console.error('[MapRouteSaver] Failed to create signature:', e);
            return `fallback_${Date.now()}`;
        }
    }
    
    /**
     * Проверка, является ли маршрут дубликатом
     */
    isDuplicate(signature) {
        return this.savedRoutes.includes(signature);
    }
    
    /**
     * Добавление сигнатуры в список сохраненных
     */
    addToSaved(signature) {
        this.savedRoutes.push(signature);
        this.saveSavedRoutesCache();
    }
    
    /**
     * Проверка авторизации пользователя
     */
    isUserLoggedIn() {
        const bodyElement = document.querySelector('body');
        return bodyElement && bodyElement.dataset.loggedIn === 'true';
    }
    
    /**
     * Показ уведомления пользователю
     */
    showNotification(message, type = 'info') {
        console.log(`[MapRouteSaver] [${type.toUpperCase()}] ${message}`);
        
        // Попытка использовать модальное окно, если есть
        if (window.routeModal && typeof window.routeModal.showNotification === 'function') {
            window.routeModal.showNotification(message, type);
            return;
        }
        
        // Fallback: простое alert для критических сообщений
        if (type === 'error') {
            alert(message);
        }
    }
    
    /**
     * ГЛАВНЫЙ МЕТОД: Сохранение маршрута в БД
     * @param {Object} routeData - данные маршрута
     * @param {Array} segmentData - данные сегментов (distance, duration)
     * @param {String} routeType - тип маршрута: 'simple', 'smart', 'smart_walk'
     */
    async saveRoute(routeData, segmentData = [], routeType = 'smart') {
        if (this.isSaving) {
            console.log('[MapRouteSaver] ⚠️ Save already in progress, skipping');
            return { success: false, error: 'Already saving' };
        }
        
        this.isSaving = true;
        console.log('[MapRouteSaver] 💾 ========== STARTING SAVE ==========');
        console.log('[MapRouteSaver] Route type:', routeType);
        console.log('[MapRouteSaver] Route data:', routeData);
        console.log('[MapRouteSaver] Segment data:', segmentData);
        
        try {
            // 1. Проверка авторизации
            if (!this.isUserLoggedIn()) {
                console.log('[MapRouteSaver] ⚠️ User not logged in');
                return { success: false, error: 'User not logged in' };
            }
            
            // 2. Подготовка данных для сохранения
            const saveData = this.prepareSaveData(routeData, segmentData, routeType);
            console.log('[MapRouteSaver] 📦 Prepared save data:', saveData);
            
            // 3. Проверка на дубликаты
            const signature = this.getRouteSignature(saveData);
            console.log('[MapRouteSaver] 🔍 Route signature:', signature);
            
            if (this.isDuplicate(signature)) {
                console.log('[MapRouteSaver] ⚠️ Duplicate route detected, skipping save');
                return { success: false, error: 'Duplicate route' };
            }
            
            // 4. Определяем endpoint
            const endpoint = this.getEndpointForType(routeType);
            console.log('[MapRouteSaver] 📤 Sending to:', endpoint);
            
            // 5. Отправка на сервер
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveData)
            });
            
            console.log('[MapRouteSaver] 📥 Response status:', response.status);
            
            const responseText = await response.text();
            console.log('[MapRouteSaver] 📥 Response text:', responseText.substring(0, 500));
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('[MapRouteSaver] ❌ Invalid JSON response:', e);
                throw new Error('Invalid server response: ' + responseText.substring(0, 100));
            }
            
            console.log('[MapRouteSaver] 📥 Parsed result:', result);
            
            // 6. Обработка результата
            if (result.success && result.saved) {
                console.log('[MapRouteSaver] ✅ Route saved successfully! ID:', result.route_id);
                this.addToSaved(signature);
                this.showNotification('✅ Маршрут успешно сохранен!', 'success');
                
                return {
                    success: true,
                    route_id: result.route_id,
                    saved: true
                };
            } else if (result.success && !result.saved) {
                console.log('[MapRouteSaver] ⚠️ Route not saved (auth required)');
                return {
                    success: false,
                    error: 'Authentication required',
                    saved: false
                };
            } else {
                console.error('[MapRouteSaver] ❌ Save failed:', result.error);
                this.showNotification('❌ Ошибка сохранения: ' + (result.error || 'Unknown'), 'error');
                
                return {
                    success: false,
                    error: result.error || 'Unknown error',
                    saved: false
                };
            }
            
        } catch (error) {
            console.error('[MapRouteSaver] ❌ Exception during save:', error);
            console.error('[MapRouteSaver] ❌ Stack:', error.stack);
            this.showNotification('❌ Ошибка сохранения маршрута', 'error');
            
            return {
                success: false,
                error: error.message,
                saved: false
            };
            
        } finally {
            this.isSaving = false;
            console.log('[MapRouteSaver] 💾 ========== SAVE COMPLETE ==========');
        }
    }
    
    /**
     * Подготовка данных для сохранения в зависимости от типа маршрута
     */
    prepareSaveData(routeData, segmentData, routeType) {
        const places = routeData.places || [];
        
        // Обогащаем места данными из сегментов
        const enrichedPlaces = places.map((place, index) => ({
            name: place.name || `Точка ${index + 1}`,
            address: place.address || '',
            coordinates: place.coordinates || place.coords || [0, 0],
            category: place.category || '',
            transport_mode: place.transport_mode || 'pedestrian',
            type: place.type || (index === 0 ? 'start' : index === places.length - 1 ? 'end' : 'waypoint')
        }));
        
        // Вычисляем суммарные значения
        const totalDistance = segmentData.reduce((sum, seg) => sum + (seg.distance || 0), 0);
        const totalDuration = segmentData.reduce((sum, seg) => sum + (seg.duration || 0), 0);
        
        // Извлекаем категории
        const categories = [];
        enrichedPlaces.forEach(place => {
            if (place.category && !categories.includes(place.category)) {
                categories.push(place.category);
            }
        });
        
        // Извлекаем доминирующий режим транспорта
        const modes = {};
        enrichedPlaces.forEach(place => {
            const mode = place.transport_mode || 'pedestrian';
            modes[mode] = (modes[mode] || 0) + 1;
        });
        
        let dominantMode = routeData.mode || routeData.transport_mode || 'pedestrian';
        let maxCount = 0;
        for (const [mode, count] of Object.entries(modes)) {
            if (count > maxCount) {
                dominantMode = mode;
                maxCount = count;
            }
        }
        
        // Базовая структура
        const saveData = {
            route_type: routeType,
            
            // Точки маршрута
            start_point: {
                name: enrichedPlaces[0]?.name || 'Старт',
                address: enrichedPlaces[0]?.address || '',
                coords: enrichedPlaces[0]?.coordinates || [0, 0]
            },
            
            end_point: null,
            
            // Параметры
            categories: categories,
            time_limit_minutes: Math.round(totalDuration / 60) || routeData.time_limit_minutes || 60,
            return_to_start: routeData.return_to_start || false,
            mode: dominantMode,
            
            // Полные данные
            places: enrichedPlaces,
            waypoints: routeData.waypoints || [],
            segments: segmentData.map((seg, idx) => ({
                index: idx,
                fromPlace: seg.fromPlace || enrichedPlaces[idx]?.name,
                toPlace: seg.toPlace || enrichedPlaces[idx + 1]?.name,
                distance: seg.distance || 0,
                duration: seg.duration || 0,
                mode: seg.mode || dominantMode,
                isReturn: seg.isReturn || false
            })),
            
            // Статистика
            summary: {
                total_distance: totalDistance,
                total_distance_km: (totalDistance / 1000).toFixed(2),
                total_duration: totalDuration,
                total_duration_minutes: Math.round(totalDuration / 60),
                number_of_places: enrichedPlaces.length
            },
            
            // Настройки
            settings: routeData.settings || {
                pace: routeData.pace || 'balanced',
                time_strictness: routeData.time_strictness || 5
            },
            
            // Дополнительные поля
            min_places_per_category: routeData.min_places_per_category || {}
        };
        
        // Конечная точка
        if (routeData.return_to_start) {
            saveData.end_point = {
                name: enrichedPlaces[0]?.name || 'Старт',
                address: enrichedPlaces[0]?.address || '',
                coords: enrichedPlaces[0]?.coordinates || [0, 0]
            };
        } else if (enrichedPlaces.length > 1) {
            const lastPlace = enrichedPlaces[enrichedPlaces.length - 1];
            saveData.end_point = {
                name: lastPlace.name,
                address: lastPlace.address,
                coords: lastPlace.coordinates
            };
        }
        
        return saveData;
    }
    
    /**
     * Определение endpoint для типа маршрута
     */
    getEndpointForType(routeType) {
        const endpoints = {
            'simple': 'api.php?action=build_simple_route',
            'smart': 'api.php?action=build_smart_route',
            'smart_walk': 'api.php?action=build_smart_walk'
        };
        
        return endpoints[routeType] || 'api.php?action=build_smart_walk';
    }
}

// Создаем глобальный экземпляр
window.MapRouteSaver = new MapRouteSaver();

console.log('[MapRouteSaver] Module loaded and initialized');
