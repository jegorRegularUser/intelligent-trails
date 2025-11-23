/**
 * Route Panel
 * Manages the left side information panel with route details
 */

import { VariantSlider } from './VariantSlider.js';

export class RoutePanel {
    constructor(routeBuilder) {
        this.panel = document.getElementById('routeInfoPanel');
        this.statsContainer = document.getElementById('routeInfoStats');
        this.stagesContainer = document.getElementById('routeStagesList');
        this.routeBuilder = routeBuilder;
        this.variantSlider = new VariantSlider(routeBuilder);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        const closeBtn = document.getElementById('closeRouteInfo');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
    }
    
    show() {
        if (this.panel) {
            this.panel.classList.add('active');
            this.panel.style.display = 'flex';
        }
    }
    
    hide() {
        if (this.panel) {
            this.panel.classList.remove('active');
            setTimeout(() => {
                this.panel.style.display = 'none';
            }, 300);
        }
    }
    
    displayWalkInfo(walkData, pointsInfo) {
        this.show();
        this.renderStats(walkData);
        this.renderStages(walkData, pointsInfo);
    }
    
    renderStats(walkData) {
        if (!this.statsContainer) return;
        
        const totalDistance = this.calculateTotalDistance(walkData);
        
        const statsHTML = `
            <div class="stat-card">
                <span class="stat-icon">⏱️</span>
                <div>
                    <div class="stat-label">Общее время</div>
                    <div class="stat-value">${walkData.total_duration_minutes} мин</div>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">📍</span>
                <div>
                    <div class="stat-label">Активностей</div>
                    <div class="stat-value">${walkData.activities.length}</div>
                </div>
            </div>
            ${totalDistance ? `
                <div class="stat-card">
                    <span class="stat-icon">📏</span>
                    <div>
                        <div class="stat-label">Расстояние</div>
                        <div class="stat-value">${totalDistance} км</div>
                    </div>
                </div>
            ` : ''}
        `;
        
        this.statsContainer.innerHTML = statsHTML;
    }
    
    async renderStages(walkData, pointsInfo) {
        if (!this.stagesContainer) return;
        
        let stagesHTML = '<div class="stages-header">🗺️ Этапы прогулки</div>';
        
        for (let i = 0; i < walkData.activities.length; i++) {
            const activity = walkData.activities[i];
            stagesHTML += await this.renderStageCard(activity, i);
        }
        
        this.stagesContainer.innerHTML = stagesHTML;
        
        // Load alternatives for places
        this.loadAlternativesForStages(walkData);
    }
    
    async renderStageCard(activity, index) {
        const activityIcon = this.getActivityIcon(activity);
        const activityName = this.getActivityName(activity);
        const transportLabel = this.getTransportLabel(activity.transport_mode);
        
        return `
            <div class="stage-card" data-stage="${index}">
                <div class="stage-header">
                    <span class="stage-icon">${activityIcon}</span>
                    <div class="stage-info">
                        <div class="stage-title">${activityName}</div>
                        <div class="stage-meta">
                            ⏱️ ${activity.duration_minutes} мин
                            ${transportLabel ? `· ${transportLabel}` : ''}
                            ${activity.distance ? `· 📏 ${(activity.distance / 1000).toFixed(1)} км` : ''}
                        </div>
                    </div>
                </div>
                <div class="stage-actions">
                    <button class="stage-btn" onclick="window.routePanel.focusOnStage(${index})" title="Показать на карте">
                        🗺️
                    </button>
                    <button class="stage-btn" onclick="window.activityManager.editActivity(${index})" title="Редактировать">
                        ✏️
                    </button>
                    <button class="stage-btn delete" onclick="window.activityManager.removeActivity(${index})" title="Удалить">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }
    
    async loadAlternativesForStages(walkData) {
        for (let i = 0; i < walkData.activities.length; i++) {
            const activity = walkData.activities[i];
            
            if (activity.activity_type === 'place' && activity.selected_place) {
                const alternatives = await this.variantSlider.loadAlternatives(
                    activity.category,
                    activity.selected_place.coords,
                    activity.selected_place.id
                );
                
                if (alternatives.length > 0) {
                    const stageCard = document.querySelector(`[data-stage="${i}"]`);
                    if (stageCard) {
                        this.variantSlider.renderSlider(stageCard, alternatives, activity.selected_place);
                    }
                }
            }
        }
    }
    
    focusOnStage(stageIndex) {
        // Emit event for map to center on this stage
        document.dispatchEvent(new CustomEvent('focusOnStage', {
            detail: { stageIndex }
        }));
    }
    
    getActivityIcon(activity) {
        if (activity.activity_type === 'walk') {
            return activity.walking_style === 'scenic' ? '🌳' : '➡️';
        } else {
            const icons = {
                'кафе': '☕',
                'ресторан': '🍽️',
                'парк': '🌳',
                'музей': '🏛️',
                'памятник': '🗿',
                'бар': '🍺',
                'магазин': '🛑️'
            };
            return icons[activity.category] || '📍';
        }
    }
    
    getActivityName(activity) {
        if (activity.activity_type === 'walk') {
            return activity.walking_style === 'scenic' ? 'Живописная прогулка' : 'Прямая прогулка';
        } else if (activity.selected_place) {
            return activity.selected_place.name;
        }
        return activity.category || 'Место';
    }
    
    getTransportLabel(mode) {
        const labels = {
            'pedestrian': '🚶 Пешком',
            'auto': '🚗 Авто',
            'bicycle': '🚲 Велосипед',
            'masstransit': '🚌 Транспорт'
        };
        return labels[mode] || '';
    }
    
    calculateTotalDistance(walkData) {
        const total = walkData.activities.reduce((sum, activity) => {
            return sum + (activity.distance || 0);
        }, 0);
        
        return total > 0 ? (total / 1000).toFixed(1) : null;
    }
    
    displaySimpleRouteInfo(route, routeData) {
        this.show();
        
        const routeInfo = route.getActiveRoute();
        const distance = (routeInfo.properties.get('distance').value / 1000).toFixed(2);
        const duration = this.formatDuration(routeInfo.properties.get('duration').value);
        
        const statsHTML = `
            <div class="stat-card">
                <span class="stat-icon">📏</span>
                <div>
                    <div class="stat-label">Расстояние</div>
                    <div class="stat-value">${distance} км</div>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">⏱️</span>
                <div>
                    <div class="stat-label">Время в пути</div>
                    <div class="stat-value">${duration}</div>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🚗</span>
                <div>
                    <div class="stat-label">Способ</div>
                    <div class="stat-value">${this.getTransportLabel(routeData.mode)}</div>
                </div>
            </div>
        `;
        
        this.statsContainer.innerHTML = statsHTML;
        this.stagesContainer.innerHTML = '';
    }
    
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours} ч ${minutes} мин`;
        }
        return `${minutes} мин`;
    }
}
