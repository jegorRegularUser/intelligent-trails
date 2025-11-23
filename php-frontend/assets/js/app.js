/**
 * Main Application Entry Point
 * Initializes all modules and sets up the application
 */

import { RouteModal } from './modals/RouteModal.js';

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    console.log('🚀 Intelligent Trails - Initializing...');
    
    // Initialize route modal
    const routeModal = new RouteModal();
    
    // Make it globally accessible for legacy code compatibility
    window.routeModal = routeModal;

    // === ДОБАВЛЕНО: обработчик кнопки открытия модалки ===
    const btn = document.getElementById('openRouteModal');
    if (btn) {
        btn.addEventListener('click', () => window.routeModal.open());
    }

    console.log('✅ Application initialized successfully');
}

// Export for potential external use
export { initApp };
