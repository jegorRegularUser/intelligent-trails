/**
 * Validators Utility
 * Validation functions for route building
 */

import { showNotification } from './notifications.js';

export function validateActivities(activities) {
    if (!activities || activities.length === 0) {
        showNotification('Добавьте хотя бы одну активность', 'warning');
        return false;
    }
    
    return true;
}

export function validateTransportSelection(activities) {
    const missing = [];
    
    activities.forEach((activity, idx) => {
        if (!activity.transport_mode || activity.transport_mode === '') {
            missing.push({ 
                index: idx, 
                name: activity.name || `Этап ${idx + 1}`,
                type: activity.activity_type
            });
        }
    });
    
    if (missing.length > 0) {
        showTransportValidationModal(missing, activities);
        return false;
    }
    
    return true;
}

function showTransportValidationModal(missing, activities) {
    const modal = document.createElement('div');
    modal.className = 'validation-modal';
    modal.innerHTML = `
        <div class="validation-overlay"></div>
        <div class="validation-content">
            <div class="validation-header">
                <h3>⚠️ Выберите способ передвижения</h3>
                <button class="validation-close">&times;</button>
            </div>
            <div class="validation-body">
                <p>Не указан транспорт для <strong>${missing.length}</strong> этапов:</p>
                <ul class="validation-list">
                    ${missing.map(m => `
                        <li>
                            <span class="validation-icon">${m.type === 'walk' ? '🚶' : '📍'}</span>
                            ${m.name}
                        </li>
                    `).join('')}
                </ul>
            </div>
            <div class="validation-actions">
                <button class="btn-validation primary" data-mode="pedestrian">
                    🚶 Поставить везде "Пешком"
                </button>
                <button class="btn-validation secondary" data-mode="auto">
                    🚗 Поставить везде "На машине"
                </button>
                <button class="btn-validation tertiary" data-mode="manual">
                    ✏️ Я сам проставлю
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event handlers
    const closeBtn = modal.querySelector('.validation-close');
    const overlay = modal.querySelector('.validation-overlay');
    const actionBtns = modal.querySelectorAll('.btn-validation');
    
    const closeModal = () => {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    };
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    actionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            
            if (mode !== 'manual') {
                // Set transport for all missing activities
                missing.forEach(m => {
                    activities[m.index].transport_mode = mode;
                });
                
                // Trigger re-render (dispatch custom event)
                document.dispatchEvent(new CustomEvent('activitiesUpdated', { 
                    detail: { activities } 
                }));
                
                showNotification(`✅ Транспорт установлен для всех этапов`, 'success');
            }
            
            closeModal();
        });
    });
    
    setTimeout(() => modal.classList.add('show'), 10);
}

export function validateLocation(location) {
    if (!location || location.trim() === '') {
        showNotification('Укажите местоположение', 'warning');
        return false;
    }
    return true;
}

export function validateDuration(duration) {
    const num = parseInt(duration);
    
    if (isNaN(num) || num <= 0) {
        showNotification('Укажите корректное время', 'warning');
        return false;
    }
    
    if (num > 480) {
        showNotification('Время не может превышать 8 часов', 'warning');
        return false;
    }
    
    return true;
}
