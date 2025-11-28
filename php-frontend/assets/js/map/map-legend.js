/**
 * Map Legend Component
 * Shows explanation of route colors, line styles, and markers
 */

class MapLegend {
    constructor(containerId = 'map-legend') {
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            console.warn(`[MapLegend] Container #${containerId} not found`);
            return;
        }
        
        this.isVisible = true;
        this.currentMode = 'pedestrian';
        
        this.init();
        
        console.log('[MapLegend] Initialized');
    }
    
    init() {
        // Subscribe to mode changes
        window.EventBus?.on('mode:changed', (mode) => {
            this.currentMode = mode;
            this.render();
        });
        
        // Subscribe to route updates
        window.EventBus?.on('route:updated', (routeData) => {
            if (routeData && routeData.mode) {
                this.currentMode = routeData.mode;
                this.render();
            }
        });
        
        // Initial render
        this.render();
    }
    
    render() {
        if (!this.container) return;
        
        const modes = {
            pedestrian: {
                name: 'Пешеходный',
                color: '#2E86DE',
                icon: '🚶',
                style: 'dashed'
            },
            driving: {
                name: 'Автомобильный',
                color: '#EE5A6F',
                icon: '🚗',
                style: 'solid'
            },
            masstransit: {
                name: 'Общественный транспорт',
                color: '#26de81',
                icon: '🚌',
                style: 'dashed'
            }
        };
        
        const html = `
            <div class="legend-container">
                <div class="legend-header">
                    <h3>Легенда карты</h3>
                    <button class="legend-toggle" onclick="window.MapLegendInstance?.toggle()">
                        ${this.isVisible ? '−' : '+'}
                    </button>
                </div>
                
                ${this.isVisible ? `
                    <div class="legend-content">
                        <!-- Current mode -->
                        <div class="legend-section">
                            <h4>Текущий режим</h4>
                            <div class="legend-item mode-highlight">
                                <span class="legend-icon">${modes[this.currentMode].icon}</span>
                                <span class="legend-line" style="
                                    background: ${modes[this.currentMode].color};
                                    ${modes[this.currentMode].style === 'dashed' ? 'background-image: linear-gradient(to right, ' + modes[this.currentMode].color + ' 50%, transparent 50%); background-size: 10px 2px;' : ''}
                                "></span>
                                <span class="legend-label">${modes[this.currentMode].name}</span>
                            </div>
                        </div>
                        
                        <!-- All modes -->
                        <div class="legend-section">
                            <h4>Типы маршрутов</h4>
                            ${Object.entries(modes).map(([key, mode]) => `
                                <div class="legend-item ${key === this.currentMode ? 'active' : ''}">
                                    <span class="legend-icon">${mode.icon}</span>
                                    <span class="legend-line" style="
                                        background: ${mode.color};
                                        ${mode.style === 'dashed' ? 'background-image: linear-gradient(to right, ' + mode.color + ' 50%, transparent 50%); background-size: 10px 2px;' : ''}
                                    "></span>
                                    <span class="legend-label">${mode.name}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <!-- Markers -->
                        <div class="legend-section">
                            <h4>Маркеры мест</h4>
                            <div class="legend-item">
                                <span class="legend-marker" style="background: #2E86DE; color: white;">1</span>
                                <span class="legend-label">Обязательное место</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-marker" style="background: #FFA502; color: white;">2</span>
                                <span class="legend-label">Опциональное место</span>
                            </div>
                            <div class="legend-item">
                                <span class="legend-marker start">🏁</span>
                                <span class="legend-label">Начальная точка</span>
                            </div>
                        </div>
                        
                        <!-- Actions -->
                        <div class="legend-section legend-actions">
                            <small>💡 Кликните на место в списке, чтобы перейти к нему на карте</small>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        this.container.innerHTML = html;
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.render();
        console.log(`[MapLegend] Toggled: ${this.isVisible}`);
    }
    
    show() {
        this.isVisible = true;
        this.render();
    }
    
    hide() {
        this.isVisible = false;
        this.render();
    }
    
    setMode(mode) {
        this.currentMode = mode;
        this.render();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.MapLegendInstance = new MapLegend();
    });
} else {
    window.MapLegendInstance = new MapLegend();
}
