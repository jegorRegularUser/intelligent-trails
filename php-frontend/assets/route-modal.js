class RouteModal {
    constructor() {
        this.modal = null;
        this.currentRouteType = 'smart';
        this.waypoints = [];
        this.currentRoute = null;
        this.map = null;
        this.selectedCategories = [];
        // Отложенная инициализация после загрузки ymaps
        if (typeof ymaps !== 'undefined' && ymaps.ready) {
            ymaps.ready(() => this.init());
        } else {
            // Если ymaps еще не загружен, дождемся события
            window.addEventListener('load', () => {
                if (typeof ymaps !== 'undefined') {
                    ymaps.ready(() => this.init());
                } else {
                    this.init();
                }
            });
        }
    }

    init() {
        this.createModal();
        this.attachEventListeners();
    }

    createModal() {
        const modalHTML = `
            <div id="routeModal" class="route-modal">
                <div class="route-modal-content">
                    <div class="modal-header">
                        <h2>✨ Построить маршрут</h2>
                        <button class="modal-close" id="closeModal">&times;</button>
                    </div>
                    
                    <div class="route-type-selector">
                        <button class="route-type-btn active" data-type="smart">
                            <span class="type-icon">🧠</span>
                            <div>
                                <div class="type-title">Умная прогулка</div>
                                <div class="type-desc">С посещением мест</div>
                            </div>
                        </button>
                        <button class="route-type-btn" data-type="simple">
                            <span class="type-icon">🗺️</span>
                            <div>
                                <div class="type-title">Простой маршрут</div>
                                <div class="type-desc">Из точки А в точку Б</div>
                            </div>
                        </button>
                    </div>

                    <div class="modal-body">
                        <div id="smartRoutePanel" class="route-panel active">
                            <div class="section-header">
                                <span class="section-icon">📍</span>
                                <h3>Основные точки</h3>
                            </div>

                            <div class="input-group">
                                <label>
                                    <span class="point-icon start-icon">A</span>
                                    Точка старта
                                </label>
                                <input 
                                    type="text" 
                                    id="smartStartPoint" 
                                    class="location-input" 
                                    placeholder="Например: Москва, Красная площадь"
                                    autocomplete="off"
                                />
                            </div>

                            <div class="route-end-options">
                                <label class="radio-option">
                                    <input type="radio" name="routeEnd" value="return" checked />
                                    <div class="option-card">
                                        <span class="option-icon">🔄</span>
                                        <span>Вернуться к началу</span>
                                    </div>
                                </label>
                                <label class="radio-option">
                                    <input type="radio" name="routeEnd" value="custom" />
                                    <div class="option-card">
                                        <span class="option-icon">🎯</span>
                                        <span>Закончить в другом месте</span>
                                    </div>
                                </label>
                            </div>

                            <div class="input-group" id="smartEndPointGroup" style="display: none;">
                                <label>
                                    <span class="point-icon end-icon">B</span>
                                    Точка финиша
                                </label>
                                <input 
                                    type="text" 
                                    id="smartEndPoint" 
                                    class="location-input" 
                                    placeholder="Куда хотите прийти?"
                                    autocomplete="off"
                                />
                            </div>

                            <div class="section-header">
                                <span class="section-icon">⏱️</span>
                                <h3>Длительность прогулки</h3>
                            </div>

                            <div class="time-selector">
                                <div class="time-display">
                                    <span class="time-value" id="timeValue">60</span>
                                    <span class="time-unit">минут</span>
                                </div>
                                <input 
                                    type="range" 
                                    id="timeSlider" 
                                    min="15" 
                                    max="180" 
                                    value="60" 
                                    step="15"
                                    class="time-slider"
                                />
                                <div class="time-labels">
                                    <span>15 мин</span>
                                    <span>3 часа</span>
                                </div>
                            </div>

                            <div class="section-header">
                                <span class="section-icon">🏛️</span>
                                <h3>Что хотите посетить?</h3>
                            </div>

                            <div class="categories-grid">
                                <label class="category-option">
                                    <input type="checkbox" value="кафе" />
                                    <div class="category-card">
                                        <span class="cat-icon">☕</span>
                                        <span>Кафе</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="парк" />
                                    <div class="category-card">
                                        <span class="cat-icon">🌳</span>
                                        <span>Парки</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="музей" />
                                    <div class="category-card">
                                        <span class="cat-icon">🏛️</span>
                                        <span>Музеи</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="памятник" />
                                    <div class="category-card">
                                        <span class="cat-icon">🗿</span>
                                        <span>Памятники</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="ресторан" />
                                    <div class="category-card">
                                        <span class="cat-icon">🍽️</span>
                                        <span>Рестораны</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="бар" />
                                    <div class="category-card">
                                        <span class="cat-icon">🍺</span>
                                        <span>Бары</span>
                                    </div>
                                </label>
                                <label class="category-option">
                                    <input type="checkbox" value="магазин" />
                                    <div class="category-card">
                                        <span class="cat-icon">🛍️</span>
                                        <span>Магазины</span>
                                    </div>
                                </label>
                            </div>

                            <div class="section-header">
                                <span class="section-icon">⚙️</span>
                                <h3>Настройки прогулки</h3>
                            </div>

                            <div class="settings-group">
                                <div class="setting-item">
                                    <label>Темп прогулки</label>
                                    <div class="pace-selector">
                                        <label class="pace-option">
                                            <input type="radio" name="pace" value="relaxed" />
                                            <div class="pace-card">
                                                <span class="pace-icon">🐢</span>
                                                <span>Спокойно</span>
                                            </div>
                                        </label>
                                        <label class="pace-option">
                                            <input type="radio" name="pace" value="balanced" checked />
                                            <div class="pace-card">
                                                <span class="pace-icon">🚶</span>
                                                <span>Обычно</span>
                                            </div>
                                        </label>
                                        <label class="pace-option">
                                            <input type="radio" name="pace" value="active" />
                                            <div class="pace-card">
                                                <span class="pace-icon">🏃</span>
                                                <span>Активно</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <label>
                                        Строгость по времени
                                        <span class="strictness-value" id="strictnessValue">5</span>/10
                                    </label>
                                    <input 
                                        type="range" 
                                        id="strictnessSlider" 
                                        min="0" 
                                        max="10" 
                                        value="5" 
                                        class="strictness-slider"
                                    />
                                    <div class="strictness-labels">
                                        <span>Можно опоздать</span>
                                        <span>Очень строго</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="simpleRoutePanel" class="route-panel">
                            <div class="section-header">
                                <span class="section-icon">📍</span>
                                <h3>Точки маршрута</h3>
                            </div>

                            <div class="input-group">
                                <label>
                                    <span class="point-icon start-icon">A</span>
                                    Откуда
                                </label>
                                <input 
                                    type="text" 
                                    id="simpleStartPoint" 
                                    class="location-input" 
                                    placeholder="Начальная точка"
                                    autocomplete="off"
                                />
                            </div>

                            <div id="simpleWaypointsContainer"></div>

                            <button class="add-waypoint-btn" id="addSimpleWaypoint">
                                <span>+</span> Добавить промежуточную точку
                            </button>

                            <div class="input-group">
                                <label>
                                    <span class="point-icon end-icon">B</span>
                                    Куда
                                </label>
                                <input 
                                    type="text" 
                                    id="simpleEndPoint" 
                                    class="location-input" 
                                    placeholder="Конечная точка"
                                    autocomplete="off"
                                />
                            </div>

                            <div class="section-header">
                                <span class="section-icon">🚗</span>
                                <h3>Способ передвижения</h3>
                            </div>

                            <div class="transport-mode-grid">
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="auto" checked />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚗</span>
                                        <span>Авто</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="pedestrian" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚶</span>
                                        <span>Пешком</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="masstransit" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚌</span>
                                        <span>Транспорт</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="bicycle" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚴</span>
                                        <span>Велосипед</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn-secondary" id="cancelRoute">Отмена</button>
                        <button class="btn-primary" id="buildRoute">
                            <span class="btn-icon">🗺️</span>
                            <span id="buildBtnText">Построить маршрут</span>
                        </button>
                    </div>

                    <div class="loading-overlay" id="loadingOverlay">
                        <div class="spinner"></div>
                        <p id="loadingText">Строим оптимальный маршрут...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('routeModal');
    }

    attachEventListeners() {
        document.getElementById('closeModal').addEventListener('click', () => this.close());
        document.getElementById('cancelRoute').addEventListener('click', () => this.close());
        
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.querySelectorAll('.route-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchRouteType(e.currentTarget.dataset.type);
            });
        });

        const timeSlider = document.getElementById('timeSlider');
        const timeValue = document.getElementById('timeValue');
        timeSlider.addEventListener('input', (e) => {
            timeValue.textContent = e.target.value;
        });

        const strictnessSlider = document.getElementById('strictnessSlider');
        const strictnessValue = document.getElementById('strictnessValue');
        strictnessSlider.addEventListener('input', (e) => {
            strictnessValue.textContent = e.target.value;
        });

        document.querySelectorAll('input[name="routeEnd"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const endGroup = document.getElementById('smartEndPointGroup');
                endGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
            });
        });

        document.getElementById('buildRoute').addEventListener('click', () => this.buildRoute());
        document.getElementById('addSimpleWaypoint').addEventListener('click', () => this.addSimpleWaypoint());

        this.setupYandexSuggest('smartStartPoint');
        this.setupYandexSuggest('smartEndPoint');
        this.setupYandexSuggest('simpleStartPoint');
        this.setupYandexSuggest('simpleEndPoint');

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }

    switchRouteType(type) {
        this.currentRouteType = type;
        
        document.querySelectorAll('.route-type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        document.getElementById('smartRoutePanel').classList.toggle('active', type === 'smart');
        document.getElementById('simpleRoutePanel').classList.toggle('active', type === 'simple');

        const btnText = type === 'smart' ? 'Построить умный маршрут' : 'Построить маршрут';
        document.getElementById('buildBtnText').textContent = btnText;
    }

    setupYandexSuggest(inputId) {
        const input = document.getElementById(inputId);
        
        if (typeof ymaps !== 'undefined' && ymaps.suggest) {
            new ymaps.SuggestView(input, {
                results: 5
            });
        }
    }

    addSimpleWaypoint() {
        const waypointIndex = this.waypoints.length;
        const waypointHTML = `
            <div class="input-group waypoint-group" data-index="${waypointIndex}">
                <label>
                    <span class="point-icon waypoint-icon">${waypointIndex + 1}</span>
                    Промежуточная точка ${waypointIndex + 1}
                </label>
                <div class="waypoint-input-wrapper">
                    <input 
                        type="text" 
                        class="location-input waypoint-input" 
                        placeholder="Адрес промежуточной точки"
                        data-index="${waypointIndex}"
                        autocomplete="off"
                    />
                    <button class="remove-waypoint-btn" data-index="${waypointIndex}">
                        &times;
                    </button>
                </div>
            </div>
        `;

        document.getElementById('simpleWaypointsContainer').insertAdjacentHTML('beforeend', waypointHTML);
        this.waypoints.push('');

        document.querySelector(`.remove-waypoint-btn[data-index="${waypointIndex}"]`).addEventListener('click', (e) => {
            this.removeWaypoint(parseInt(e.target.dataset.index));
        });

        const waypointInput = document.querySelector(`.waypoint-input[data-index="${waypointIndex}"]`);
        this.setupYandexSuggestForElement(waypointInput);
    }

    setupYandexSuggestForElement(element) {
        if (typeof ymaps !== 'undefined' && ymaps.suggest) {
            new ymaps.SuggestView(element, {
                results: 5
            });
        }
    }

    removeWaypoint(index) {
        const waypointGroup = document.querySelector(`.waypoint-group[data-index="${index}"]`);
        if (waypointGroup) {
            waypointGroup.remove();
            this.waypoints[index] = null;
        }
    }

    async buildRoute() {
        if (this.currentRouteType === 'smart') {
            await this.buildSmartRoute();
        } else {
            await this.buildSimpleRoute();
        }
    }

    async buildSmartRoute() {
        const startPoint = document.getElementById('smartStartPoint').value.trim();
        const returnToStart = document.querySelector('input[name="routeEnd"]:checked').value === 'return';
        const endPoint = returnToStart ? null : document.getElementById('smartEndPoint').value.trim();
        const timeLimit = parseInt(document.getElementById('timeSlider').value);
        const pace = document.querySelector('input[name="pace"]:checked').value;
        const strictness = parseInt(document.getElementById('strictnessSlider').value);

        const categories = [];
        document.querySelectorAll('.category-option input:checked').forEach(cb => {
            categories.push(cb.value);
        });

        if (!startPoint) {
            this.showNotification('Укажите точку старта', 'error');
            return;
        }

        if (categories.length === 0) {
            this.showNotification('Выберите хотя бы одну категорию мест для посещения', 'error');
            return;
        }

        if (!returnToStart && !endPoint) {
            this.showNotification('Укажите точку финиша или выберите возврат к началу', 'error');
            return;
        }

        this.showLoading(true, 'Определяем координаты...');
        
        try {
            const startCoords = await this.geocodeAddress(startPoint);
            let endCoords = null;
            
            if (!returnToStart && endPoint) {
                endCoords = await this.geocodeAddress(endPoint);
            }

            const routeData = {
                start_point: {
                    name: startPoint,
                    coords: startCoords
                },
                end_point: endCoords ? {
                    name: endPoint,
                    coords: endCoords
                } : null,
                categories: categories,
                time_limit_minutes: timeLimit,
                return_to_start: returnToStart,
                mode: 'pedestrian',
                pace: pace,
                time_strictness: strictness
            };

            this.showLoading(true, 'Ищем интересные места и строим маршрут...');

            const response = await fetch('api.php?action=build_smart_route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(routeData)
            });

            const result = await response.json();

            if (result.success) {
                this.currentRoute = result.data;
                this.displaySmartRouteOnMap(result.data);
                
                let message = 'Умный маршрут построен!';
                if (result.data.warnings && result.data.warnings.length > 0) {
                    message += '\n' + result.data.warnings.join('\n');
                }
                
                this.showNotification(message, 'success');
                this.close();
            } else {
                this.showNotification('Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
                console.error('Backend error:', result);
            }
        } catch (error) {
            console.error('Error building smart route:', error);
            this.showNotification('Ошибка соединения с сервером', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async buildSimpleRoute() {
        const startPoint = document.getElementById('simpleStartPoint').value.trim();
        const endPoint = document.getElementById('simpleEndPoint').value.trim();
        const mode = document.querySelector('input[name="simpleTransport"]:checked').value;

        if (!startPoint || !endPoint) {
            this.showNotification('Укажите начальную и конечную точки', 'error');
            return;
        }

        const waypoints = [];
        document.querySelectorAll('.waypoint-input').forEach(input => {
            const value = input.value.trim();
            if (value) waypoints.push(value);
        });

        const routeData = {
            start_point: startPoint,
            end_point: endPoint,
            waypoints: waypoints,
            mode: mode
        };

        this.showLoading(true, 'Строим маршрут...');

        try {
            const response = await fetch('api.php?action=build_simple_route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(routeData)
            });

            const result = await response.json();

            if (result.success) {
                this.displaySimpleRouteOnMap(result.data);
                this.showNotification('Маршрут построен!', 'success');
                this.close();
            } else {
                this.showNotification('Ошибка: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error building simple route:', error);
            this.showNotification('Ошибка соединения', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async geocodeAddress(address) {
        return new Promise((resolve, reject) => {
            ymaps.geocode(address, { results: 1 }).then(result => {
                const firstGeoObject = result.geoObjects.get(0);
                if (firstGeoObject) {
                    const coords = firstGeoObject.geometry.getCoordinates();
                    resolve(coords);
                } else {
                    reject(new Error('Адрес не найден'));
                }
            }, error => {
                reject(error);
            });
        });
    }

    displaySmartRouteOnMap(routeData) {
        if (window.displaySmartRoute) {
            window.displaySmartRoute(routeData);
        }
    }

    displaySimpleRouteOnMap(routeData) {
        if (window.displaySimpleRoute) {
            window.displaySimpleRoute(routeData);
        }
    }

    showLoading(show, text = 'Строим оптимальный маршрут...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        overlay.style.display = show ? 'flex' : 'none';
        if (text) loadingText.textContent = text;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    open() {
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.resetForm();
    }

    resetForm() {
        document.getElementById('smartStartPoint').value = '';
        document.getElementById('smartEndPoint').value = '';
        document.getElementById('simpleStartPoint').value = '';
        document.getElementById('simpleEndPoint').value = '';
        document.getElementById('simpleWaypointsContainer').innerHTML = '';
        this.waypoints = [];
        document.getElementById('timeSlider').value = 60;
        document.getElementById('timeValue').textContent = '60';
        document.getElementById('strictnessSlider').value = 5;
        document.getElementById('strictnessValue').textContent = '5';
        document.querySelectorAll('.category-option input').forEach(cb => cb.checked = false);
        document.querySelector('input[name="routeEnd"][value="return"]').checked = true;
        document.querySelector('input[name="pace"][value="balanced"]').checked = true;
        document.querySelector('input[name="simpleTransport"][value="auto"]').checked = true;
        document.getElementById('smartEndPointGroup').style.display = 'none';
    }

    setMap(mapInstance) {
        this.map = mapInstance;
    }
}

// Отложенная инициализация после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.routeModal = new RouteModal();
    });
} else {
    window.routeModal = new RouteModal();
}