window.MapInfoPanel = {
  displayWalkInfo(walkData, pointsInfo) {
    const distance = walkData.total_distance_meters 
      ? `${(walkData.total_distance_meters / 1000).toFixed(2)} км`
      : 'не указано';

    const statsHTML = `
      <div class="stat-card">
        <span class="stat-icon">⏱️</span>
        <div>
          <div class="stat-label">Общее время</div>
          <div class="stat-value">${walkData.total_duration_minutes} мин</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📏</span>
        <div>
          <div class="stat-label">Расстояние</div>
          <div class="stat-value">${distance}</div>
        </div>
      </div>
      <div class="stat-card action-card" id="editRouteBtn">
        <span class="stat-icon">✏️</span>
        <div>
          <div class="stat-label">Изменить</div>
          <div class="stat-value">Маршрут</div>
        </div>
      </div>
    `;

    // 1. Вставляем HTML
    const statsContainer = document.getElementById('routeInfoStats');
    if (statsContainer) {
        statsContainer.innerHTML = statsHTML;
        
        // 2. Сразу после вставки ищем кнопку внутри контейнера
        // Используем setTimeout(0) чтобы гарантировать, что DOM обновился
        setTimeout(() => {
            const editBtn = document.getElementById('editRouteBtn');
            if (editBtn) {
                // Удаляем старые слушатели (через клонирование), чтобы не дублировать
                const newBtn = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newBtn, editBtn);
                
                newBtn.addEventListener('click', () => {
                    if (window.routeModal) {
                        window.routeModal.open();
                    }
                });
            } else {
                console.warn('[MapInfoPanel] Edit button not found after render');
            }
        }, 0);
    }

    let stagesHTML = '<div class="stages-header">🗺️ Этапы прогулки</div>';

    walkData.activities.forEach((activity, idx) => {
      const activityIcon = this.getActivityIcon(activity);
      const activityName = this.getActivityName(activity);
      const transportIcon = this.getTransportIcon(activity.transport_mode);
      
      let activityDetails = `${activity.duration_minutes} мин · ${transportIcon}`;
      
      if (activity.distance_meters) {
        activityDetails += ` · ${(activity.distance_meters / 1000).toFixed(2)} км`;
      }

      if (activity.activity_type === 'place' && activity.alternatives && activity.alternatives.length > 0) {
        const allVariants = [{
          place: activity.selected_place,
          category: activity.category,
          estimated_time_minutes: 0
        }, ...activity.alternatives];

        stagesHTML += `
          <div class="stage-card" data-stage="${idx}">
            <div class="stage-header">
              <span class="stage-icon">${activityIcon}</span>
              <div class="stage-info">
                <div class="stage-title">${activityName}</div>
                <div class="stage-details">${activityDetails}</div>
              </div>
            </div>
            <div class="stage-variants">
              <div class="variants-slider">
                ${allVariants.map((variant, vIdx) => `
                  <div class="variant-option ${vIdx === 0 ? 'active' : ''}" 
                       data-stage="${idx}" data-variant="${vIdx}">
                    <div class="variant-name">${variant.place.name}</div>
                    <div class="variant-category">${variant.category}</div>
                    ${variant.estimated_time_minutes > 0 ? `<div class="variant-time">~${variant.estimated_time_minutes} мин</div>` : ''}
                  </div>
                `).join('')}
              </div>
              <div class="slider-controls">
                <button class="slider-btn prev" data-stage="${idx}">‹</button>
                <span class="slider-counter">1 / ${allVariants.length}</span>
                <button class="slider-btn next" data-stage="${idx}">›</button>
              </div>
            </div>
          </div>
        `;
      } else {
        stagesHTML += `
          <div class="stage-card" data-stage="${idx}">
            <div class="stage-header">
              <span class="stage-icon">${activityIcon}</span>
              <div class="stage-info">
                <div class="stage-title">${activityName}</div>
                <div class="stage-details">${activityDetails}</div>
              </div>
            </div>
          </div>
        `;
      }
    });

    if (walkData.warnings && walkData.warnings.length > 0) {
      stagesHTML += '<div class="warnings-section">';
      stagesHTML += '<div class="warnings-header">⚠️ Предупреждения</div>';
      walkData.warnings.forEach(warning => {
        stagesHTML += `<div class="warning-item">${warning}</div>`;
      });
      stagesHTML += '</div>';
    }

    const listContainer = document.getElementById('routeStagesList');
    if (listContainer) {
        listContainer.innerHTML = stagesHTML;
    }

    // Инициализируем слайдеры вариантов, если модуль загружен
    if (window.MapVariants && typeof window.MapVariants.attachSliderHandlers === 'function') {
        // Также даем DOM время на обновление
        setTimeout(() => {
            window.MapVariants.attachSliderHandlers();
        }, 0);
    }

    const panel = document.getElementById('routeInfoPanel');
    if (panel) {
        panel.style.display = 'block';
    }
  },

  displaySimpleRouteInfo(route, routeData) {
    const routeInfo = route.getActiveRoute();
    const distance = (routeInfo.properties.get("distance").value / 1000).toFixed(2);
    const duration = this.formatDuration(routeInfo.properties.get("duration").value);

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

    const statsContainer = document.getElementById('routeInfoStats');
    if (statsContainer) {
        statsContainer.innerHTML = statsHTML;
    }
    
    const listContainer = document.getElementById('routeStagesList');
    if (listContainer) {
        listContainer.innerHTML = '';
    }
    
    const panel = document.getElementById('routeInfoPanel');
    if (panel) {
        panel.style.display = 'block';
    }
  },

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
        'магазин': '🛍️'
      };
      return icons[activity.category] || '📍';
    }
  },

  getActivityName(activity) {
    if (activity.activity_type === 'walk') {
      return activity.walking_style === 'scenic' ? 'Живописная прогулка' : 'Прямая прогулка';
    } else {
      return activity.selected_place ? activity.selected_place.name : activity.category;
    }
  },

  getTransportIcon(mode) {
    const icons = {
      'pedestrian': '🚶',
      'auto': '🚗',
      'bicycle': '🚴',
      'masstransit': '🚌'
    };
    return icons[mode] || '🚶';
  },

  getTransportLabel(mode) {
    const labels = {
      'pedestrian': 'Пешком',
      'auto': 'Авто',
      'bicycle': 'Велосипед',
      'masstransit': 'Транспорт'
    };
    return labels[mode] || mode;
  },

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    }
    return `${minutes} мин`;
  }
};
