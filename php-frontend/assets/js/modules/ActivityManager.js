/**
 * Activity Manager
 * Manages walk and place activities, timeline rendering, drag & drop
 */

import { showNotification } from '../utils/notifications.js';
import { validateDuration } from '../utils/validators.js';

export class ActivityManager {
    constructor() {
        this.activities = [];
        this.totalDuration = 0;
        this.draggedElement = null;
        this.editingActivityIndex = null;
        
        this.timelineContainer = null;
        
        // Listen for activity updates
        document.addEventListener('activitiesUpdated', (e) => {
            if (e.detail.activities) {
                this.activities = e.detail.activities;
                this.updateTimeline();
            }
        });
    }
    
    setTimelineContainer(container) {
        this.timelineContainer = container;
    }
    
    addActivity(activity) {
        // Validate activity
        if (activity.activity_type === 'walk' || activity.activity_type === 'place') {
            if (!validateDuration(activity.duration_minutes)) {
                return false;
            }
        }
        
        if (this.editingActivityIndex !== null) {
            // Update existing activity
            this.activities[this.editingActivityIndex] = activity;
            this.editingActivityIndex = null;
            showNotification('✅ Активность обновлена', 'success');
        } else {
            // Add new activity
            this.activities.push(activity);
            showNotification('✅ Активность добавлена', 'success');
        }
        
        this.updateTimeline();
        this.emitChange();
        return true;
    }
    
    removeActivity(index) {
        const activity = this.activities[index];
        this.activities.splice(index, 1);
        
        showNotification(`🗑️ ${activity.name || 'Этап'} удалён`, 'info');
        
        this.updateTimeline();
        this.emitChange();
    }
    
    editActivity(index) {
        this.editingActivityIndex = index;
        const activity = this.activities[index];
        
        // Emit event for modal to open with this data
        document.dispatchEvent(new CustomEvent('editActivity', {
            detail: { activity, index }
        }));
    }
    
    moveActivity(fromIndex, toIndex) {
        const [movedActivity] = this.activities.splice(fromIndex, 1);
        this.activities.splice(toIndex, 0, movedActivity);
        
        this.updateTimeline();
        this.emitChange();
    }
    
    getActivities() {
        return this.activities;
    }
    
    clearActivities() {
        this.activities = [];
        this.totalDuration = 0;
        this.updateTimeline();
    }
    
    updateTimeline() {
        if (!this.timelineContainer) return;
        
        this.calculateTotalDuration();
        
        if (this.activities.length === 0) {
            this.timelineContainer.innerHTML = `
                <div class="timeline-empty">
                    <p>🎯 Добавьте активности, чтобы создать прогулку</p>
                </div>
            `;
            return;
        }
        
        this.timelineContainer.innerHTML = this.activities.map((activity, index) => 
            this.renderActivityCard(activity, index)
        ).join('');
        
        // Update total time display
        const totalDisplay = document.getElementById('totalTimeDisplay');
        if (totalDisplay) {
            totalDisplay.textContent = `${this.totalDuration} мин`;
        }
        
        // Attach drag and drop
        this.setupDragAndDrop();
    }
    
    renderActivityCard(activity, index) {
        const icon = this.getActivityIcon(activity);
        const transportIcon = this.getTransportIcon(activity.transport_mode);
        
        return `
            <div class="timeline-item" 
                 draggable="true" 
                 data-index="${index}">
                <div class="timeline-marker">${icon}</div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <h4>${activity.name || this.getActivityName(activity)}</h4>
                        <div class="timeline-actions">
                            <button class="timeline-btn edit" onclick="window.activityManager.editActivity(${index})" title="Редактировать">
                                ✏️
                            </button>
                            <button class="timeline-btn delete" onclick="window.activityManager.removeActivity(${index})" title="Удалить">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div class="timeline-meta">
                        <span>⏱️ ${activity.duration_minutes} мин</span>
                        ${transportIcon ? `<span>${transportIcon}</span>` : ''}
                        ${activity.category ? `<span class="category-badge">${activity.category}</span>` : ''}
                    </div>
                    ${activity.walking_style ? `
                        <div class="timeline-style">
                            ${activity.walking_style === 'scenic' ? '🌳 Живописная' : '➡️ Прямая'}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    getActivityIcon(activity) {
        if (activity.activity_type === 'walk') {
            return activity.walking_style === 'scenic' ? '🌳' : '🚶';
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
        }
        return activity.category || 'Место';
    }
    
    getTransportIcon(mode) {
        const icons = {
            'pedestrian': '🚶 Пешком',
            'auto': '🚗 На машине',
            'bicycle': '🚲 На велосипеде',
            'masstransit': '🚌 На транспорте'
        };
        return icons[mode] || '';
    }
    
    calculateTotalDuration() {
        this.totalDuration = this.activities.reduce((sum, activity) => {
            return sum + (parseInt(activity.duration_minutes) || 0);
        }, 0);
    }
    
    // Drag and Drop
    setupDragAndDrop() {
        const items = this.timelineContainer.querySelectorAll('.timeline-item');
        
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => this.handleDragStart(e));
            item.addEventListener('dragover', (e) => this.handleDragOver(e));
            item.addEventListener('drop', (e) => this.handleDrop(e));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });
    }
    
    handleDragStart(e) {
        this.draggedElement = e.currentTarget;
        e.currentTarget.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    }
    
    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        const target = e.currentTarget;
        if (target !== this.draggedElement) {
            target.style.borderTop = '3px solid #667eea';
        }
        
        return false;
    }
    
    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        const target = e.currentTarget;
        target.style.borderTop = '';
        
        if (this.draggedElement !== target) {
            const fromIndex = parseInt(this.draggedElement.dataset.index);
            const toIndex = parseInt(target.dataset.index);
            
            this.moveActivity(fromIndex, toIndex);
        }
        
        return false;
    }
    
    handleDragEnd(e) {
        e.currentTarget.style.opacity = '1';
        
        // Remove border highlights
        const items = this.timelineContainer.querySelectorAll('.timeline-item');
        items.forEach(item => {
            item.style.borderTop = '';
        });
        
        this.draggedElement = null;
    }
    
    emitChange() {
        document.dispatchEvent(new CustomEvent('activitiesChanged', {
            detail: { 
                activities: this.activities,
                totalDuration: this.totalDuration
            }
        }));
    }
}
