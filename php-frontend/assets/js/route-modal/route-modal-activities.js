window.RouteModalActivities = {
  modalInstance: null,

  init(modal) {
    this.modalInstance = modal;
    this.attachEventListeners();
  },

  attachEventListeners() {
    document.querySelectorAll('.activity-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.type;
        this.modalInstance.editingActivityIndex = null;
        if (type === 'walk') {
          this.openWalkModal();
        } else {
          this.openPlaceModal();
        }
      });
    });

    document.getElementById('closeWalkModal').addEventListener('click', () => this.closeWalkModal());
    document.getElementById('cancelWalk').addEventListener('click', () => this.closeWalkModal());
    document.getElementById('confirmWalk').addEventListener('click', () => this.saveWalkActivity());

    document.getElementById('closePlaceModal').addEventListener('click', () => this.closePlaceModal());
    document.getElementById('cancelPlace').addEventListener('click', () => this.closePlaceModal());
    document.getElementById('confirmPlace').addEventListener('click', () => this.savePlaceActivity());

    document.querySelectorAll('.place-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        
        document.querySelectorAll('.place-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.place-tab-content').forEach(c => c.classList.remove('active'));
        
        e.currentTarget.classList.add('active');
        document.getElementById(tabName + 'Tab').classList.add('active');
      });
    });
  },

  openWalkModal(editIndex = null) {
    this.modalInstance.editingActivityIndex = editIndex;
    
    if (editIndex !== null) {
      const activity = this.modalInstance.activities[editIndex];
      document.getElementById('walkModalTitle').textContent = 'Редактировать прогулку';
      document.getElementById('walkConfirmText').textContent = 'Сохранить';
      document.getElementById('walkDuration').value = activity.duration_minutes;
      document.querySelector(`input[name="walkStyle"][value="${activity.walking_style}"]`).checked = true;
      document.getElementById('walkTransport').value = activity.transport_mode;
    } else {
      document.getElementById('walkModalTitle').textContent = 'Добавить прогулку';
      document.getElementById('walkConfirmText').textContent = 'Добавить';
      document.getElementById('walkDuration').value = 30;
      document.querySelector('input[name="walkStyle"][value="scenic"]').checked = true;
      document.getElementById('walkTransport').value = 'pedestrian';
    }
    
    document.getElementById('addWalkModal').classList.add('active');
  },

  closeWalkModal() {
    document.getElementById('addWalkModal').classList.remove('active');
    this.modalInstance.editingActivityIndex = null;
  },

  openPlaceModal(editIndex = null) {
    this.modalInstance.editingActivityIndex = editIndex;
    
    if (editIndex !== null) {
      const activity = this.modalInstance.activities[editIndex];
      document.getElementById('placeModalTitle').textContent = 'Редактировать место';
      document.getElementById('placeConfirmText').textContent = 'Сохранить';
      
      if (activity.specificPlaceAddress) {
        document.querySelector('.place-tab[data-tab="specific"]').click();
        document.getElementById('specificPlaceInput').value = activity.specificPlaceAddress;
      } else {
        document.querySelector('.place-tab[data-tab="category"]').click();
        const categoryRadio = document.querySelector(`input[name="placeCategory"][value="${activity.category}"]`);
        if (categoryRadio) {
          categoryRadio.checked = true;
        }
      }
      
      document.getElementById('placeStayTime').value = activity.time_at_place || 20;
      document.getElementById('placeTransport').value = activity.transport_mode;
    } else {
      document.getElementById('placeModalTitle').textContent = 'Добавить место';
      document.getElementById('placeConfirmText').textContent = 'Добавить';
      document.querySelector('.place-tab[data-tab="category"]').click();
      const defaultCategory = document.querySelector('input[name="placeCategory"][value="кафе"]');
      if (defaultCategory) {
        defaultCategory.checked = true;
      }
      const specificInput = document.getElementById('specificPlaceInput');
      if (specificInput) {
        specificInput.value = '';
      }
      document.getElementById('placeStayTime').value = 20;
      document.getElementById('placeTransport').value = 'pedestrian';
    }
    
    document.getElementById('addPlaceModal').classList.add('active');
  },

  closePlaceModal() {
    document.getElementById('addPlaceModal').classList.remove('active');
    this.modalInstance.editingActivityIndex = null;
  },

  saveWalkActivity() {
    const duration = parseInt(document.getElementById('walkDuration').value);
    const style = document.querySelector('input[name="walkStyle"]:checked').value;
    const transport = document.getElementById('walkTransport').value;

    const activity = {
      type: 'walk',
      duration_minutes: duration,
      walking_style: style,
      transport_mode: transport
    };

    if (this.modalInstance.editingActivityIndex !== null) {
      this.modalInstance.activities[this.modalInstance.editingActivityIndex] = activity;
    } else {
      this.modalInstance.activities.push(activity);
    }
    
    this.updateTimeline(this.modalInstance);
    this.closeWalkModal();
  },

  savePlaceActivity() {
    const activeTab = document.querySelector('.place-tab.active').dataset.tab;
    const stayTime = parseInt(document.getElementById('placeStayTime').value);
    const transport = document.getElementById('placeTransport').value;

    let activity = {
      type: 'place',
      duration_minutes: stayTime,
      time_at_place: stayTime,
      transport_mode: transport
    };

    if (activeTab === 'category') {
      const selectedCategory = document.querySelector('input[name="placeCategory"]:checked');
      if (selectedCategory) {
        activity.category = selectedCategory.value;
      } else {
        activity.category = 'кафе';
      }
    } else {
      const placeInput = document.getElementById('specificPlaceInput');
      const placeAddress = placeInput ? placeInput.value.trim() : '';
      if (!placeAddress) {
        this.modalInstance.showNotification('⚠️ Укажите адрес или название места', 'error');
        return;
      }
      activity.specificPlaceAddress = placeAddress;
    }

    if (this.modalInstance.editingActivityIndex !== null) {
      this.modalInstance.activities[this.modalInstance.editingActivityIndex] = activity;
    } else {
      this.modalInstance.activities.push(activity);
    }

    if (this.modalInstance.activities.length > 1) {
      const last = this.modalInstance.activities[this.modalInstance.activities.length - 2];
      if (last.type === 'place') {
        this.modalInstance.activities.splice(this.modalInstance.activities.length - 1, 0, {
          type: 'walk',
          duration_minutes: 10,
          walking_style: 'direct',
          transport_mode: transport
        });
      }
    }

    this.updateTimeline(this.modalInstance);
    this.closePlaceModal();
  },

  updateTimeline(modal) {
    const timeline = document.getElementById('activitiesTimeline');
    
    if (modal.activities.length === 0) {
      timeline.innerHTML = '<div class="timeline-empty"><p>🎯 Добавьте активности, чтобы создать прогулку</p></div>';
      modal.totalDuration = 0;
    } else {
      let html = '';
      modal.totalDuration = 0;

      modal.activities.forEach((activity, index) => {
        modal.totalDuration += activity.duration_minutes;
        
        let icon, title, details;
        
        if (activity.type === 'walk') {
          icon = activity.transport_mode === 'pedestrian' ? '🚶' : 
                 activity.transport_mode === 'bicycle' ? '🚴' :
                 activity.transport_mode === 'auto' ? '🚗' : '🚌';
          title = activity.walking_style === 'scenic' ? 'Живописная прогулка' : 'Прямая прогулка';
          
          details = `
            <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
              <span>${activity.duration_minutes} мин</span>
              <select class="quick-transport-select" data-index="${index}" onclick="event.stopPropagation()">
                <option value="pedestrian" ${activity.transport_mode === 'pedestrian' ? 'selected' : ''}>🚶 Пешком</option>
                <option value="bicycle" ${activity.transport_mode === 'bicycle' ? 'selected' : ''}>🚴 Велосипед</option>
                <option value="auto" ${activity.transport_mode === 'auto' ? 'selected' : ''}>🚗 Авто</option>
                <option value="masstransit" ${activity.transport_mode === 'masstransit' ? 'selected' : ''}>🚌 Транспорт</option>
              </select>
            </div>
          `;
        } else {
          icon = activity.category === 'кафе' ? '☕' :
                 activity.category === 'ресторан' ? '🍽️' :
                 activity.category === 'парк' ? '🌳' :
                 activity.category === 'музей' ? '🏛️' :
                 activity.category === 'памятник' ? '🗿' :
                 activity.category === 'бар' ? '🍺' :
                 activity.category === 'магазин' ? '🛍️' : '📍';
          title = activity.specificPlaceAddress || activity.category;
          details = `${activity.duration_minutes} мин`;
        }

        html += `
          <div class="timeline-item" data-index="${index}" draggable="true">
            <div class="timeline-item-drag">⋮⋮</div>
            <div class="timeline-item-icon">${icon}</div>
            <div class="timeline-item-content">
              <div class="timeline-item-title">${title}</div>
              <div class="timeline-item-details">${details}</div>
            </div>
            <div class="timeline-item-actions">
              <button class="timeline-item-edit" data-index="${index}" title="Редактировать">✏️</button>
              <button class="timeline-item-remove" data-index="${index}" title="Удалить">×</button>
            </div>
          </div>
        `;
      });

      timeline.innerHTML = html;

      timeline.querySelectorAll('.quick-transport-select').forEach(select => {
        select.addEventListener('change', (e) => {
          e.stopPropagation();
          const index = parseInt(e.target.dataset.index);
          modal.activities[index].transport_mode = e.target.value;
          this.updateTimeline(modal);
        });
      });

      timeline.querySelectorAll('.timeline-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(e.currentTarget.dataset.index);
          this.removeActivity(modal, index);
        });
      });

      timeline.querySelectorAll('.timeline-item-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(e.currentTarget.dataset.index);
          this.editActivity(modal, index);
        });
      });

      timeline.querySelectorAll('.timeline-item').forEach(item => {
        item.addEventListener('dragstart', (e) => this.handleDragStart(modal, e));
        item.addEventListener('dragover', (e) => this.handleDragOver(e));
        item.addEventListener('drop', (e) => this.handleDrop(modal, e));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));
      });
    }

    document.getElementById('totalTimeDisplay').textContent = `${modal.totalDuration} мин`;
  },

  handleDragStart(modal, e) {
    modal.draggedElement = e.currentTarget;
    e.currentTarget.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  },

  handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    if (this.modalInstance && target !== this.modalInstance.draggedElement) {
      const rect = target.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      
      if (e.clientY < midpoint) {
        target.style.borderTop = '3px solid #667eea';
        target.style.borderBottom = '';
      } else {
        target.style.borderBottom = '3px solid #667eea';
        target.style.borderTop = '';
      }
    }
    
    return false;
  },

  handleDrop(modal, e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    if (modal.draggedElement !== e.currentTarget) {
      const draggedIndex = parseInt(modal.draggedElement.dataset.index);
      const targetIndex = parseInt(e.currentTarget.dataset.index);
      
      const draggedActivity = modal.activities[draggedIndex];
      modal.activities.splice(draggedIndex, 1);
      
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const insertIndex = e.clientY < midpoint ? targetIndex : targetIndex + 1;
      
      modal.activities.splice(insertIndex > draggedIndex ? insertIndex - 1 : insertIndex, 0, draggedActivity);
      this.updateTimeline(modal);
    }

    return false;
  },

  handleDragEnd(e) {
    e.currentTarget.style.opacity = '';
    document.querySelectorAll('.timeline-item').forEach(item => {
      item.style.borderTop = '';
      item.style.borderBottom = '';
    });
  },

  editActivity(modal, index) {
    const activity = modal.activities[index];
    if (activity.type === 'walk') {
      this.openWalkModal(index);
    } else {
      this.openPlaceModal(index);
    }
  },

  removeActivity(modal, index) {
    modal.activities.splice(index, 1);
    this.updateTimeline(modal);
  }
};
