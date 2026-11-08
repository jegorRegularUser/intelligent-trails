/**
 * Map Info Panel - Complete rewrite
 * Shows detailed route information with segments, places, and interactive controls
 * Integrated with StateManager and EventBus
 */

class MapInfoPanel {
    constructor(containerId = 'map-info-panel') {
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            console.warn(`[MapInfoPanel] Container #${containerId} not found`);
            return;
        }
        
        this.routeData = null;
        this.activePlaceIndex = null;
        
        this.init();
        console.log('[MapInfoPanel] Initialized');
    }
    
    init() {
        // Subscribe to route updates
        window.EventBus?.on('route:updated', (routeData) => {
            this.routeData = routeData;
            this.render();
        });
        
        // Subscribe to place selection
        window.EventBus?.on('place:selected', (data) => {
            if (data) {
                this.activePlaceIndex = data.index;
                this.highlightPlace(data.index);
            }
        });
        
        // Subscribe to place changes
        window.EventBus?.on('place:changed', () => {
            this.render();
        });
        
        // Initial render
        this.render();
    }
    
    render() {
        if (!this.container) return;
        
        const data = this.routeData || window.StateManager?.get('routeData');
        
        if (!data || !data.success) {
            this.renderEmpty();
            return;
        }
        
        let html = `
            <div class="info-panel-container">
                ${this.renderHeader(data)}
                ${this.renderSummary(data)}
                ${this.renderSegments(data)}
                ${this.renderPlacesList(data)}
            </div>
        `;
        
        this.container.innerHTML = html;
        this.attachEventListeners();
    }
    
    renderEmpty() {
        this.container.innerHTML = `
            <div class="info-panel-empty">
                <div class="empty-icon">🗺️</div>
                <div class="empty-text">Постройте маршрут</div>
                <div class="empty-hint">Добавьте места и нажмите "Построить маршрут"</div>
            </div>
        `;
    }
    
    renderHeader(data) {
        const mode = data.mode || 'pedestrian';
        const modeConfig = data.mode_config || {};
        const icon = modeConfig.icon || '🚶';
        const modeNames = {
            pedestrian: 'Пешеходный',
            driving: 'Автомобильный',
            masstransit: 'Общественный транспорт'
        };
        
        return `
            <div class="info-panel-header">
                <h3>📍 Ваш маршрут</h3>
                <div class="info-panel-mode">
                    <span class="mode-icon">${icon}</span>
                    <span class="mode-name">${modeNames[mode] || mode}</span>
                </div>
            </div>
        `;
    }
    
    renderSummary(data) {
        const summary = data.summary || {};
        
        return `
            <div class="info-panel-summary">
                <div class="summary-item">
                    <div class="summary-icon">📍</div>
                    <div class="summary-content">
                        <div class="summary-label">Мест</div>
                        <div class="summary-value">${summary.number_of_places || 0}</div>
                    </div>
                </div>
                <div class="summary-item">
                    <div class="summary-icon">📏</div>
                    <div class="summary-content">
                        <div class="summary-label">Дистанция</div>
                        <div class="summary-value">${summary.total_distance_km || 0} км</div>
                    </div>
                </div>
                <div class="summary-item">
                    <div class="summary-icon">⏱️</div>
                    <div class="summary-content">
                        <div class="summary-label">Время</div>
                        <div class="summary-value">${summary.total_duration_minutes || 0} мин</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderSegments(data) {
        const segments = data.segments || [];
        
        if (segments.length === 0) {
            return '<div class="info-panel-section"><p>Нет сегментов</p></div>';
        }
        
        let html = `
            <div class="info-panel-section">
                <h4 class="section-title">📊 Сегменты маршрута</h4>
                <div class="segments-list">
        `;
        
        segments.forEach((segment, idx) => {
            const style = segment.style || {};
            const distance = this.formatDistance(segment.distance);
            const duration = this.formatDuration(segment.duration);
            
            html += `
                <div class="segment-item" data-segment="${idx}">
                    <div class="segment-number" style="background: ${style.color || '#2E86DE'}">
                        ${idx + 1}
                    </div>
                    <div class="segment-content">
                        <div class="segment-route">
                            <span class="segment-from">${this.truncate(segment.from.name, 20)}</span>
                            <span class="segment-arrow">→</span>
                            <span class="segment-to">${this.truncate(segment.to.name, 20)}</span>
                        </div>
                        <div class="segment-details">
                            <span class="segment-icon">${style.icon || '🚶'}</span>
                            <span class="segment-distance">${distance}</span>
                            <span class="segment-duration">• ${duration}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }
    
    renderPlacesList(data) {
        const places = data.places || [];
        
        if (places.length === 0) {
            return '';
        }
        
        let html = `
            <div class="info-panel-section">
                <h4 class="section-title">📍 Список мест</h4>
                <div class="places-list">
        `;
        
        places.forEach((place, idx) => {
            const isActive = idx === this.activePlaceIndex;
            const marker = place.marker || {};
            
            html += `
                <div class="place-item ${isActive ? 'active' : ''}" 
                     data-place-index="${idx}"
                     tabindex="0"
                     role="button"
                     aria-label="Перейти к ${place.name}">
                    <div class="place-marker" style="background: ${marker.color || '#2E86DE'}">
                        ${marker.number || (idx + 1)}
                    </div>
                    <div class="place-content">
                        <div class="place-name">${place.name}</div>
                        ${place.address ? `<div class="place-address">${this.truncate(place.address, 40)}</div>` : ''}
                    </div>
                    <div class="place-actions">
                        <button class="btn-icon" title="Перейти к месту" data-action="focus" data-index="${idx}">
                            🔍
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }
    
    attachEventListeners() {
        // Click on place item
        this.container.querySelectorAll('.place-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking on action buttons
                if (e.target.closest('.place-actions')) return;
                
                const index = parseInt(item.dataset.placeIndex);
                this.selectPlace(index);
            });
            
            // Keyboard navigation
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const index = parseInt(item.dataset.placeIndex);
                    this.selectPlace(index);
                }
            });
        });
        
        // Focus on place buttons
        this.container.querySelectorAll('[data-action="focus"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.focusOnPlace(index);
            });
        });
    }
    
    selectPlace(index) {
        this.activePlaceIndex = index;
        window.StateManager?.selectPlace(index);
        this.highlightPlace(index);
        console.log(`[MapInfoPanel] Selected place ${index}`);
    }
    
    focusOnPlace(index) {
        window.EventBus?.emit('place:focus', { index });
        console.log(`[MapInfoPanel] Focus on place ${index}`);
    }
    
    highlightPlace(index) {
        // Remove active class from all
        this.container.querySelectorAll('.place-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected
        const selectedItem = this.container.querySelector(`[data-place-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    // Utility methods
    formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} км`;
        }
        return `${Math.round(meters)} м`;
    }
    
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)} сек`;
        }
        if (seconds < 3600) {
            return `${Math.round(seconds / 60)} мин`;
        }
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return `${hours} ч ${minutes} мин`;
    }
    
    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 1) + '…';
    }
    
    // Public API
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }
    
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    update(routeData) {
        this.routeData = routeData;
        this.render();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.MapInfoPanelInstance = new MapInfoPanel();
    });
} else {
    window.MapInfoPanelInstance = new MapInfoPanel();
}

console.log('[MapInfoPanel] Module loaded');
