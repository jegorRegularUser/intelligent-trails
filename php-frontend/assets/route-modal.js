class RouteModal {
  constructor() {
    this.modal = null;
    this.currentRouteType = "smart";
    this.waypoints = [];
    this.currentRoute = null;
    this.map = null;
    this.selectedCategories = [];
    this.activities = [];
    this.totalDuration = 0;
    this.draggedElement = null;
    this.editingActivityIndex = null;

    if (typeof ymaps !== "undefined" && ymaps.ready) {
      ymaps.ready(() => this.init());
    } else {
      window.addEventListener("load", () => {
        if (typeof ymaps !== "undefined") {
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
            <div id="smartRoutePanel" class="route-panel active">
              <div class="section-header">
                <span class="section-icon">📍</span>
                <h3>Откуда начинаем?</h3>
              </div>

              <div class="input-group">
                <input 
                  type="text" 
                  id="smartStartPoint" 
                  class="location-input" 
                  placeholder="Например: Москва, Красная площадь"
                  autocomplete="off"
                />
              </div>

              <div class="section-header" style="margin-top:25px;">
                <span class="section-icon">⏱️</span>
                <h3>Что будем делать?</h3>
                <p class="section-desc">Перетаскивайте активности для изменения порядка. Прогулка автоматически добавляется между местами.</p>
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

              <div class="add-activity-panel">
                <div class="activity-type-selector">
                  <button class="activity-type-btn" data-type="walk">
                    <span class="activity-icon">🚶</span>
                    <span>Прогулка</span>
                  </button>
                  <button class="activity-type-btn" data-type="place">
                    <span class="activity-icon">📍</span>
                    <span>Место</span>
                  </button>
                </div>
              </div>

              <div class="route-end-options" style="margin-top:25px;">
                <div class="section-header">
                  <span class="section-icon">🎯</span>
                  <h3>Куда придём?</h3>
                </div>
                <div class="route-end-options-grid">
                  <label class="radio-option">
                    <input type="radio" name="routeEnd" value="return" checked />
                    <div class="option-card">
                      <span class="option-icon">🔄</span>
                      <span>Вернуться к началу</span>
                    </div>
                  </label>
                  <label class="radio-option">
                    <input type="radio" name="routeEnd" value="custom" />
                    <div class="option-card">
                      <span class="option-icon">🎯</span>
                      <span>Закончить в другом месте</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="input-group" id="smartEndPointGroup" style="display: none; margin-top: 15px;">
                <input 
                  type="text" 
                  id="smartEndPoint" 
                  class="location-input" 
                  placeholder="Точка финиша"
                  autocomplete="off"
                />
              </div>
            </div>

            <div id="simpleRoutePanel" class="route-panel">
              <div class="section-header">
                <span class="section-icon">📍</span>
                <h3>Точки маршрута</h3>
              </div>
              <div class="input-group">
                <label>
                  <span class="point-icon start-icon">A</span>
                  Откуда
                </label>
                <input 
                  type="text" 
                  id="simpleStartPoint" 
                  class="location-input" 
                  placeholder="Начальная точка"
                  autocomplete="off"
                />
              </div>
              <div id="simpleWaypointsContainer"></div>
              <button class="add-waypoint-btn" id="addSimpleWaypoint">
                <span>+</span> Добавить промежуточную точку
              </button>
              <div class="input-group">
                <label>
                  <span class="point-icon end-icon">B</span>
                  Куда
                </label>
                <input 
                  type="text" 
                  id="simpleEndPoint" 
                  class="location-input" 
                  placeholder="Конечная точка"
                  autocomplete="off"
                />
              </div>
              <div class="section-header">
                <span class="section-icon">🚗</span>
                <h3>Способ передвижения</h3>
              </div>
              <div class="transport-mode-grid">
                <label class="transport-option">
                  <input type="radio" name="simpleTransport" value="auto" checked />
                  <div class="transport-card">
                    <span class="transport-icon">🚗</span>
                    <span>Авто</span>
                  </div>
                </label>
                <label class="transport-option">
                  <input type="radio" name="simpleTransport" value="pedestrian" />
                  <div class="transport-card">
                    <span class="transport-icon">🚶</span>
                    <span>Пешком</span>
                  </div>
                </label>
                <label class="transport-option">
                  <input type="radio" name="simpleTransport" value="masstransit" />
                  <div class="transport-card">
                    <span class="transport-icon">🚌</span>
                    <span>Транспорт</span>
                  </div>
                </label>
                <label class="transport-option">
                  <input type="radio" name="simpleTransport" value="bicycle" />
                  <div class="transport-card">
                    <span class="transport-icon">🚴</span>
                    <span>Велосипед</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" id="cancelRoute">Отмена</button>
            <button class="btn-primary" id="buildRoute">
              <span class="btn-icon">🗺️</span>
              <span id="buildBtnText">Построить прогулку</span>
            </button>
          </div>

          <div class="loading-overlay" id="loadingOverlay">
            <div class="spinner"></div>
            <p id="loadingText">Строим оптимальный маршрут...</p>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("routeModal");
  }

  attachEventListeners() {
    document.getElementById("closeModal").addEventListener("click", () => this.close());
    document.getElementById("cancelRoute").addEventListener("click", () => this.close());

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    document.querySelectorAll(".route-type-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchRouteType(e.currentTarget.dataset.type);
      });
    });

    document.querySelectorAll('input[name="routeEnd"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const endGroup = document.getElementById("smartEndPointGroup");
        endGroup.style.display = e.target.value === "custom" ? "block" : "none";
      });
    });

    document.querySelectorAll('.activity-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.type;
        this.editingActivityIndex = null;
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

    document.getElementById("buildRoute").addEventListener("click", () => this.buildRoute());
    document.getElementById("addSimpleWaypoint").addEventListener("click", () => this.addSimpleWaypoint());

    this.setupYandexSuggest("smartStartPoint");
    this.setupYandexSuggest("smartEndPoint");
    this.setupYandexSuggest("simpleStartPoint");
    this.setupYandexSuggest("simpleEndPoint");
    this.setupYandexSuggest("specificPlaceInput");

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (document.getElementById('addWalkModal').classList.contains('active')) {
          this.closeWalkModal();
        } else if (document.getElementById('addPlaceModal').classList.contains('active')) {
          this.closePlaceModal();
        } else if (this.modal.classList.contains("active")) {
          this.close();
        }
      }
    });
  }

  switchRouteType(type) {
    this.currentRouteType = type;
    document.querySelectorAll(".route-type-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });
    document.getElementById("smartRoutePanel").classList.toggle("active", type === "smart");
    document.getElementById("simpleRoutePanel").classList.toggle("active", type === "simple");
    const btnText = type === "smart" ? "Построить прогулку" : "Построить маршрут";
    document.getElementById("buildBtnText").textContent = btnText;
  }

  openWalkModal(editIndex = null) {
    this.editingActivityIndex = editIndex;
    if (editIndex !== null) {
      const activity = this.activities[editIndex];
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
  }

  closeWalkModal() {
    document.getElementById('addWalkModal').classList.remove('active');
    this.editingActivityIndex = null;
  }

  openPlaceModal(editIndex = null) {
    this.editingActivityIndex = editIndex;
    if (editIndex !== null) {
      const activity = this.activities[editIndex];
      document.getElementById('placeModalTitle').textContent = 'Редактировать место';
      document.getElementById('placeConfirmText').textContent = 'Сохранить';
      if (activity.specificPlaceAddress) {
        document.querySelector('.place-tab[data-tab="specific"]').click();
        document.getElementById('specificPlaceInput').value = activity.specificPlaceAddress;
      } else {
        document.querySelector('.place-tab[data-tab="category"]').click();
        document.querySelector(`input[name="placeCategory"][value="${activity.category}"]`).checked = true;
      }
      document.getElementById('placeStayTime').value = activity.time_at_place || 20;
      document.getElementById('placeTransport').value = activity.transport_mode;
    } else {
      document.getElementById('placeModalTitle').textContent = 'Добавить место';
      document.getElementById('placeConfirmText').textContent = 'Добавить';
      document.querySelector('.place-tab[data-tab="category"]').click();
      document.querySelector('input[name="placeCategory"][value="кафе"]').checked = true;
      document.getElementById('specificPlaceInput').value = '';
      document.getElementById('placeStayTime').value = 20;
      document.getElementById('placeTransport').value = 'pedestrian';
    }
    document.getElementById('addPlaceModal').classList.add('active');
  }

  closePlaceModal() {
    document.getElementById('addPlaceModal').classList.remove('active');
    this.editingActivityIndex = null;
  }

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

    if (this.editingActivityIndex !== null) {
      this.activities[this.editingActivityIndex] = activity;
    } else {
      this.activities.push(activity);
    }
    this.updateTimeline();
    this.closeWalkModal();
  }

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
      activity.category = document.querySelector('input[name="placeCategory"]:checked').value;
    } else {
      const placeAddress = document.getElementById('specificPlaceInput').value.trim();
      if (!placeAddress) {
        this.showNotification('⚠️ Укажите адрес или название места', 'error');
        return;
      }
      activity.specificPlaceAddress = placeAddress;
    }

    if (this.editingActivityIndex !== null) {
      this.activities[this.editingActivityIndex] = activity;
    } else {
      this.activities.push(activity);
    }
    this.updateTimeline();
    this.closePlaceModal();
  }

  updateTimeline() {
    const timeline = document.getElementById('activitiesTimeline');
    if (this.activities.length === 0) {
      timeline.innerHTML = '<div class="timeline-empty"><p>🎯 Добавьте активности, чтобы создать прогулку</p></div>';
      this.totalDuration = 0;
    } else {
      // Автоматически вставляем прогулки между местами
      const withWalks = [];
      for (let i = 0; i < this.activities.length; i++) {
        withWalks.push(this.activities[i]);
        if (i < this.activities.length - 1) {
          if (this.activities[i].type === 'place' && this.activities[i+1].type === 'place') {
            withWalks.push({
              type: 'walk',
              duration_minutes: 15,
              walking_style: 'scenic',
              transport_mode: 'pedestrian'
            });
          }
        }
      }
      this.totalDuration = 0;
      let html = '';
      withWalks.forEach((activity, index) => {
        this.totalDuration += activity.duration_minutes;

        let icon, title, details;
        if (activity.type === 'walk') {
          icon = activity.transport_mode === 'pedestrian' ? '🚶' :
                 activity.transport_mode === 'bicycle' ? '🚴' :
                 activity.transport_mode === 'auto' ? '🚗' : '🚌';
          title = activity.walking_style === 'scenic' ? 'Живописная прогулка' : 'Прямая прогулка';
          details = `<select class="transport-select-inline" data-index="${index}">
                       <option value="pedestrian" ${activity.transport_mode === 'pedestrian' ? 'selected' : ''}>🚶 Пешком</option>
                       <option value="bicycle" ${activity.transport_mode === 'bicycle' ? 'selected' : ''}>🚴 Велосипед</option>
                       <option value="auto" ${activity.transport_mode === 'auto' ? 'selected' : ''}>🚗 Авто</option>
                       <option value="masstransit" ${activity.transport_mode === 'masstransit' ? 'selected' : ''}>🚌 Транспорт</option>
                     </select>`;
        } else {
          icon = activity.category === 'кафе' ? '☕' :
                 activity.category === 'ресторан' ? '🍽️' :
                 activity.category === 'парк' ? '🌳' :
                 activity.category === 'музей' ? '🏛️' :
                 activity.category === 'памятник' ? '🗿' :
                 activity.category === 'бар' ? '🍺' :
                 activity.category === 'магазин' ? '🛍️' : '📍';
          title = activity.specificPlaceAddress || activity.category;
          details = `${activity.time_at_place || activity.duration_minutes} мин на месте`;
        }

        html += `
          <div class="timeline-item" data-index="${index}" draggable="true">
            <div class="timeline-item-icon">${icon}</div>
            <div class="timeline-item-content">
              <div class="timeline-item-title">${title}</div>
              <div class="timeline-item-details">${details}</div>
            </div>
          </div>
        `;
      });
      timeline.innerHTML = html;
      document.getElementById('totalTimeDisplay').textContent = `${this.totalDuration} мин`;

      document.querySelectorAll('.transport-select-inline').forEach(select => {
        select.addEventListener('change', (e) => {
          const index = parseInt(e.target.dataset.index);
          const newMode = e.target.value;
          if (withWalks[index] && withWalks[index].type === 'walk') {
            withWalks[index].transport_mode = newMode;
            this.applyWalkTransportToActivities(withWalks);
            this.updateTimeline();
          }
        });
      });
    }
  }

  applyWalkTransportToActivities(withWalks) {
    let newActivities = [];
    for (let i = 0, j = 0; i < withWalks.length; i++) {
      if (withWalks[i].type === 'walk') {
        if (j < this.activities.length && this.activities[j].type === 'place') {
          newActivities.push(this.activities[j]);
          j++;
        }
        newActivities.push({
          type: 'walk',
          transport_mode: withWalks[i].transport_mode,
          duration_minutes: withWalks[i].duration_minutes,
          walking_style: withWalks[i].walking_style || 'scenic'
        });
      } else {
        if (j < this.activities.length) {
          newActivities.push(this.activities[j]);
          j++;
        }
      }
    }
    this.activities = newActivities.filter((act, idx, self) => !(act.type === 'walk' && idx > 0 && self[idx-1].type === 'walk'));
  }

  handleDragStart(e) {
    this.draggedElement = e.currentTarget;
    e.currentTarget.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  }

  handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = e.currentTarget;
    if (target !== this.draggedElement) {
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
  }

  handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (this.draggedElement !== e.currentTarget) {
      const draggedIndex = parseInt(this.draggedElement.dataset.index);
      const targetIndex = parseInt(e.currentTarget.dataset.index);

      const placesOnly = this.activities.filter(act => act.type === 'place');
      const movedActivity = placesOnly[draggedIndex];
      placesOnly.splice(draggedIndex, 1);
      placesOnly.splice(targetIndex, 0, movedActivity);
      this.activities = placesOnly;
      this.updateTimeline();
    }
    return false;
  }

  handleDragEnd(e) {
    e.currentTarget.style.opacity = '';
    document.querySelectorAll('.timeline-item').forEach(item => {
      item.style.borderTop = '';
      item.style.borderBottom = '';
    });
  }

  setupYandexSuggest(inputId) {
    const input = document.getElementById(inputId);
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(input, { results: 5 });
    }
  }

  setupYandexSuggestForElement(element) {
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(element, { results: 5 });
    }
  }

  addSimpleWaypoint() {
    const waypointIndex = this.waypoints.length;
    const waypointHTML = `
      <div class="input-group waypoint-group" data-index="${waypointIndex}">
        <label>
          <span class="point-icon waypoint-icon">${waypointIndex + 1}</span>
          Промежуточная точка ${waypointIndex + 1}
        </label>
        <div class="waypoint-input-wrapper">
          <input type="text" class="location-input waypoint-input" 
                 placeholder="Адрес промежуточной точки"
                 data-index="${waypointIndex}" autocomplete="off" />
          <button class="remove-waypoint-btn" data-index="${waypointIndex}">&times;</button>
        </div>
      </div>
    `;

    document.getElementById("simpleWaypointsContainer").insertAdjacentHTML("beforeend", waypointHTML);
    this.waypoints.push("");

    document.querySelector(`.remove-waypoint-btn[data-index="${waypointIndex}"]`)
      .addEventListener("click", (e) => {
        this.removeWaypoint(parseInt(e.target.dataset.index));
      });

    const waypointInput = document.querySelector(`.waypoint-input[data-index="${waypointIndex}"]`);
    this.setupYandexSuggestForElement(waypointInput);
  }

  removeWaypoint(index) {
    const waypointGroup = document.querySelector(`.waypoint-group[data-index="${index}"]`);
    if (waypointGroup) {
      waypointGroup.remove();
      this.waypoints[index] = null;
    }
  }

  async buildRoute() {
    if (this.currentRouteType === "smart") {
      if (!this.validateTransport()) {
        if (confirm("Некоторые прогулки не имеют выбранного способа передвижения.\n\nЖелаете установить 'пешком' для всех пустых?")) {
          this.setDefaultTransportToEmpty();
          this.updateTimeline();
        } else {
          return;
        }
      }
      await this.buildSmartWalk();
    } else {
      await this.buildSimpleRoute();
    }
  }

  validateTransport() {
    for (const activity of this.activities) {
      if (activity.type === 'walk' && (!activity.transport_mode || activity.transport_mode === '')) {
        return false;
      }
    }
    return true;
  }

  setDefaultTransportToEmpty() {
    for (let i = 0; i < this.activities.length; i++) {
      if (this.activities[i].type === 'walk' && (!this.activities[i].transport_mode || this.activities[i].transport_mode === '')) {
        this.activities[i].transport_mode = 'pedestrian';
      }
    }
  }

    async buildSmartWalk() {
    const startPoint = document.getElementById('smartStartPoint').value.trim();

    if (!startPoint) {
      this.showNotification('⚠️ Укажите точку старта', 'error');
      return;
    }

    if (this.activities.length === 0) {
      this.showNotification('⚠️ Добавьте хотя бы одну активность', 'error');
      return;
    }

    const returnToStart = document.querySelector('input[name="routeEnd"]:checked').value === 'return';
    const endPoint = returnToStart ? null : document.getElementById('smartEndPoint').value.trim();

    if (!returnToStart && !endPoint) {
      this.showNotification('⚠️ Укажите точку финиша или выберите возврат к началу', 'error');
      return;
    }

    this.showLoading(true, 'Определяем координаты...');

    try {
      const startCoords = await this.geocodeAddress(startPoint);
      let endCoords = null;
      if (!returnToStart && endPoint) {
        endCoords = await this.geocodeAddress(endPoint);
      }

      const activitiesData = [];
      for (const activity of this.activities) {
        const actData = { ...activity };

        if (activity.type === 'place' && activity.specificPlaceAddress) {
          try {
            const coords = await this.geocodeAddress(activity.specificPlaceAddress);
            actData.specific_place = {
              name: activity.specificPlaceAddress,
              coords: coords
            };
            delete actData.specificPlaceAddress;
          } catch (e) {
            this.showLoading(false);
            this.showNotification(`⚠️ Не удалось найти место: ${activity.specificPlaceAddress}`, 'error');
            return;
          }
        }

        activitiesData.push(actData);
      }

      const requestData = {
        start_point: {
          name: startPoint,
          coords: startCoords
        },
        activities: activitiesData,
        return_to_start: returnToStart,
        end_point: endCoords ? {
          name: endPoint,
          coords: endCoords
        } : null
      };

      this.showLoading(true, 'Строим прогулку с учетом ваших активностей...');

      const response = await fetch('api.php?action=build_smart_walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (result.success) {
        this.currentRoute = result.data;
        this.close();
        window.displaySmartWalk(result.data, requestData.start_point, requestData.end_point, returnToStart);

        let message = '✅ Прогулка построена!';
        if (result.data.warnings && result.data.warnings.length > 0) {
          message = '✅ Прогулка построена!\n\n⚠️ ' + result.data.warnings.join('\n⚠️ ');
        }

        setTimeout(() => {
          this.showNotification(message, result.data.warnings && result.data.warnings.length > 0 ? 'warning' : 'success');
        }, 300);

      } else {
        let errorMessage = '❌ Не удалось построить прогулку';
        if (result.error) {
          errorMessage = `❌ ${result.error}`;
        }
        this.showNotification(errorMessage, 'error');
        console.error('Backend error:', result);
      }
    } catch (error) {
      console.error('Error building smart walk:', error);
      this.showNotification('❌ Ошибка соединения с сервером', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async buildSimpleRoute() {
    const startPoint = document.getElementById('simpleStartPoint').value.trim();
    const endPoint = document.getElementById('simpleEndPoint').value.trim();
    const mode = document.querySelector('input[name="simpleTransport"]:checked').value;

    if (!startPoint || !endPoint) {
      this.showNotification('⚠️ Укажите начальную и конечную точки', 'error');
      return;
    }

    const waypoints = [];
    document.querySelectorAll('.waypoint-input').forEach(input => {
      const value = input.value.trim();
      if (value) waypoints.push(value);
    });

    const routeData = {
      start_point: startPoint,
      end_point: endPoint,
      waypoints: waypoints,
      mode: mode
    };

    this.showLoading(true, 'Строим маршрут...');

    try {
      const response = await fetch('api.php?action=build_simple_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeData)
      });

      const result = await response.json();

      if (result.success) {
        this.close();
        window.displaySimpleRoute(result.data);
        setTimeout(() => {
          this.showNotification('✅ Маршрут построен!', 'success');
        }, 300);
      } else {
        let errorMessage = '❌ Не удалось построить маршрут';
        if (result.error) {
          errorMessage = `❌ ${result.error}`;
        }
        this.showNotification(errorMessage, 'error');
        console.error('Backend error:', result);
      }
    } catch (error) {
      console.error('Error building simple route:', error);
      this.showNotification('❌ Ошибка соединения с сервером', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    if (message.length > 150 || message.split('\n').length > 4) {
      notification.classList.add('long');
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);

    const duration = message.length > 150 ? 7000 : 5000;

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 400);
    }, duration);
  }

  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(address, { results: 1 }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            const coords = firstGeoObject.geometry.getCoordinates();
            resolve(coords);
          } else {
            reject(new Error("Адрес не найден"));
          }
        },
        (error) => reject(error)
      );
    });
  }

  showLoading(show, text = 'Строим оптимальный маршрут...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    if (show) {
      overlay.classList.add('active');
      if (text) loadingText.textContent = text;
    } else {
      overlay.classList.remove('active');
    }
     
  }
   setMap(mapInstance) {
    this.map = mapInstance;
  }
}
    

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.routeModal = new RouteModal();
  });
} else {
  window.routeModal = new RouteModal();
}
