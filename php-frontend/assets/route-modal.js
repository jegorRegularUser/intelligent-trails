class RouteModal {
    constructor() {
        this.modal = null;
        this.waypoints = [];
        this.currentRoute = null;
        this.map = null;
        this.init();
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
                        <h2>Построить интеллектуальный маршрут</h2>
                        <button class="modal-close" id="closeModal">&times;</button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="route-points-section">
                            <div class="input-group">
                                <label for="startPoint">
                                    <span class="point-icon start-icon">A</span>
                                    Откуда
                                </label>
                                <input 
                                    type="text" 
                                    id="startPoint" 
                                    class="location-input" 
                                    placeholder="Начальная точка"
                                    autocomplete="off"
                                />
                                <div class="suggestions-dropdown" id="startSuggestions"></div>
                            </div>

                            <div id="waypointsContainer"></div>

                            <button class="add-waypoint-btn" id="addWaypoint">
                                <span>+</span> Добавить промежуточную точку
                            </button>

                            <div class="input-group">
                                <label for="endPoint">
                                    <span class="point-icon end-icon">B</span>
                                    Куда
                                </label>
                                <input 
                                    type="text" 
                                    id="endPoint" 
                                    class="location-input" 
                                    placeholder="Конечная точка"
                                    autocomplete="off"
                                />
                                <div class="suggestions-dropdown" id="endSuggestions"></div>
                            </div>
                        </div>

                        <div class="route-options-section">
                            <h3>Способ передвижения</h3>
                            <div class="transport-mode-grid">
                                <label class="transport-option">
                                    <input type="radio" name="transport" value="auto" checked />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚗</span>
                                        <span>Автомобиль</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="transport" value="pedestrian" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚶</span>
                                        <span>Пешком</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="transport" value="masstransit" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚌</span>
                                        <span>Транспорт</span>
                                    </div>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="transport" value="bicycle" />
                                    <div class="transport-card">
                                        <span class="transport-icon">🚴</span>
                                        <span>Велосипед</span>
                                    </div>
                                </label>
                            </div>

                            <h3>Предпочтения маршрута</h3>
                            <div class="preferences-grid">
                                <label class="preference-option">
                                    <input type="checkbox" id="avoidTolls" />
                                    <div class="preference-card">
                                        <span class="pref-icon">💰</span>
                                        <span>Избегать платных дорог</span>
                                    </div>
                                </label>
                                <label class="preference-option">
                                    <input type="checkbox" id="avoidTraffic" />
                                    <div class="preference-card">
                                        <span class="pref-icon">🚦</span>
                                        <span>Избегать пробок</span>
                                    </div>
                                </label>
                                <label class="preference-option">
                                    <input type="checkbox" id="scenicRoute" />
                                    <div class="preference-card">
                                        <span class="pref-icon">🌄</span>
                                        <span>Живописный маршрут</span>
                                    </div>
                                </label>
                                <label class="preference-option">
                                    <input type="checkbox" id="fastestRoute" checked />
                                    <div class="preference-card">
                                        <span class="pref-icon">⚡</span>
                                        <span>Быстрейший маршрут</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn-secondary" id="cancelRoute">Отмена</button>
                        <button class="btn-primary" id="buildRoute">
                            <span class="btn-icon">🗺️</span>
                            Построить маршрут
                        </button>
                    </div>

                    <div class="loading-overlay" id="loadingOverlay">
                        <div class="spinner"></div>
                        <p>Строим оптимальный маршрут...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('routeModal');
    }

    attachEventListeners() {
        // Открытие/закрытие модального окна
        document.getElementById('closeModal').addEventListener('click', () => this.close());
        document.getElementById('cancelRoute').addEventListener('click', () => this.close());
        
        // Клик вне модального окна
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Добавление промежуточных точек
        document.getElementById('addWaypoint').addEventListener('click', () => this.addWaypoint());

        // Построение маршрута
        document.getElementById('buildRoute').addEventListener('click', () => this.buildRoute());

        // Автодополнение для полей ввода
        this.setupAutocomplete('startPoint', 'startSuggestions');
        this.setupAutocomplete('endPoint', 'endSuggestions');

        // ESC для закрытия
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }

    setupAutocomplete(inputId, suggestionsId) {
        const input = document.getElementById(inputId);
        const suggestionsDiv = document.getElementById(suggestionsId);
        let timeout;

        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            const query = e.target.value.trim();

            if (query.length < 3) {
                suggestionsDiv.style.display = 'none';
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`api.php?action=get_suggestions&query=${encodeURIComponent(query)}`);
                    const suggestions = await response.json();
                    
                    if (suggestions && suggestions.length > 0) {
                        suggestionsDiv.innerHTML = suggestions.map(item => 
                            `<div class="suggestion-item" data-value="${item.value}">${item.displayName}</div>`
                        ).join('');
                        suggestionsDiv.style.display = 'block';
                    } else {
                        suggestionsDiv.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error fetching suggestions:', error);
                }
            }, 300);
        });

        suggestionsDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-item')) {
                input.value = e.target.dataset.value;
                suggestionsDiv.style.display = 'none';
            }
        });

        // Скрыть подсказки при клике вне поля
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
                suggestionsDiv.style.display = 'none';
            }
        });
    }

    addWaypoint() {
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
                <div class="suggestions-dropdown" id="waypointSuggestions${waypointIndex}"></div>
            </div>
        `;

        document.getElementById('waypointsContainer').insertAdjacentHTML('beforeend', waypointHTML);
        this.waypoints.push('');

        // Добавить автодополнение для новой точки
        const input = document.querySelector(`input[data-index="${waypointIndex}"]`);
        this.setupWaypointAutocomplete(input, waypointIndex);

        // Обработчик удаления
        document.querySelector(`button[data-index="${waypointIndex}"]`).addEventListener('click', (e) => {
            this.removeWaypoint(parseInt(e.target.dataset.index));
        });
    }

    setupWaypointAutocomplete(input, index) {
        const suggestionsDiv = document.getElementById(`waypointSuggestions${index}`);
        let timeout;

        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            const query = e.target.value.trim();
            this.waypoints[index] = query;

            if (query.length < 3) {
                suggestionsDiv.style.display = 'none';
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`api.php?action=get_suggestions&query=${encodeURIComponent(query)}`);
                    const suggestions = await response.json();
                    
                    if (suggestions && suggestions.length > 0) {
                        suggestionsDiv.innerHTML = suggestions.map(item => 
                            `<div class="suggestion-item" data-value="${item.value}">${item.displayName}</div>`
                        ).join('');
                        suggestionsDiv.style.display = 'block';
                    } else {
                        suggestionsDiv.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error fetching suggestions:', error);
                }
            }, 300);
        });

        suggestionsDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-item')) {
                input.value = e.target.dataset.value;
                this.waypoints[index] = e.target.dataset.value;
                suggestionsDiv.style.display = 'none';
            }
        });
    }

    removeWaypoint(index) {
        const waypointGroup = document.querySelector(`.waypoint-group[data-index="${index}"]`);
        if (waypointGroup) {
            waypointGroup.remove();
            this.waypoints[index] = null;
        }
    }

    async buildRoute() {
        const startPoint = document.getElementById('startPoint').value.trim();
        const endPoint = document.getElementById('endPoint').value.trim();
        const transportMode = document.querySelector('input[name="transport"]:checked').value;

        if (!startPoint || !endPoint) {
            this.showNotification('Пожалуйста, укажите начальную и конечную точки', 'error');
            return;
        }

        const routeData = {
            start_point: startPoint,
            end_point: endPoint,
            transport_mode: transportMode,
            avoid_tolls: document.getElementById('avoidTolls').checked,
            avoid_traffic: document.getElementById('avoidTraffic').checked,
            scenic_route: document.getElementById('scenicRoute').checked,
            fastest_route: document.getElementById('fastestRoute').checked,
            waypoints: this.waypoints.filter(wp => wp !== null && wp !== '')
        };

        this.showLoading(true);

        try {
            const response = await fetch('api.php?action=build_route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(routeData)
            });

            const result = await response.json();

            if (result.success) {
                this.currentRoute = result.data;
                this.displayRouteOnMap(result.data);
                this.showNotification('Маршрут успешно построен!', 'success');
                this.close();
            } else {
                this.showNotification('Ошибка при построении маршрута: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Error building route:', error);
            this.showNotification('Ошибка соединения с сервером', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayRouteOnMap(routeData) {
        if (window.currentMapRoute) {
            window.currentMapRoute(routeData);
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
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
        }, 3000);
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
        document.getElementById('startPoint').value = '';
        document.getElementById('endPoint').value = '';
        document.getElementById('waypointsContainer').innerHTML = '';
        this.waypoints = [];
        document.querySelectorAll('.preferences-grid input[type="checkbox"]').forEach(cb => {
            cb.checked = cb.id === 'fastestRoute';
        });
        document.querySelector('input[name="transport"][value="auto"]').checked = true;
    }

    setMap(mapInstance) {
        this.map = mapInstance;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.routeModal = new RouteModal();
});
