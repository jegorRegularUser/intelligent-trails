/**
 * Route Modal Template
 * ИСПРАВЛЕНО: Добавлены кнопки "Выбрать на карте" для начальной и конечной точек
 */

window.RouteModalTemplate = {
  getHTML() {
    return `
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
            ${this.getSmartRoutePanel()}
            ${this.getSimpleRoutePanel()}
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

      ${this.getWalkModal()}
      ${this.getPlaceModal()}
    `;
  },

  getSmartRoutePanel() {
    return `
      <div id="smartRoutePanel" class="route-panel active">
        <div class="section-header">
          <span class="section-icon">📍</span>
          <h3>Откуда начинаем?</h3>
        </div>

        <div class="input-group">
          <div style="display: flex; gap: 10px;">
            <input 
              type="text" 
              id="smartStartPoint" 
              class="location-input" 
              placeholder="Например: Москва, Красная площадь"
              autocomplete="off"
              style="flex: 1;"
            />
            <button 
              id="pickStartPointBtn" 
              class="map-picker-btn" 
              type="button"
              title="Выбрать на карте"
            >
              🗺️
            </button>
          </div>
          <small style="color: #666; margin-top: 5px; display: block;">
            💡 Введите адрес или кликните 🗺️ чтобы выбрать на карте
          </small>
        </div>

        <div class="section-header" style="margin-top: 25px;">
          <span class="section-icon">⏱️</span>
          <h3>Что будем делать?</h3>
          <p class="section-desc">Перетаскивайте активности для изменения порядка</p>
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

        <div class="route-end-options" style="margin-top: 25px;">
          <div class="section-header">
            <span class="section-icon">🎯</span>
            <h3>Куда придём?</h3>
          </div>
          
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
          
          <label class="radio-option">
            <input type="radio" name="routeEnd" value="smart" />
            <div class="option-card">
              <span class="option-icon">🤖</span>
              <span>Закончить в интересном месте</span>
            </div>
          </label>
        </div>

        <div class="input-group" id="smartEndPointGroup" style="display: none; margin-top: 15px;">
          <div style="display: flex; gap: 10px;">
            <input 
              type="text" 
              id="smartEndPoint" 
              class="location-input" 
              placeholder="Точка финиша"
              autocomplete="off"
              style="flex: 1;"
            />
            <button 
              id="pickEndPointBtn" 
              class="map-picker-btn" 
              type="button"
              title="Выбрать на карте"
            >
              🗺️
            </button>
          </div>
        </div>
      </div>
    `;
  },

  getSimpleRoutePanel() {
    return `
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
    `;
  },

  getWalkModal() {
    return `
      <div id="addWalkModal" class="activity-modal">
        <div class="activity-modal-content">
          <div class="activity-modal-header">
            <h3>🚶 <span id="walkModalTitle">Добавить прогулку</span></h3>
            <button class="modal-close" id="closeWalkModal">&times;</button>
          </div>
          <div class="activity-modal-body">
            <div class="input-group">
              <label>⏱️ Длительность прогулки</label>
              <div class="time-selector-compact">
                <input type="number" id="walkDuration" value="30" min="5" max="180" step="5" />
                <span>минут</span>
              </div>
            </div>
            
            <div class="input-group">
              <label>🎨 Стиль прогулки</label>
              <div class="walk-style-selector">
                <label class="style-option">
                  <input type="radio" name="walkStyle" value="scenic" checked />
                  <div class="style-card">
                    <span class="style-icon">🌳</span>
                    <div>
                      <strong>Живописная</strong>
                      <p>Через парки и красивые места</p>
                    </div>
                  </div>
                </label>
                <label class="style-option">
                  <input type="radio" name="walkStyle" value="direct" />
                  <div class="style-card">
                    <span class="style-icon">➡️</span>
                    <div>
                      <strong>Прямая</strong>
                      <p>Кратчайший путь к следующей точке</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div class="input-group">
              <label>🚶 Способ передвижения</label>
              <select id="walkTransport" class="transport-select">
                <option value="pedestrian">🚶 Пешком</option>
                <option value="bicycle">🚴 Велосипед</option>
                <option value="auto">🚗 Авто</option>
                <option value="masstransit">🚌 Транспорт</option>
              </select>
            </div>
          </div>
          <div class="activity-modal-footer">
            <button class="btn-secondary" id="cancelWalk">Отмена</button>
            <button class="btn-primary" id="confirmWalk">
              <span id="walkConfirmText">Добавить</span>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  getPlaceModal() {
    return `
      <div id="addPlaceModal" class="activity-modal">
        <div class="activity-modal-content">
          <div class="activity-modal-header">
            <h3>📍 <span id="placeModalTitle">Добавить место</span></h3>
            <button class="modal-close" id="closePlaceModal">&times;</button>
          </div>
          <div class="activity-modal-body">
            <div class="place-type-tabs">
              <button class="place-tab active" data-tab="category">Категория</button>
              <button class="place-tab" data-tab="specific">Конкретное место</button>
            </div>

            <div id="categoryTab" class="place-tab-content active">
              <div class="input-group">
                <label>🏛️ Выберите категорию</label>
                <div class="category-grid-compact">
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="кафе" checked />
                    <span>☕ Кафе</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="ресторан" />
                    <span>🍽️ Ресторан</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="парк" />
                    <span>🌳 Парк</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="музей" />
                    <span>🏛️ Музей</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="памятник" />
                    <span>🗿 Памятник</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="бар" />
                    <span>🍺 Бар</span>
                  </label>
                  <label class="category-compact">
                    <input type="radio" name="placeCategory" value="магазин" />
                    <span>🛍️ Магазин</span>
                  </label>
                </div>
              </div>
            </div>

            <div id="specificTab" class="place-tab-content">
              <div class="input-group">
                <label>📍 Адрес или название</label>
                <input 
                  type="text" 
                  id="specificPlaceInput" 
                  class="location-input" 
                  placeholder="Введите адрес или название места"
                  autocomplete="off"
                />
              </div>
            </div>

            <div class="input-group">
              <label>🕐 Время на месте</label>
              <div class="time-selector-compact">
                <input type="number" id="placeStayTime" value="20" min="5" max="120" step="5" />
                <span>минут</span>
              </div>
            </div>

            <div class="input-group">
              <label>🚶 Как добираться до места?</label>
              <select id="placeTransport" class="transport-select">
                <option value="pedestrian">🚶 Пешком</option>
                <option value="bicycle">🚴 Велосипед</option>
                <option value="auto">🚗 Авто</option>
                <option value="masstransit">🚌 Транспорт</option>
              </select>
            </div>
          </div>
          <div class="activity-modal-footer">
            <button class="btn-secondary" id="cancelPlace">Отмена</button>
            <button class="btn-primary" id="confirmPlace">
              <span id="placeConfirmText">Добавить</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
};
