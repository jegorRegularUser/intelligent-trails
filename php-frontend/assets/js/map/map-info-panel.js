window.MapInfoPanel = {
  displayWalkInfo(walkData, pointsInfo) {
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
    `;

    document.getElementById('routeInfoStats').innerHTML = statsHTML;

    let stagesHTML = '<div class="stages-header">🗺️ Этапы прогулки</div>';

    walkData.activities.forEach((activity, idx) => {
      const activityIcon = this.getActivityIcon(activity);
      const activityName = this.getActivityName(activity);
      const transportIcon = this.getTransportIcon(activity.transport_mode);
      const activityDetails = `${activity.duration_minutes} мин · ${transportIcon}`;

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

    document.getElementById('routeStagesList').innerHTML = stagesHTML;

    window.MapVariants.attachSliderHandlers();

    document.getElementById('routeInfoPanel').style.display = 'block';
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

    document.getElementById('routeInfoStats').innerHTML = statsHTML;
    document.getElementById('routeStagesList').innerHTML = '';
    document.getElementById('routeInfoPanel').style.display = 'block';
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
