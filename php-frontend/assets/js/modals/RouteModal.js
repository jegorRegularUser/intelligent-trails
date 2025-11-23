/**
 * Route Modal
 * Main controller for route building modal
 * Integrates all modules: ActivityManager, RouteBuilder, RoutePanel
 */

import { ActivityManager } from '../modules/ActivityManager.js';
import { RouteBuilder } from '../modules/RouteBuilder.js';
import { RoutePanel } from '../modules/RoutePanel.js';
import { setupYandexSuggest } from '../utils/geocoder.js';
import { showNotification } from '../utils/notifications.js';

export class RouteModal {
    constructor() {
        this.modal = null;
        this.currentRouteType = 'smart';
        this.waypoints = [];
        this.map = null;
        
        // Initialize modules
        this.activityManager = new ActivityManager();
        this.routeBuilder = null; // Will be set when map is ready
        this.routePanel = null;
        
        // Expose globally for inline handlers
        window.activityManager = this.activityManager;
        window.routeModal = this;
        
        if (typeof ymaps !== 'undefined' && ymaps.ready) {
            ymaps.ready(() => this.init());
        } else {
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
        this.setupModules();
    }
    
    setupModules() {
        const timelineContainer = document.getElementById('activitiesTimeline');
        if (timelineContainer) {
            this.activityManager.setTimelineContainer(timelineContainer);
        }
    }
    
    setMap(map) {
        this.map = map;
        this.routeBuilder = new RouteBuilder(map);
        this.routePanel = new RoutePanel(this.routeBuilder);
        
        // Expose globally
        window.routePanel = this.routePanel;
        window.routeBuilder = this.routeBuilder;
        
        // Make displayWalkInfo available globally for map.php compatibility
        window.displayWalkInfo = (walkData, pointsInfo) => {
            this.routePanel.displayWalkInfo(walkData, pointsInfo);
        };
        
        window.displaySimpleRoute = async (routeData) => {
            await this.routeBuilder.buildSimpleRoute(
                routeData.start_point,
                routeData.end_point,
                routeData.waypoints || [],
                routeData.mode
            );
        };
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
                                <div class="type-desc">С активностями</div>
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
                        <!-- SMART ROUTE PANEL -->
                        <div id="smartRoutePanel" class="route-panel active">
                            <div class="section-header">
                                <span class="section-icon">📍</span>
                                <h3>Откуда начинаем?</h3>
                            </div>
                            <div class="input-group">
                                <input type="text" id="smartStartPoint" class="location-input" 
                                       placeholder="Например: Москва, Красная площадь" autocomplete="off" />
                            </div>

                            <div class="section-header" style="margin-top: 25px;">
                                <span class="section-icon">⏱️</span>
                                <h3>Что будем делать?</h3>
                                <p class="section-desc">Перетаскивайте активности для изменения порядка</p>
                            </div>

                            <div class="timeline-container">
                                <div class="timeline-total">
                                    <span class="timeline-icon">🕐</span>
                                    <span>Общее время: <strong id="totalTimeDisplay">0 мин</strong></span>
                                </div>
                                <div id="activitiesTimeline" class="activities-timeline">
                                    <div class="timeline-empty">
                                        <p>🎯 Добавьте активности, чтобы создать прогулку</p>
                                    </div>
                                </div>
                            </div>

                            <div class="activity-buttons">
                                <button class="activity-btn walk-btn" id="addWalkBtn">
                                    <span class="btn-icon">🚶</span>
                                    <span>Прогулка</span>
                                </button>
                                <button class="activity-btn place-btn" id="addPlaceBtn">
                                    <span class="btn-icon">📍</span>
                                    <span>Место</span>
                                </button>
                            </div>

                            <div class="section-header" style="margin-top: 25px;">
                                <span class="section-icon">🎯</span>
                                <h3>Куда придём?</h3>
                            </div>
                            <div class="destination-options">
                                <label class="destination-option">
                                    <input type="radio" name="destination" value="return" checked />
                                    <span>Вернуться на старт</span>
                                </label>
                                <label class="destination-option">
                                    <input type="radio" name="destination" value="custom" />
                                    <span>Другое место</span>
                                </label>
                            </div>
                            <div id="customEndPoint" class="input-group" style="display: none; margin-top: 10px;">
                                <input type="text" id="smartEndPoint" class="location-input" 
                                       placeholder="Куда придём?" autocomplete="off" />
                            </div>
                        </div>

                        <!-- SIMPLE ROUTE PANEL -->
                        <div id="simpleRoutePanel" class="route-panel">
                            <div class="section-header">
                                <span class="section-icon">📍</span>
                                <h3>Откуда?</h3>
                            </div>
                            <div class="input-group">
                                <input type="text" id="simpleStartPoint" class="location-input" 
                                       placeholder="Начальная точка" autocomplete="off" />
                            </div>

                            <div class="section-header" style="margin-top: 20px;">
                                <span class="section-icon">🎯</span>
                                <h3>Куда?</h3>
                            </div>
                            <div class="input-group">
                                <input type="text" id="simpleEndPoint" class="location-input" 
                                       placeholder="Конечная точка" autocomplete="off" />
                            </div>

                            <div class="section-header" style="margin-top: 20px;">
                                <span class="section-icon">🛣️</span>
                                <h3>Промежуточные точки</h3>
                            </div>
                            <div id="waypointsList" class="waypoints-list"></div>
                            <button class="add-waypoint-btn" id="addWaypointBtn">
                                <span>➕ Добавить точку</span>
                            </button>

                            <div class="section-header" style="margin-top: 20px;">
                                <span class="section-icon">🚗</span>
                                <h3>Способ передвижения</h3>
                            </div>
                            <div class="transport-selector">
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="auto" checked />
                                    <span class="transport-icon">🚗</span>
                                    <span>На машине</span>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="pedestrian" />
                                    <span class="transport-icon">🚶</span>
                                    <span>Пешком</span>
                                </label>
                                <label class="transport-option">
                                    <input type="radio" name="simpleTransport" value="masstransit" />
                                    <span class="transport-icon">🚌</span>
                                    <span>Транспорт</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn-secondary" id="cancelBuildBtn">Отмена</button>
                        <button class="btn-primary" id="buildRouteBtn">🚀 Построить</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('routeModal');
        
        // Create walk and place modals (simplified versions)
        this.createWalkModal();
        this.createPlaceModal();
    }
    
    createWalkModal() {
        // Simplified - full implementation would include all fields
        const walkModalHTML = `
            <div id="walkModal" class="activity-modal">
                <div class="activity-modal-content">
                    <div class="modal-header">
                        <h3>🚶 Добавить прогулку</h3>
                        <button class="modal-close" id="closeWalkModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Walk form fields here -->
                        <p>Модальное окно прогулки - реализуется полностью</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" id="cancelWalkBtn">Отмена</button>
                        <button class="btn-primary" id="saveWalkBtn">Сохранить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', walkModalHTML);
    }
    
    createPlaceModal() {
        const placeModalHTML = `
            <div id="placeModal" class="activity-modal">
                <div class="activity-modal-content">
                    <div class="modal-header">
                        <h3>📍 Добавить место</h3>
                        <button class="modal-close" id="closePlaceModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Модальное окно места - реализуется полностью</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" id="cancelPlaceBtn">Отмена</button>
                        <button class="btn-primary" id="savePlaceBtn">Сохранить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', placeModalHTML);
    }
    
    attachEventListeners() {
        // Close modal
        document.getElementById('closeModal').addEventListener('click', () => this.close());
        document.getElementById('cancelBuildBtn').addEventListener('click', () => this.close());
        
        // Route type switcher
        document.querySelectorAll('.route-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                this.switchRouteType(type);
            });
        });
        
        // Build route button
        document.getElementById('buildRouteBtn').addEventListener('click', () => this.handleBuildRoute());
        
        // Activity buttons
        document.getElementById('addWalkBtn').addEventListener('click', () => this.openWalkModal());
        document.getElementById('addPlaceBtn').addEventListener('click', () => this.openPlaceModal());
        
        // Destination radio
        document.querySelectorAll('input[name="destination"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const customEndPoint = document.getElementById('customEndPoint');
                customEndPoint.style.display = e.target.value === 'custom' ? 'block' : 'none';
            });
        });
        
        // Waypoint button
        document.getElementById('addWaypointBtn').addEventListener('click', () => this.addWaypoint());
        
        // Setup Yandex suggest
        this.setupSuggests();
    }
    
    setupSuggests() {
        const inputs = [
            'smartStartPoint',
            'smartEndPoint',
            'simpleStartPoint',
            'simpleEndPoint'
        ];
        
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input && typeof ymaps !== 'undefined') {
                setupYandexSuggest(input);
            }
        });
    }
    
    switchRouteType(type) {
        this.currentRouteType = type;
        
        // Update buttons
        document.querySelectorAll('.route-type-btn').forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Show/hide panels
        document.querySelectorAll('.route-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        if (type === 'smart') {
            document.getElementById('smartRoutePanel').classList.add('active');
        } else {
            document.getElementById('simpleRoutePanel').classList.add('active');
        }
    }
    
    async handleBuildRoute() {
        if (this.currentRouteType === 'smart') {
            await this.buildSmartRoute();
        } else {
            await this.buildSimpleRoute();
        }
    }
    
    async buildSmartRoute() {
        const startPoint = document.getElementById('smartStartPoint').value;
        const activities = this.activityManager.getActivities();
        
        if (!startPoint) {
            showNotification('Укажите начальную точку', 'warning');
            return;
        }
        
        const destinationType = document.querySelector('input[name="destination"]:checked').value;
        const returnToStart = destinationType === 'return';
        const endPoint = destinationType === 'custom' ? document.getElementById('smartEndPoint').value : null;
        
        await this.routeBuilder.buildSmartWalk(startPoint, activities, endPoint, returnToStart);
        this.close();
    }
    
    async buildSimpleRoute() {
        const startPoint = document.getElementById('simpleStartPoint').value;
        const endPoint = document.getElementById('simpleEndPoint').value;
        const transportMode = document.querySelector('input[name="simpleTransport"]:checked').value;
        
        if (!startPoint || !endPoint) {
            showNotification('Укажите начальную и конечную точки', 'warning');
            return;
        }
        
        await this.routeBuilder.buildSimpleRoute(startPoint, endPoint, this.waypoints, transportMode);
        this.close();
    }
    
    addWaypoint() {
        const waypointsList = document.getElementById('waypointsList');
        const index = this.waypoints.length;
        
        const waypointHTML = `
            <div class="waypoint-item" data-index="${index}">
                <input type="text" class="waypoint-input" placeholder="Промежуточная точка ${index + 1}" />
                <button class="remove-waypoint-btn" onclick="window.routeModal.removeWaypoint(${index})">×</button>
            </div>
        `;
        
        waypointsList.insertAdjacentHTML('beforeend', waypointHTML);
        this.waypoints.push('');
    }
    
    removeWaypoint(index) {
        this.waypoints.splice(index, 1);
        const waypointItem = document.querySelector(`[data-index="${index}"]`);
        if (waypointItem) waypointItem.remove();
    }
    
    openWalkModal() {
        document.getElementById('walkModal').style.display = 'flex';
    }
    
    openPlaceModal() {
        document.getElementById('placeModal').style.display = 'flex';
    }
    
    open() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            setTimeout(() => this.modal.classList.add('active'), 10);
        }
    }
    
    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => {
                this.modal.style.display = 'none';
            }, 300);
        }
    }
    
    resetForm() {
        document.getElementById('smartStartPoint').value = '';
        document.getElementById('smartEndPoint').value = '';
        this.activityManager.clearActivities();
        this.waypoints = [];
    }
}
