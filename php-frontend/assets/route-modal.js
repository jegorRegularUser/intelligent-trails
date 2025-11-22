class RouteModal {
  constructor() {
    this.modal = null;
    this.currentRouteType = "smart";
    this.waypoints = [];
    this.currentRoute = null;
    this.map = null;
    this.selectedCategories = [];
    this.stages = []; // Этапы прогулки
    this.currentStageVariants = {}; // Варианты для каждого этапа
    
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
                                <div class="type-desc">Поэтапный конструктор</div>
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
                        <!-- НОВЫЙ ПАНЕЛЬ: ПОЭТАПНАЯ ПРОГУЛКА -->
                        <div id="smartRoutePanel" class="route-panel active">
                            <div class="section-header">
                                <span class="section-icon">📍</span>
                                <h3>Точка старта</h3>
                            </div>

                            <div class="input-group">
                                <label>
                                    <span class="point-icon start-icon">A</span>
                                    Откуда начинаем прогулку?
                                </label>
                                <input 
                                    type="text" 
                                    id="smartStartPoint" 
                                    class="location-input" 
                                    placeholder="Например: Москва, Красная площадь"
                                    autocomplete="off"
                                />
                            </div>

                            <div class="section-header">
                                <span class="section-icon">🎯</span>
                                <h3>Этапы прогулки</h3>
                                <p class="section-desc">Создайте последовательность мест, которые хотите посетить</p>
                            </div>

                            <div id="stagesContainer" class="stages-container">
                                <!-- Этапы будут добавляться динамически -->
                            </div>

                            <button class="add-stage-btn" id="addStageBtn">
                                <span>+</span> Добавить этап
                            </button>

                            <div class="route-end-options" style="margin-top: 20px;">
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

                            <div class="input-group" id="smartEndPointGroup" style="display: none;">
                                <label>
                                    <span class="point-icon end-icon">B</span>
                                    Точка финиша
                                </label>
                                <input 
                                    type="text" 
                                    id="smartEndPoint" 
                                    class="location-input" 
                                    placeholder="Куда хотите прийти?"
                                    autocomplete="off"
                                />
                            </div>
                        </div>

                        <!-- ПРОСТОЙ МАРШРУТ -->
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
                            <span id="buildBtnText">Построить маршрут</span>
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
    
    // Добавляем первый этап по умолчанию
    this.addStage();
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

    document.getElementById("buildRoute").addEventListener("click", () => this.buildRoute());
    document.getElementById("addSimpleWaypoint").addEventListener("click", () => this.addSimpleWaypoint());
    document.getElementById("addStageBtn").addEventListener("click", () => this.addStage());

    this.setupYandexSuggest("smartStartPoint");
    this.setupYandexSuggest("smartEndPoint");
    this.setupYandexSuggest("simpleStartPoint");
    this.setupYandexSuggest("simpleEndPoint");

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal.classList.contains("active")) {
        this.close();
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

  addStage() {
    const stageIndex = this.stages.length;
    const stageHTML = `
      <div class="stage-card" data-stage="${stageIndex}">
        <div class="stage-header">
          <span class="stage-number">Этап ${stageIndex + 1}</span>
          <button class="remove-stage-btn" data-stage="${stageIndex}">&times;</button>
        </div>
        
        <div class="stage-body">
          <div class="stage-row">
            <div class="stage-field">
              <label>⏱️ Время (мин)</label>
              <input type="number" class="stage-duration" data-stage="${stageIndex}" 
                     value="30" min="5" max="180" step="5" />
            </div>
            
            <div class="stage-field">
              <label>🚶 Передвижение</label>
              <select class="stage-transport" data-stage="${stageIndex}">
                <option value="pedestrian">Пешком</option>
                <option value="auto">Авто</option>
                <option value="bicycle">Велосипед</option>
                <option value="masstransit">Транспорт</option>
              </select>
            </div>
          </div>
          
          <div class="stage-place-type">
            <label class="radio-option-inline">
              <input type="radio" name="placeType${stageIndex}" value="category" 
                     class="stage-place-type-radio" data-stage="${stageIndex}" checked />
              <span>Категория места</span>
            </label>
            <label class="radio-option-inline">
              <input type="radio" name="placeType${stageIndex}" value="specific" 
                     class="stage-place-type-radio" data-stage="${stageIndex}" />
              <span>Конкретное место</span>
            </label>
          </div>
          
          <div class="stage-category-select" data-stage="${stageIndex}">
            <label>🏛️ Категория</label>
            <select class="stage-category" data-stage="${stageIndex}">
              <option value="кафе">☕ Кафе</option>
              <option value="парк">🌳 Парк</option>
              <option value="музей">🏛️ Музей</option>
              <option value="памятник">🗿 Памятник</option>
              <option value="ресторан">🍽️ Ресторан</option>
              <option value="бар">🍺 Бар</option>
              <option value="магазин">🛍️ Магазин</option>
            </select>
          </div>
          
          <div class="stage-specific-place" data-stage="${stageIndex}" style="display: none;">
            <label>📍 Адрес или название</label>
            <input type="text" class="stage-place-input location-input" 
                   data-stage="${stageIndex}" placeholder="Введите адрес или название места" />
          </div>
        </div>
      </div>
    `;

    document.getElementById("stagesContainer").insertAdjacentHTML("beforeend", stageHTML);
    
    this.stages.push({
      duration: 30,
      transport: 'pedestrian',
      placeType: 'category',
      category: 'кафе',
      specificPlace: null
    });

    // Обработчики для нового этапа
    const stageCard = document.querySelector(`.stage-card[data-stage="${stageIndex}"]`);
    
    stageCard.querySelector('.remove-stage-btn').addEventListener('click', () => {
      this.removeStage(stageIndex);
    });

    stageCard.querySelectorAll('.stage-place-type-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const categoryDiv = stageCard.querySelector('.stage-category-select');
        const specificDiv = stageCard.querySelector('.stage-specific-place');
        
        if (e.target.value === 'category') {
          categoryDiv.style.display = 'block';
          specificDiv.style.display = 'none';
        } else {
          categoryDiv.style.display = 'none';
          specificDiv.style.display = 'block';
        }
      });
    });

    // Автодополнение для конкретного места
    const placeInput = stageCard.querySelector('.stage-place-input');
    this.setupYandexSuggestForElement(placeInput);
  }

  removeStage(index) {
    const stageCard = document.querySelector(`.stage-card[data-stage="${index}"]`);
    if (stageCard) {
      stageCard.remove();
      this.stages[index] = null;
    }
    
    // Пересчитываем номера оставшихся этапов
    const remainingStages = document.querySelectorAll('.stage-card');
    remainingStages.forEach((card, idx) => {
      card.querySelector('.stage-number').textContent = `Этап ${idx + 1}`;
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
      await this.buildSmartWalk();
    } else {
      await this.buildSimpleRoute();
    }
  }

  async buildSmartWalk() {
    const startPoint = document.getElementById('smartStartPoint').value.trim();
    
    if (!startPoint) {
      this.showNotification('⚠️ Укажите точку старта', 'error');
      return;
    }

    // Собираем данные об этапах
    const stagesData = [];
    const stageCards = document.querySelectorAll('.stage-card');
    
    if (stageCards.length === 0) {
      this.showNotification('⚠️ Добавьте хотя бы один этап прогулки', 'error');
      return;
    }

    for (const card of stageCards) {
      const stageIndex = parseInt(card.dataset.stage);
      const duration = parseInt(card.querySelector('.stage-duration').value);
      const transport = card.querySelector('.stage-transport').value;
      const placeType = card.querySelector('input[name="placeType' + stageIndex + '"]:checked').value;
      
      let stageData = {
        duration_minutes: duration,
        transport_mode: transport,
        alternatives_count: 3
      };

      if (placeType === 'category') {
        const category = card.querySelector('.stage-category').value;
        stageData.category = category;
      } else {
        const placeAddress = card.querySelector('.stage-place-input').value.trim();
        if (!placeAddress) {
          this.showNotification(`⚠️ Этап ${stageCards.length > 1 ? stageIndex + 1 : ''}: укажите место или выберите категорию`, 'error');
          return;
        }
        
        // Геокодируем конкретное место
        try {
          this.showLoading(true, 'Определяем координаты мест...');
          const coords = await this.geocodeAddress(placeAddress);
          stageData.specific_place = {
            name: placeAddress,
            coords: coords
          };
        } catch (e) {
          this.showLoading(false);
          this.showNotification(`⚠️ Не удалось найти место: ${placeAddress}`, 'error');
          return;
        }
      }

      stagesData.push(stageData);
    }

    const returnToStart = document.querySelector('input[name="routeEnd"]:checked').value === 'return';
    const endPoint = returnToStart ? null : document.getElementById('smartEndPoint').value.trim();

    if (!returnToStart && !endPoint) {
      this.showNotification('⚠️ Укажите точку финиша или выберите возврат к началу', 'error');
      return;
    }

    this.showLoading(true, 'Геокодируем адреса...');
    
    try {
      const startCoords = await this.geocodeAddress(startPoint);
      let endCoords = null;
      
      if (!returnToStart && endPoint) {
        endCoords = await this.geocodeAddress(endPoint);
      }

      const requestData = {
        start_point: {
          name: startPoint,
          coords: startCoords
        },
        stages: stagesData,
        return_to_start: returnToStart,
        end_point: endCoords ? {
          name: endPoint,
          coords: endCoords
        } : null
      };

      this.showLoading(true, 'Ищем места и строим оптимальный маршрут...');

      const response = await fetch('api.php?action=build_smart_walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (result.success) {
        this.currentRoute = result.data;
        this.close();
        this.displaySmartWalkOnMap(result.data, requestData.start_point, requestData.end_point, returnToStart);
        
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

  displaySmartWalkOnMap(walkData, startPoint, endPoint, returnToStart) {
    if (!window.displaySmartWalk) {
      // Создаем функцию отображения, если её нет
      window.displaySmartWalk = (data, start, end, returnStart) => {
        // Здесь будет логика отображения с интерактивными слайдерами
        console.log('Smart walk data:', data);
        
        // Пока используем старую функцию отображения
        if (window.displaySmartRoute) {
          // Преобразуем данные в старый формат
          const points = [start];
          data.stages.forEach(stage => {
            points.push(stage.selected_place);
          });
          if (returnStart) {
            points.push(start);
          } else if (end) {
            points.push(end);
          }
          
          window.displaySmartRoute({
            ordered_route: points,
            total_time_minutes: data.total_time_minutes,
            warnings: data.warnings || []
          });
        }
      };
    }
    
    window.displaySmartWalk(walkData, startPoint, endPoint, returnToStart);
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
        this.displaySimpleRouteOnMap(result.data);
        
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

  displaySimpleRouteOnMap(routeData) {
    if (window.displaySimpleRoute) {
      window.displaySimpleRoute(routeData);
    }
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

  open() {
    this.modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  close() {
    this.modal.classList.remove("active");
    document.body.style.overflow = "";
    this.resetForm();
  }

  resetForm() {
    document.getElementById("smartStartPoint").value = "";
    document.getElementById("smartEndPoint").value = "";
    document.getElementById("simpleStartPoint").value = "";
    document.getElementById("simpleEndPoint").value = "";
    document.getElementById("simpleWaypointsContainer").innerHTML = "";
    document.getElementById("stagesContainer").innerHTML = "";
    this.waypoints = [];
    this.stages = [];
    this.addStage(); // Добавляем один этап по умолчанию
    
    document.querySelector('input[name="routeEnd"][value="return"]').checked = true;
    document.querySelector('input[name="simpleTransport"][value="auto"]').checked = true;
    document.getElementById("smartEndPointGroup").style.display = "none";
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
