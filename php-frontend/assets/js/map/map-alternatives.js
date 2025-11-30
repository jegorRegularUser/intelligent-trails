/**
 * Map Alternatives - Обработка альтернативных мест
 * Позволяет пользователю выбирать из 5 альтернативных мест для каждой категории
 * и заменять места в маршруте
 */

class MapAlternatives {
    constructor() {
        this.alternativePlaces = {};  // { "кафе": [...5 мест], "парк": [...5 мест] }
        this.currentRoute = null;
        this.selectedAlternatives = {};  // { categoryIndex: placeIndex }
        
        this.init();
        console.log('[MapAlternatives] ✅ Initialized');
    }
    
    init() {
        // Подписываемся на обновления маршрута
        window.EventBus?.on('route:updated', (routeData) => {
            this.handleRouteUpdate(routeData);
        });
        
        // Подписываемся на выбор места для замены
        window.EventBus?.on('alternative:select', (data) => {
            this.replacePlace(data.categoryIndex, data.alternativeIndex);
        });
    }
    
    /**
     * Обработка обновления маршрута
     */
    handleRouteUpdate(routeData) {
        console.log('[MapAlternatives] Route updated, checking for alternatives...');
        
        this.currentRoute = routeData;
        
        // Проверяем наличие альтернативных мест
        if (routeData.alternative_places) {
            this.alternativePlaces = routeData.alternative_places;
            console.log('[MapAlternatives] ✅ Alternative places loaded:', this.alternativePlaces);
            
            // Показываем UI для выбора альтернатив
            this.renderAlternativesUI();
        } else {
            console.log('[MapAlternatives] No alternative places in response');
            this.clearAlternativesUI();
        }
    }
    
    /**
     * Отрисовка UI со слайдерами альтернативных мест
     */
    renderAlternativesUI() {
        // Создаем или находим контейнер для альтернатив
        let container = document.getElementById('alternatives-panel');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'alternatives-panel';
            container.className = 'alternatives-panel';
            
            // Вставляем в панель маршрута
            const infoPanel = document.getElementById('map-info-panel');
            if (infoPanel) {
                infoPanel.appendChild(container);
            } else {
                document.body.appendChild(container);
            }
        }
        
        let html = '<div class="alternatives-container">';
        html += '<h4 class="alternatives-title">🔄 Альтернативные места</h4>';
        
        // Проходим по категориям
        const places = this.currentRoute.places || [];
        
        places.forEach((place, placeIndex) => {
            const category = place.category;
            
            // Пропускаем стартовую точку и места без категории
            if (!category || place.is_start || place.is_return) {
                return;
            }
            
            const alternatives = this.alternativePlaces[category];
            
            if (!alternatives || alternatives.length === 0) {
                return;
            }
            
            // Индекс выбранного альтернативного места (по умолчанию 0 - текущее)
            const selectedIndex = this.selectedAlternatives[placeIndex] || 0;
            
            html += this.renderCategorySlider(
                category, 
                placeIndex, 
                place, 
                alternatives, 
                selectedIndex
            );
        });
        
        html += '</div>';
        
        container.innerHTML = html;
        
        // Добавляем обработчики событий
        this.attachAlternativesListeners();
    }
    
    /**
     * Отрисовка слайдера для одной категории
     */
    renderCategorySlider(category, placeIndex, currentPlace, alternatives, selectedIndex) {
        const categoryIcon = this.getCategoryIcon(category);
        
        let html = `
            <div class="alternative-category" data-category="${category}" data-place-index="${placeIndex}">
                <div class="alternative-category-header">
                    <span class="category-icon">${categoryIcon}</span>
                    <span class="category-name">${category}</span>
                    <span class="category-count">${alternatives.length} вариантов</span>
                </div>
                <div class="alternative-slider">
                    <button class="slider-btn slider-prev" data-action="prev">‹</button>
                    <div class="alternative-options">
        `;
        
        // Добавляем текущее место как первый вариант
        const allOptions = [currentPlace, ...alternatives];
        
        allOptions.forEach((altPlace, idx) => {
            const isActive = idx === selectedIndex;
            const isCurrent = idx === 0;
            
            html += `
                <div class="alternative-option ${isActive ? 'active' : ''}" 
                     data-index="${idx}"
                     data-place-index="${placeIndex}">
                    <div class="option-marker">${idx + 1}</div>
                    <div class="option-content">
                        <div class="option-name">${altPlace.name || altPlace.address}</div>
                        ${altPlace.address ? `<div class="option-address">${this.truncate(altPlace.address, 35)}</div>` : ''}
                        ${isCurrent ? '<div class="option-badge current">Текущий</div>' : ''}
                    </div>
                    <button class="option-select-btn" 
                            data-action="select" 
                            data-place-index="${placeIndex}"
                            data-alt-index="${idx}">
                        ${isActive ? '✓' : 'Выбрать'}
                    </button>
                </div>
            `;
        });
        
        html += `
                    </div>
                    <button class="slider-btn slider-next" data-action="next">›</button>
                </div>
            </div>
        `;
        
        return html;
    }
    
    /**
     * Добавление обработчиков событий
     */
    attachAlternativesListeners() {
        // Кнопки выбора альтернативы
        document.querySelectorAll('[data-action="select"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const placeIndex = parseInt(btn.dataset.placeIndex);
                const altIndex = parseInt(btn.dataset.altIndex);
                
                console.log(`[MapAlternatives] Selecting alternative ${altIndex} for place ${placeIndex}`);
                this.selectAlternative(placeIndex, altIndex);
            });
        });
        
        // Кнопки слайдера (prev/next)
        document.querySelectorAll('.slider-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const action = btn.dataset.action;
                const category = btn.closest('.alternative-category');
                
                if (category) {
                    const placeIndex = parseInt(category.dataset.placeIndex);
                    
                    if (action === 'prev') {
                        this.slideAlternatives(placeIndex, -1);
                    } else if (action === 'next') {
                        this.slideAlternatives(placeIndex, 1);
                    }
                }
            });
        });
    }
    
    /**
     * Прокрутка слайдера альтернатив
     */
    slideAlternatives(placeIndex, direction) {
        const category = document.querySelector(`[data-place-index="${placeIndex}"]`);
        
        if (!category) return;
        
        const optionsContainer = category.querySelector('.alternative-options');
        const scrollAmount = 300; // pixels
        
        optionsContainer.scrollBy({
            left: scrollAmount * direction,
            behavior: 'smooth'
        });
    }
    
    /**
     * Выбор альтернативного места
     */
    async selectAlternative(placeIndex, altIndex) {
        console.log(`[MapAlternatives] Replacing place ${placeIndex} with alternative ${altIndex}`);
        
        // Сохраняем выбор
        this.selectedAlternatives[placeIndex] = altIndex;
        
        // Получаем данные о новом месте
        const place = this.currentRoute.places[placeIndex];
        const category = place.category;
        const alternatives = this.alternativePlaces[category];
        
        let newPlace;
        
        if (altIndex === 0) {
            // Возврат к оригинальному месту
            newPlace = place;
        } else {
            // Выбор альтернативы
            newPlace = alternatives[altIndex - 1];
        }
        
        // Обновляем место в маршруте
        const updatedPlaces = [...this.currentRoute.places];
        updatedPlaces[placeIndex] = {
            ...updatedPlaces[placeIndex],
            name: newPlace.name,
            coordinates: newPlace.coords || newPlace.coordinates,
            address: newPlace.address || newPlace.addr || ''
        };
        
        // Обновляем маршрут
        this.currentRoute.places = updatedPlaces;
        
        // Перестраиваем маршрут
        await this.rebuildRoute(updatedPlaces);
        
        // Обновляем UI
        this.renderAlternativesUI();
    }
    
    /**
     * Перестроение маршрута с новыми местами
     */
    async rebuildRoute(places) {
        console.log('[MapAlternatives] Rebuilding route with new places...');
        
        try {
            // Показываем загрузку
            window.EventBus?.emit('loading:start');
            
            // Формируем запрос
            const requestData = {
                places: places.map(p => ({
                    name: p.name,
                    coordinates: p.coordinates,
                    type: p.type || 'must_visit',
                    transport_mode: p.transport_mode || 'pedestrian',
                    address: p.address || ''
                })),
                optimize: true
            };
            
            // Отправляем запрос на бэкенд
            const API_URL = 'https://intelligent-trails.onrender.com/api/route/build';
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }
            
            // Обновляем состояние
            this.currentRoute = result;
            
            // Обновляем карту
            window.StateManager?.setRouteData(result);
            
            // Визуализируем маршрут
            if (window.MapSmartWalkInstance) {
                window.MapSmartWalkInstance.visualizeRoute(result);
            }
            
            if (window.MapPlaceMarkersInstance) {
                window.MapPlaceMarkersInstance.setPlaces(result.places);
            }
            
            console.log('[MapAlternatives] ✅ Route rebuilt successfully');
            
        } catch (error) {
            console.error('[MapAlternatives] ❌ Error rebuilding route:', error);
            window.EventBus?.emit('notification:show', {
                message: 'Ошибка перестроения маршрута: ' + error.message,
                type: 'error'
            });
        } finally {
            window.EventBus?.emit('loading:end');
        }
    }
    
    /**
     * Очистка UI альтернатив
     */
    clearAlternativesUI() {
        const container = document.getElementById('alternatives-panel');
        if (container) {
            container.innerHTML = '';
        }
    }
    
    /**
     * Получить иконку категории
     */
    getCategoryIcon(category) {
        const icons = {
            'кафе': '☕',
            'café': '☕',
            'cafe': '☕',
            'парк': '🌳',
            'park': '🌳',
            'музей': '🏛️',
            'museum': '🏛️',
            'памятник': '🗿',
            'monument': '🗿',
            'ресторан': '🍽️',
            'restaurant': '🍽️',
            'бар': '🍺',
            'bar': '🍺',
            'магазин': '🛍️',
            'shop': '🛍️',
            'store': '🛍️'
        };
        
        return icons[category.toLowerCase()] || '📍';
    }
    
    /**
     * Обрезка текста
     */
    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 1) + '…';
    }
}

// Инициализация
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.MapAlternativesInstance = new MapAlternatives();
    });
} else {
    window.MapAlternativesInstance = new MapAlternatives();
}

console.log('[MapAlternatives] ✅ Module loaded');
