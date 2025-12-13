# 4️⃣ РАСШИРЕННЫЙ РАЗДЕЛ: Интерактивная карта, система маршрутов и backend архитектура

---

## 4.1 Общая архитектура страницы map.php и её компоненты

### 4.1.1 Структура HTML-разметки

Страница `map.php` является основным интерфейсом приложения Intelligent Trails. Она представляет собой комплексное веб-приложение для интерактивного построения и визуализации маршрутов в реальном времени.

**Основной контейнер главной страницы:**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/modal-styles.css">
    <link rel="stylesheet" href="assets/styles/map-controls.css">
    <link rel="stylesheet" href="assets/styles/route-info-panel.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193&suggest_apikey=1019e534-8f99-42e2-85b2-d0c7ed9ccca2"></script>
</head>
<body <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>data-logged-in="true"<?php endif; ?>>
    <?php require_once "components/navigation.php"; ?>

    <main class="map-page-container">
        <!-- Основной контейнер карты -->
        <div id="map" class="map-container">
            <!-- Легенда карты (показывает типы объектов) -->
            <div id="map-legend" class="map-legend"></div>
            <!-- Панель информации о карте -->
            <div id="map-info-panel" class="map-info"></div>
        </div>

        <!-- Плавающая кнопка действия (FAB) -->
        <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
            <span class="fab-icon">✨</span>
            <span class="fab-text">Построить маршрут</span>
        </button>

        <!-- Информационная панель с деталями маршрута -->
        <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
            <div class="route-info-header">
                <h3>📊 Ваша прогулка</h3>
                <button class="close-panel-btn" id="closeRouteInfo" title="Закрыть">&times;</button>
            </div>
            
            <!-- Статистика маршрута -->
            <div class="route-info-stats" id="routeInfoStats">
                <div class="stat-item">
                    <span class="stat-icon">📏</span>
                    <span class="stat-label">Расстояние</span>
                    <span class="stat-value">-- км</span>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">⏱️</span>
                    <span class="stat-label">Время</span>
                    <span class="stat-value">-- минут</span>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">🚗</span>
                    <span class="stat-label">Транспорт</span>
                    <span class="stat-value">--</span>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">📍</span>
                    <span class="stat-label">Точки</span>
                    <span class="stat-value">--</span>
                </div>
            </div>
            
            <!-- Список этапов маршрута -->
            <div class="route-stages-list" id="routeStagesList">
                <!-- Заполняется динамически -->
            </div>
        </div>

        <!-- Модальное окно для построения маршрутов (подгружается через JavaScript) -->
        <div id="routeModal" class="modal" style="display: none;">
            <!-- Содержимое заполняется в route-modal-core.js -->
        </div>
    </main>

    <!-- JavaScript модули для управления картой -->
    <script src="assets/js/event-bus.js"></script>
    <script src="assets/js/state-manager.js"></script>
    
    <!-- Скрипты для модального окна -->
    <script src="assets/js/route-modal/route-modal-template.js"></script>
    <script src="assets/js/route-modal/route-modal-yandex.js"></script>
    <script src="assets/js/route-modal/route-modal-waypoints.js"></script>
    <script src="assets/js/route-modal/route-modal-activities.js"></script>
    <script src="assets/js/route-modal/route-modal-builder.js"></script>
    <script src="assets/js/route-modal/route-modal-core.js"></script>

    <!-- Скрипты для управления картой -->
    <script src="assets/js/map/map-place-markers.js"></script>
    <script src="assets/js/map/map-info-panel.js"></script>
    <script src="assets/js/map/map-route-builder.js"></script>
    <script src="assets/js/map/map-smart-walk.js"></script>
    <script src="assets/js/map/map-core.js"></script>

    <!-- Инициализация карты -->
    <script>
    ymaps.ready(function() {
        console.log('[MAP.PHP] Yandex Maps готовы, инициализация...');
        if (window.MapCore) {
            window.MapCore.init();
        } else {
            console.error('[MAP.PHP] MapCore не найден!');
        }
    });
    </script>
</body>
</html>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Полная страница карты с построенным маршрутом, FAB кнопка видна, информационная панель справа - Рисунок 4.1]

### 4.1.2 Архитектура MapCore класса

```javascript
window.MapCore = {
    // Свойства
    myMap: null,
    myGeoObjects: [],
    currentRoute: null,
    currentRoutePOIs: [],
    selectedMode: 'driving',
    
    // Инициализация
    init: function() {
        console.log('[MapCore] Инициализация...');
        
        // 1. Создание карты
        this.createMap();
        
        // 2. Добавление элементов управления
        this.setupControls();
        
        // 3. Подписка на события
        this.attachEventListeners();
        
        // 4. Инициализация модального окна
        this.setupRouteModal();
        
        // 5. Восстановление последнего маршрута из параметров URL (если есть)
        this.restoreFromURL();
        
        console.log('[MapCore] Инициализация завершена');
    },
    
    createMap: function() {
        this.myMap = new ymaps.Map('map', {
            center: [55.755814, 37.617635], // Красная площадь, Москва
            zoom: 13,
            type: 'mapType.map',
            controls: ['zoomControl', 'fullscreenControl', 'typeSelector'],
            behaviors: ['drag', 'scrollZoom', 'dblClickZoom', 'rightMouseButtonMagnifier']
        });
    },
    
    setupControls: function() {
        // Установка элементов управления
        this.myMap.controls.get('zoomControl').options.set({
            position: { right: 10, top: 10 }
        });
    },
    
    attachEventListeners: function() {
        // Клик на карту
        this.myMap.events.add('click', (e) => {
            const coords = e.get('coords');
            console.log('[MapCore] Клик на карту:', coords);
        });
        
        // Изменение границ карты
        this.myMap.events.add('boundschange', (e) => {
            console.log('[MapCore] Границы карты изменились');
        });
        
        // Клик на кнопку построения маршрута
        document.getElementById('openRouteModal')?.addEventListener('click', () => {
            this.showRouteModal();
        });
    },
    
    setupRouteModal: function() {
        // Инициализация системы для построения маршрутов
        if (window.RouteModalCore) {
            window.RouteModalCore.init();
        }
    },
    
    restoreFromURL: function() {
        // Восстановление маршрута из URL параметра (для восстановления из истории)
        const urlParams = new URLSearchParams(window.location.search);
        const routeData = urlParams.get('route');
        
        if (routeData) {
            try {
                const route = JSON.parse(decodeURIComponent(routeData));
                this.displayRoute(route);
            } catch(e) {
                console.error('[MapCore] Ошибка при восстановлении маршрута:', e);
            }
        }
    },
    
    showRouteModal: function() {
        // Показ модального окна
        document.getElementById('routeModal').style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Предотвращение скролла
    },
    
    hideRouteModal: function() {
        // Скрытие модального окна
        document.getElementById('routeModal').style.display = 'none';
        document.body.style.overflow = 'auto';
    },
    
    displayRoute: function(routeData) {
        // Отображение маршрута на карте
        this.clearGeoObjects();
        
        const routeCoordinates = routeData.points.map(p => [p.lat, p.lon]);
        
        // Рисование линии маршрута
        const routeLine = new ymaps.Polyline(routeCoordinates, {}, {
            strokeColor: '#0066ff',
            strokeWidth: 4,
            strokeOpacity: 0.9,
            editorDrawingCursor: 'pointer'
        });
        
        this.myMap.geoObjects.add(routeLine);
        this.myGeoObjects.push(routeLine);
        
        // Добавление метки начала
        const startMark = new ymaps.Placemark(routeCoordinates[0], {
            balloonContent: '<strong>Начало маршрута</strong>'
        }, {
            preset: 'islands#greenCircleDotIcon',
            iconColor: '00AA00'
        });
        
        this.myMap.geoObjects.add(startMark);
        this.myGeoObjects.push(startMark);
        
        // Добавление метки конца
        const endMark = new ymaps.Placemark(
            routeCoordinates[routeCoordinates.length - 1],
            { balloonContent: '<strong>Конец маршрута</strong>' },
            {
                preset: 'islands#redCircleDotIcon',
                iconColor: 'FF0000'
            }
        );
        
        this.myMap.geoObjects.add(endMark);
        this.myGeoObjects.push(endMark);
        
        // Центрирование карты на маршрут
        this.myMap.setBounds(routeLine.geometry.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 50
        });
        
        // Сохранение текущего маршрута
        this.currentRoute = routeData;
        
        // Показ информационной панели
        this.showRouteInfo(routeData);
    },
    
    displaySmartRoute: function(routeData) {
        // Отображение интеллектуального маршрута
        this.clearGeoObjects();
        
        const routeCoordinates = routeData.points.map(p => [p.lat, p.lon]);
        
        // Рисование маршрута
        const routeLine = new ymaps.Polyline(routeCoordinates, {}, {
            strokeColor: '#667eea',
            strokeWidth: 4,
            strokeOpacity: 0.9
        });
        
        this.myMap.geoObjects.add(routeLine);
        this.myGeoObjects.push(routeLine);
        
        // Добавление пронумерованных метак для POI
        routeData.pois.forEach((poi, index) => {
            const placemark = new ymaps.Placemark(
                [poi.lat, poi.lon],
                {
                    balloonContent: `
                        <div class="poi-balloon">
                            <strong>${poi.name}</strong><br>
                            <em>${poi.category}</em><br>
                            <small>${poi.address}</small>
                        </div>
                    `
                },
                {
                    preset: 'islands#blueCircleDotIconWithNumber',
                    iconContent: (index + 1).toString()
                }
            );
            
            this.myMap.geoObjects.add(placemark);
            this.myGeoObjects.push(placemark);
        });
        
        // Центрирование на маршрут
        this.myMap.setBounds(routeLine.geometry.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 50
        });
        
        this.currentRoute = routeData;
        this.currentRoutePOIs = routeData.pois;
        
        this.showSmartRouteInfo(routeData);
    },
    
    showRouteInfo: function(routeData) {
        const panel = document.getElementById('routeInfoPanel');
        const stats = document.getElementById('routeInfoStats');
        
        stats.innerHTML = `
            <div class="stat-item">
                <span class="stat-icon">📏</span>
                <span class="stat-label">Расстояние</span>
                <span class="stat-value">${(routeData.distance / 1000).toFixed(2)} км</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">⏱️</span>
                <span class="stat-label">Время</span>
                <span class="stat-value">${Math.round(routeData.duration / 60)} минут</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">🚗</span>
                <span class="stat-label">Режим</span>
                <span class="stat-value">${this.getModeLabel(routeData.mode)}</span>
            </div>
        `;
        
        document.getElementById('routeStagesList').innerHTML = '';
        panel.style.display = 'block';
    },
    
    showSmartRouteInfo: function(routeData) {
        const panel = document.getElementById('routeInfoPanel');
        const stats = document.getElementById('routeInfoStats');
        const stages = document.getElementById('routeStagesList');
        
        stats.innerHTML = `
            <div class="stat-item">
                <span class="stat-icon">📏</span>
                <span class="stat-label">Расстояние</span>
                <span class="stat-value">${(routeData.total_distance / 1000).toFixed(2)} км</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">⏱️</span>
                <span class="stat-label">Время</span>
                <span class="stat-value">${Math.round(routeData.total_time / 60)} минут</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">📍</span>
                <span class="stat-label">Точки</span>
                <span class="stat-value">${routeData.pois.length}</span>
            </div>
        `;
        
        stages.innerHTML = routeData.pois.map((poi, i) => `
            <div class="stage-item">
                <div class="stage-number">${i + 1}</div>
                <div class="stage-content">
                    <h4>${poi.name}</h4>
                    <p class="stage-category">${poi.category}</p>
                    <p class="stage-address">${poi.address}</p>
                </div>
            </div>
        `).join('');
        
        panel.style.display = 'block';
    },
    
    getModeLabel: function(mode) {
        const labels = {
            'driving': '🚗 На машине',
            'walking': '🚶 Пешком',
            'transit': '🚌 Общественный'
        };
        return labels[mode] || mode;
    },
    
    clearGeoObjects: function() {
        this.myGeoObjects.forEach(obj => this.myMap.geoObjects.remove(obj));
        this.myGeoObjects = [];
    },
    
    closeRouteInfo: function() {
        document.getElementById('routeInfoPanel').style.display = 'none';
        this.clearGeoObjects();
        this.currentRoute = null;
        this.currentRoutePOIs = [];
    }
};
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: MapCore класс с методами в IDE - Рисунок 4.2]

---

## 4.2 Система построения маршрутов - Детальное описание

### 4.2.1 Модальное окно с двумя режимами

**Структура модального окна:**

```html
<div id="routeModal" class="modal-overlay">
    <div class="modal-content">
        <div class="modal-header">
            <h2>✨ Построить маршрут</h2>
            <button class="modal-close" id="closeModal">&times;</button>
        </div>
        
        <div class="modal-tabs">
            <button class="tab-btn active" data-tab="simple">
                📍 Простой маршрут
            </button>
            <button class="tab-btn" data-tab="smart">
                🧠 Интеллектуальный маршрут
            </button>
        </div>
        
        <!-- ТАБ 1: ПРОСТОЙ МАРШРУТ -->
        <div class="tab-content active" data-tab="simple" id="simpleRouteTab">
            <div class="form-group">
                <label for="fromAddress">
                    <span class="icon">📍</span>
                    <span>Начало маршрута</span>
                </label>
                <div class="input-wrapper">
                    <input type="text" id="fromAddress" 
                           placeholder="Введите адрес или название места" 
                           autocomplete="off" class="address-input">
                    <div id="fromSuggestions" class="suggestions-list"></div>
                </div>
            </div>

            <div class="form-group">
                <label for="toAddress">
                    <span class="icon">🚩</span>
                    <span>Конец маршрута</span>
                </label>
                <div class="input-wrapper">
                    <input type="text" id="toAddress" 
                           placeholder="Введите адрес или название места" 
                           autocomplete="off" class="address-input">
                    <div id="toSuggestions" class="suggestions-list"></div>
                </div>
            </div>

            <div class="form-group">
                <label for="transportMode">
                    <span class="icon">🚗</span>
                    <span>Вид транспорта</span>
                </label>
                <select id="transportMode" class="form-select">
                    <option value="driving">🚗 На машине</option>
                    <option value="walking">🚶 Пешком</option>
                    <option value="transit">🚌 Общественный транспорт</option>
                </select>
            </div>

            <button id="buildSimpleRouteBtn" class="btn-primary btn-large btn-block">
                ✨ Построить маршрут
            </button>
        </div>
        
        <!-- ТАБ 2: ИНТЕЛЛЕКТУАЛЬНЫЙ МАРШРУТ -->
        <div class="tab-content" data-tab="smart" id="smartRouteTab">
            <div class="form-group">
                <label for="smartFromAddress">
                    <span class="icon">📍</span>
                    <span>Начало маршрута</span>
                </label>
                <div class="input-wrapper">
                    <input type="text" id="smartFromAddress" 
                           placeholder="Введите адрес" autocomplete="off">
                    <div id="smartFromSuggestions" class="suggestions-list"></div>
                </div>
            </div>

            <div class="form-group">
                <label>
                    <span class="icon">🎯</span>
                    <span>Интересующие категории</span>
                </label>
                <div class="categories-grid">
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="cafe">
                        <span class="checkbox-icon">☕</span>
                        <span>Кафе</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="park">
                        <span class="checkbox-icon">🌳</span>
                        <span>Парки</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="museum">
                        <span class="checkbox-icon">🏛️</span>
                        <span>Музеи</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="monument">
                        <span class="checkbox-icon">🗿</span>
                        <span>Памятники</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="restaurant">
                        <span class="checkbox-icon">🍽️</span>
                        <span>Рестораны</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="bar">
                        <span class="checkbox-icon">🍺</span>
                        <span>Бары</span>
                    </label>
                    <label class="category-checkbox">
                        <input type="checkbox" name="categories" value="shop">
                        <span class="checkbox-icon">🛍️</span>
                        <span>Магазины</span>
                    </label>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group flex-1">
                    <label for="timeLimit">
                        <span class="icon">⏱️</span>
                        <span>Временной лимит (мин)</span>
                    </label>
                    <input type="number" id="timeLimit" min="15" max="480" 
                           value="60" class="form-input">
                </div>
                
                <div class="form-group flex-1">
                    <label for="smartTransportMode">
                        <span class="icon">🚗</span>
                        <span>Транспорт</span>
                    </label>
                    <select id="smartTransportMode" class="form-select">
                        <option value="walking">🚶 Пешком</option>
                        <option value="driving">🚗 На машине</option>
                        <option value="transit">🚌 Общественный</option>
                    </select>
                </div>
            </div>

            <button id="buildSmartRouteBtn" class="btn-primary btn-large btn-block">
                ✨ Построить умный маршрут
            </button>
        </div>
    </div>
</div>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Модальное окно с двумя табами - вкладка простого маршрута активна - Рисунок 4.3]

[ВСТАВИТЬ СЮДА СКРИНШОТ: Модальное окно вкладка интеллектуального маршрута с 7 категориями - Рисунок 4.4]

### 4.2.2 Обработка построения простого маршрута

```javascript
document.getElementById('buildSimpleRouteBtn').addEventListener('click', async function() {
    const fromAddress = document.getElementById('fromAddress').value.trim();
    const toAddress = document.getElementById('toAddress').value.trim();
    const mode = document.getElementById('transportMode').value;
    
    // Валидация
    if (!fromAddress || !toAddress) {
        showError('❌ Пожалуйста, заполните оба адреса');
        return;
    }
    
    if (fromAddress === toAddress) {
        showError('❌ Начало и конец маршрута должны отличаться');
        return;
    }
    
    // Показ индикатора загрузки
    const loadingEl = showLoading('⏳ Построение маршрута...');
    
    try {
        // AJAX запрос к серверу
        const response = await fetch('api.php?action=build-route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                from_address: fromAddress,
                to_address: toAddress,
                mode: mode
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Ошибка при построении маршрута');
        }
        
        // Отображение маршрута на карте
        MapCore.displayRoute(data.route);
        
        // Закрытие модального окна
        MapCore.hideRouteModal();
        
        // Успешное сообщение
        showSuccess('✅ Маршрут построен успешно!');
        
    } catch (error) {
        console.error('[ERROR]', error);
        showError(`❌ Ошибка: ${error.message}`);
    } finally {
        loadingEl?.remove();
    }
});
```

### 4.2.3 Обработка построения интеллектуального маршрута

```javascript
document.getElementById('buildSmartRouteBtn').addEventListener('click', async function() {
    const fromAddress = document.getElementById('smartFromAddress').value.trim();
    const timeLimit = parseInt(document.getElementById('timeLimit').value);
    const mode = document.getElementById('smartTransportMode').value;
    
    // Получение выбранных категорий
    const categories = Array.from(
        document.querySelectorAll('input[name="categories"]:checked')
    ).map(el => el.value);
    
    // Валидация
    if (!fromAddress) {
        showError('❌ Укажите начальную точку');
        return;
    }
    
    if (categories.length === 0) {
        showError('❌ Выберите хотя бы одну категорию мест');
        return;
    }
    
    if (timeLimit < 15 || timeLimit > 480) {
        showError('❌ Временной лимит должен быть от 15 до 480 минут');
        return;
    }
    
    const loadingEl = showLoading('⏳ Расчёт оптимального маршрута...');
    
    try {
        const response = await fetch('api.php?action=build-smart-route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                start_point: fromAddress,
                categories: categories,
                time_limit: timeLimit,
                transport_mode: mode
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Ошибка при построении маршрута');
        }
        
        // Проверка количества найденных POI
        if (!data.route.pois || data.route.pois.length === 0) {
            showError('❌ Не найдено мест выбранных категорий поблизости');
            return;
        }
        
        // Отображение умного маршрута
        MapCore.displaySmartRoute(data.route);
        
        MapCore.hideRouteModal();
        
        showSuccess(`✅ Маршрут построен! Найдено ${data.route.pois.length} мест.`);
        
    } catch (error) {
        console.error('[ERROR]', error);
        showError(`❌ Ошибка: ${error.message}`);
    } finally {
        loadingEl?.remove();
    }
});
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Результат построения интеллектуального маршрута - на карте видны пронумерованные метки POI - Рисунок 4.5]

---

## 4.3 Python FastAPI сервер - Архитектура и развертывание

### 4.3.1 Общее описание FastAPI сервера

Python FastAPI сервер является критической частью приложения Intelligent Trails. Он отвечает за выполнение сложных вычислений оптимизации маршрутов, которые не могут быть эффективно выполнены на PHP стороне.

**Основные функции FastAPI сервера:**

1. **Оптимизация маршрутов** - решение задачи коммивояжера (TSP) с учетом временных ограничений
2. **Кэширование результатов** - сохранение результатов оптимизации для повторного использования
3. **Работа с матрицами расстояний** - расчет расстояний и времени между всеми точками
4. **Обработка большого количества POI** - фильтрация и сортировка точек интереса

### 4.3.2 Структура проекта FastAPI

```
backend/
├── main.py                    # Главный файл приложения
├── requirements.txt           # Зависимости Python
├── config/
│   ├── settings.py           # Конфигурация приложения
│   └── database.py           # Настройки БД
├── routers/
│   └── routes.py             # API эндпоинты для маршрутов
├── models/
│   ├── route.py              # Pydantic модели маршрутов
│   ├── poi.py                # Модели POI
│   └── optimization.py       # Модели для оптимизации
├── services/
│   ├── route_optimizer.py    # Алгоритм оптимизации
│   ├── yandex_api.py         # Интеграция с Yandex API
│   ├── distance_calculator.py # Расчет расстояний
│   └── database.py           # Работа с БД
└── utils/
    ├── logger.py             # Логирование
    └── cache.py              # Кэширование
```

### 4.3.3 Главный файл main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZIPMiddleware
import logging
from config.settings import settings
from routers import routes

# Инициализация приложения
app = FastAPI(
    title="Intelligent Trails API",
    description="API для оптимизации маршрутов",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# CORS настройка - разрешение запросов с frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:8080",
        "http://localhost:3000",
        "https://intelligent-trails.herokuapp.com",
        "https://intelligent-trails.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Сжатие ответов
app.add_middleware(GZIPMiddleware, minimum_size=1000)

# Включение роутеров
app.include_router(routes.router, prefix="/api", tags=["routes"])

# Healthcheck эндпоинт
@app.get("/health")
async def health_check():
    """Проверка здоровья сервера"""
    return {
        "status": "ok",
        "service": "Intelligent Trails Route Optimizer",
        "version": "1.0.0"
    }

# Главный эндпоинт
@app.get("/")
async def root():
    """Корневой эндпоинт"""
    return {
        "message": "Intelligent Trails API",
        "documentation": "/api/docs"
    }

# Обработка ошибок
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {str(exc)}")
    return {
        "success": False,
        "message": "Internal server error",
        "detail": str(exc) if settings.DEBUG else "An error occurred"
    }

# Обработчик запуска
@app.on_event("startup")
async def startup_event():
    logger.info("FastAPI server starting...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")

# Обработчик остановки
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("FastAPI server shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        log_level="info",
        reload=settings.RELOAD
    )
```

### 4.3.4 Модели Pydantic для запросов

```python
# models/route.py
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class TransportMode(str, Enum):
    WALKING = "walking"
    DRIVING = "driving"
    TRANSIT = "transit"

class Point(BaseModel):
    """Географическая точка"""
    lat: float = Field(..., ge=-90, le=90, description="Широта")
    lon: float = Field(..., ge=-180, le=180, description="Долгота")
    
    class Config:
        json_schema_extra = {
            "example": {"lat": 55.755814, "lon": 37.617635}
        }

class POI(BaseModel):
    """Точка интереса"""
    id: str
    name: str
    lat: float
    lon: float
    category: str
    address: str
    distance_from_start: Optional[float] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "poi_123",
                "name": "Красная площадь",
                "lat": 55.7536,
                "lon": 37.6201,
                "category": "monument",
                "address": "Москва, Красная площадь"
            }
        }

class OptimizeRouteRequest(BaseModel):
    """Запрос на оптимизацию маршрута"""
    start_point: Point
    pois: List[POI]
    time_limit: int = Field(..., ge=15, le=480, description="Лимит времени в минутах")
    mode: TransportMode = TransportMode.WALKING
    
    class Config:
        json_schema_extra = {
            "example": {
                "start_point": {"lat": 55.755814, "lon": 37.617635},
                "pois": [
                    {
                        "id": "poi_1",
                        "name": "Кафе",
                        "lat": 55.7543,
                        "lon": 37.6190,
                        "category": "cafe",
                        "address": "Москва, ул. Мокеевская"
                    }
                ],
                "time_limit": 60,
                "mode": "walking"
            }
        }

class OptimizeRouteResponse(BaseModel):
    """Ответ с оптимизированным маршрутом"""
    success: bool
    pois: List[POI]
    total_distance: float
    total_time: int
    points: List[Point]
    optimization_score: float
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "pois": [],
                "total_distance": 2500.5,
                "total_time": 45,
                "points": [],
                "optimization_score": 0.95
            }
        }
```

### 4.3.5 Основной роутер с эндпоинтами

```python
# routers/routes.py
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models.route import OptimizeRouteRequest, OptimizeRouteResponse, Point, POI
from services.route_optimizer import RouteOptimizer
from services.distance_calculator import DistanceCalculator
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Инициализация сервисов
optimizer = RouteOptimizer()
distance_calc = DistanceCalculator()

@router.post("/optimize-route", response_model=OptimizeRouteResponse)
async def optimize_route(request: OptimizeRouteRequest, background_tasks: BackgroundTasks):
    """
    Оптимизирует маршрут через набор точек интереса
    
    Параметры:
    - start_point: начальная точка маршрута
    - pois: список точек интереса для посещения
    - time_limit: максимальное время в пути (минут)
    - mode: вид транспорта (walking/driving/transit)
    
    Возвращает:
    - Оптимизированный маршрут с упорядоченным списком POI
    - Общее расстояние и время в пути
    - Координаты точек маршрута
    """
    
    try:
        logger.info(f"Получен запрос на оптимизацию маршрута с {len(request.pois)} POI")
        
        # Валидация
        if len(request.pois) == 0:
            raise HTTPException(status_code=400, detail="Минимум одна точка интереса требуется")
        
        if len(request.pois) > 50:
            raise HTTPException(status_code=400, detail="Максимум 50 точек интереса за раз")
        
        # Расчет матрицы расстояний
        logger.info("Расчет матрицы расстояний...")
        distance_matrix = await distance_calc.calculate_matrix(
            start_point=request.start_point,
            pois=request.pois,
            mode=request.mode
        )
        
        # Оптимизация маршрута
        logger.info("Оптимизация маршрута...")
        optimized_route = optimizer.optimize(
            start_point=request.start_point,
            pois=request.pois,
            distance_matrix=distance_matrix,
            time_limit=request.time_limit,
            mode=request.mode
        )
        
        # Сохранение статистики в фоновом потоке
        background_tasks.add_task(
            save_optimization_stats,
            num_pois=len(request.pois),
            time_limit=request.time_limit,
            score=optimized_route.get('score', 0)
        )
        
        logger.info(f"Маршрут успешно оптимизирован. Оценка: {optimized_route.get('score', 0):.2f}")
        
        return OptimizeRouteResponse(
            success=True,
            pois=optimized_route['pois'],
            total_distance=optimized_route['total_distance'],
            total_time=optimized_route['total_time'],
            points=optimized_route['points'],
            optimization_score=optimized_route.get('score', 0.0)
        )
        
    except ValueError as e:
        logger.error(f"Ошибка валидации: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Неожиданная ошибка при оптимизации: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/optimization-stats")
async def get_stats():
    """Получить статистику оптимизаций"""
    stats = optimizer.get_statistics()
    return {
        "success": True,
        "stats": stats
    }

async def save_optimization_stats(num_pois: int, time_limit: int, score: float):
    """Сохранение статистики в фоновом потоке"""
    logger.info(f"Статистика сохранена: POI={num_pois}, Time={time_limit}min, Score={score}")
```

### 4.3.6 Алгоритм оптимизации маршрутов

```python
# services/route_optimizer.py
import logging
from typing import List, Dict, Tuple
import math
from models.route import Point, POI, TransportMode

logger = logging.getLogger(__name__)

class RouteOptimizer:
    """
    Оптимизирует маршруты используя модифицированный алгоритм муравьев
    и динамическое программирование для задачи коммивояжера
    """
    
    def __init__(self, max_iterations: int = 100):
        self.max_iterations = max_iterations
        self.statistics = {
            'total_optimizations': 0,
            'average_score': 0.0,
            'best_score': 0.0
        }
    
    def optimize(self, start_point: Point, pois: List[POI], 
                 distance_matrix: List[List[float]], 
                 time_limit: int, mode: TransportMode) -> Dict:
        """
        Основной метод оптимизации маршрута
        
        Использует комбинацию методов:
        1. Ближайшего соседа (для быстрого решения)
        2. Локального поиска (улучшение решения)
        3. Проверки временных ограничений
        """
        
        logger.info(f"Начало оптимизации маршрута ({len(pois)} точек, лимит {time_limit} мин)")
        
        try:
            # Шаг 1: Ближайший сосед - получить начальное решение
            initial_order = self._nearest_neighbor(start_point, pois, distance_matrix)
            
            # Шаг 2: Проверка времени
            total_time = self._calculate_time(distance_matrix, initial_order, mode)
            
            if total_time > time_limit * 60:  # Конвертируем минуты в секунды
                logger.info(f"Первоначальное решение превышает временной лимит: {total_time}s > {time_limit*60}s")
                initial_order = self._filter_by_time(pois, distance_matrix, initial_order, time_limit * 60, start_point)
            
            # Шаг 3: Локальный поиск - улучшение решения (2-opt)
            optimized_order = self._two_opt(initial_order, distance_matrix, time_limit * 60)
            
            # Шаг 4: Составление финального маршрута
            result = self._build_route(start_point, optimized_order, pois, distance_matrix)
            
            # Обновление статистики
            self._update_statistics(result['score'])
            
            logger.info(f"Маршрут оптимизирован. Расстояние: {result['total_distance']}м, Время: {result['total_time']}s, Оценка: {result['score']:.2f}")
            
            return result
            
        except Exception as e:
            logger.error(f"Ошибка при оптимизации: {str(e)}")
            raise
    
    def _nearest_neighbor(self, start: Point, pois: List[POI], 
                         distance_matrix: List[List[float]]) -> List[int]:
        """Алгоритм ближайшего соседа"""
        n = len(pois)
        unvisited = set(range(n))
        current = 0
        path = [0]
        
        while unvisited:
            unvisited.discard(current)
            if not unvisited:
                break
            
            # Найти ближайшую непосещенную точку
            nearest = min(unvisited, 
                         key=lambda i: distance_matrix[current][i])
            path.append(nearest)
            current = nearest
        
        path.append(0)  # Возврат в начало
        return path
    
    def _two_opt(self, path: List[int], distance_matrix: List[List[float]], 
                 time_limit: float) -> List[int]:
        """2-opt локальный поиск для улучшения маршрута"""
        best_path = path.copy()
        improved = True
        iterations = 0
        
        while improved and iterations < self.max_iterations:
            improved = False
            iterations += 1
            
            for i in range(1, len(best_path) - 2):
                for k in range(i + 1, len(best_path)):
                    # Обратная последовательность между i и k
                    new_path = best_path[:i] + best_path[i:k][::-1] + best_path[k:]
                    
                    # Проверка улучшения
                    if self._calculate_distance(new_path, distance_matrix) < \
                       self._calculate_distance(best_path, distance_matrix):
                        best_path = new_path
                        improved = True
                        break
                if improved:
                    break
        
        logger.info(f"2-opt завершился за {iterations} итераций")
        return best_path
    
    def _calculate_distance(self, path: List[int], 
                           distance_matrix: List[List[float]]) -> float:
        """Расчет общего расстояния маршрута"""
        total = 0
        for i in range(len(path) - 1):
            total += distance_matrix[path[i]][path[i + 1]]
        return total
    
    def _calculate_time(self, distance_matrix: List[List[float]], 
                       path: List[int], mode: TransportMode) -> float:
        """Расчет времени в пути"""
        total_distance = self._calculate_distance(path, distance_matrix)
        
        # Скорости в м/с
        speeds = {
            TransportMode.WALKING: 1.4,      # 5 км/ч
            TransportMode.DRIVING: 13.9,     # 50 км/ч
            TransportMode.TRANSIT: 11.1      # 40 км/ч
        }
        
        speed = speeds.get(mode, 1.4)
        return total_distance / speed
    
    def _filter_by_time(self, pois: List[POI], distance_matrix: List[List[float]], 
                       path: List[int], time_limit: float, start: Point) -> List[int]:
        """Фильтрация POI по временному лимиту"""
        # Жадный алгоритм - добавлять POI пока хватает времени
        selected = [0]
        remaining_time = time_limit
        
        for idx in path[1:-1]:
            # Время на посещение этой точки (15 минут по умолчанию)
            visit_time = 900  # 15 минут в секундах
            travel_time = distance_matrix[selected[-1]][idx] / 1.4  # Пешком
            
            if travel_time + visit_time <= remaining_time:
                selected.append(idx)
                remaining_time -= (travel_time + visit_time)
            else:
                break
        
        selected.append(0)  # Возврат в начало
        return selected
    
    def _build_route(self, start: Point, order: List[int], 
                    pois: List[POI], distance_matrix: List[List[float]]) -> Dict:
        """Построение финального маршрута"""
        ordered_pois = [pois[i] for i in order[:-1]]  # Исключить последний (0)
        total_distance = self._calculate_distance(order, distance_matrix)
        total_time = int(total_distance / 1.4)  # В секундах (пешком)
        
        # Генерация точек маршрута между POI
        route_points = self._generate_route_points(start, ordered_pois)
        
        # Оценка оптимальности (0-1)
        score = min(1.0, 1.0 - (len(order) * 0.01))  # Штраф за длинный маршрут
        
        return {
            'pois': ordered_pois,
            'total_distance': total_distance,
            'total_time': total_time,
            'points': route_points,
            'score': score
        }
    
    def _generate_route_points(self, start: Point, pois: List[POI]) -> List[Point]:
        """Генерация промежуточных точек маршрута"""
        points = [start]
        for poi in pois:
            points.append(Point(lat=poi.lat, lon=poi.lon))
        points.append(start)  # Возврат в начало
        return points
    
    def _update_statistics(self, score: float):
        """Обновление статистики"""
        self.statistics['total_optimizations'] += 1
        self.statistics['best_score'] = max(self.statistics['best_score'], score)
        self.statistics['average_score'] = \
            (self.statistics['average_score'] * (self.statistics['total_optimizations'] - 1) + score) / \
            self.statistics['total_optimizations']
    
    def get_statistics(self) -> Dict:
        """Получить статистику"""
        return self.statistics
```

### 4.3.7 Развертывание FastAPI сервера

**На Render.com (текущее развертывание):**

```yaml
# render.yaml
services:
  - type: web
    name: intelligent-trails-backend
    env: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.9
      - key: ENVIRONMENT
        value: production
```

**requirements.txt:**

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0
sqlalchemy==2.0.23
python-dotenv==1.0.0
aiohttp==3.9.1
requests==2.31.0
httpx==0.25.1
```

**Переменные окружения:**

```bash
DATABASE_URL=mysql+pymysql://user:pass@localhost/intelligent_trails
YANDEX_API_KEY=xxxxxxxx
YANDEX_SUGGEST_KEY=xxxxxxxx
ENVIRONMENT=production
DEBUG=false
HOST=0.0.0.0
PORT=8000
WORKERS=4
RELOAD=false
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Консоль Render.com с логами FastAPI сервера - Рисунок 4.6]

---

## 4.4 Описание всех страниц приложения

### 4.4.1 Главная страница (index.php)

**Назначение:** Приветственная страница и лендинг для привлечения новых пользователей

**Структура:**

```html
<!-- HERO СЕКЦИЯ -->
<header class="hero">
    <div class="hero-content">
        <h1>🌟 Умные прогулки и маршруты</h1>
        <p class="hero-subtitle">Откройте свой город заново с интеллектуальным планированием маршрутов</p>
        <div class="hero-buttons">
            <a href="map.php" class="cta-button primary">🗺️ Начать планирование</a>
            <a href="#features" class="cta-button secondary">👇 Узнать больше</a>
        </div>
    </div>
</header>

<!-- ВОЗМОЖНОСТИ -->
<section class="features-section">
    <!-- 6 карточек -->
</section>

<!-- КАК ЭТО РАБОТАЕТ -->
<section class="how-it-works-section">
    <!-- 3 шага -->
</section>

<!-- КАТЕГОРИИ -->
<section class="categories-section">
    <!-- 7 категорий мест -->
</section>

<!-- ПРЕИМУЩЕСТВА -->
<section class="benefits-section">
    <!-- Левая колонка с текстом, правая с иконками -->
</section>

<!-- CTA -->
<section class="cta-section">
    <button>Создать аккаунт</button>
</section>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Главная страница от hero до footer - Рисунок 4.7]

**Функциональность:**
- Плавная прокрутка к якорям (#features)
- Анимация появления элементов при прокрутке (IntersectionObserver)
- Адаптивный дизайн для мобильных
- Условный вывод кнопок (для авторизованных и неавторизованных)

### 4.4.2 Страница входа (login.php)

**Назначение:** Аутентификация пользователя

**Компоненты:**

```html
<div class="form-wrapper">
    <h2>Вход</h2>
    <p>Введите свои учетные данные для входа</p>
    
    <!-- Форма входа -->
    <form method="POST" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">
        <div class="form-group">
            <label>Имя пользователя</label>
            <input type="text" name="username" value="<?php echo $username; ?>">
        </div>
        
        <div class="form-group">
            <label>Пароль</label>
            <input type="password" name="password">
        </div>
        
        <div class="form-group">
            <input type="submit" value="Войти" class="btn-primary">
        </div>
        
        <div class="or-separator">ИЛИ</div>
        
        <!-- OAuth вход -->
        <div class="form-group">
            <a href="yandex_login.php" class="yandex-btn">
                <img src="yandex-logo.svg" alt="Yandex">
                Войти через Яндекс
            </a>
        </div>
        
        <p>Нет аккаунта? <a href="register.php">Зарегистрируйтесь</a></p>
    </form>
</div>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Форма входа с обоими методами аутентификации - Рисунок 4.8]

**Функциональность:**
- Валидация на стороне сервера
- Параметризованные SQL запросы
- password_verify() для проверки пароля
- Создание сессии при успехе
- Сообщения об ошибках (одинаковые для обоих типов ошибок)

### 4.4.3 Страница регистрации (register.php)

**Назначение:** Создание новой учетной записи пользователя

```html
<div class="form-wrapper">
    <h2>Регистрация</h2>
    
    <form method="POST">
        <div class="form-group">
            <label>Имя пользователя</label>
            <input type="text" name="username" minlength="3" maxlength="20" required>
            <small>3-20 символов, буквы и цифры</small>
        </div>
        
        <div class="form-group">
            <label>Пароль</label>
            <input type="password" name="password" minlength="6" required>
            <small>Минимум 6 символов</small>
        </div>
        
        <div class="form-group">
            <label>Подтвердите пароль</label>
            <input type="password" name="password_confirm" required>
        </div>
        
        <div class="form-group">
            <input type="submit" value="Зарегистрироваться" class="btn-primary">
        </div>
        
        <p>Уже есть аккаунт? <a href="login.php">Войдите</a></p>
    </form>
</div>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Форма регистрации с валидацией - Рисунок 4.9]

**Валидация:**
- На клиентской стороне: HTML5 атрибуты
- На серверной стороне: проверка length, символов, уникальности
- Хеширование пароля: password_hash()
- Проверка совпадения паролей

### 4.4.4 Страница карты (map.php) - ОСНОВНОЙ ИНТЕРФЕЙС

Подробно описана в разделе 4.1-4.2

[ВСТАВИТЬ СЮДА СКРИНШОТ: Интерфейс карты с построенным маршрутом - Рисунок 4.10]

### 4.4.5 Страница истории маршрутов (my_routes.php)

**Назначение:** Просмотр и управление сохраненными маршрутами

```html
<!-- Фильтры -->
<div class="filter-section">
    <input type="text" id="searchInput" placeholder="🔍 Поиск по названию...">
    
    <div class="filter-buttons">
        <button data-filter="all" class="filter-btn active">Все маршруты</button>
        <button data-filter="simple" class="filter-btn">Простые</button>
        <button data-filter="smart" class="filter-btn">Интеллектуальные</button>
    </div>
</div>

<!-- Таблица маршрутов -->
<table class="routes-table">
    <thead>
        <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>От</th>
            <th>До/Категории</th>
            <th>Действия</th>
        </tr>
    </thead>
    <tbody id="routesList">
        <!-- Заполняется через JavaScript -->
    </tbody>
</table>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Таблица истории маршрутов с фильтрами - Рисунок 4.11]

**Функциональность:**
- Фильтрация по типу маршрута
- Поиск по названию
- Кнопка "Просмотреть на карте" - загружает маршрут на страницу карты
- Кнопка "Удалить" - удаляет маршрут с подтверждением
- Сортировка по дате (новые сверху)
- Пагинация (50 маршрутов на страницу)

### 4.4.6 Личный кабинет (profile.php)

**Назначение:** Управление профилем пользователя и безопасностью

```html
<!-- Информация профиля -->
<div class="profile-card">
    <div class="avatar"><?php echo strtoupper(substr($_SESSION["username"], 0, 1)); ?></div>
    <h3><?php echo htmlspecialchars($_SESSION["username"]); ?></h3>
    <p><?php echo $accountType; ?></p>
</div>

<!-- Форма смены пароля -->
<div class="password-section">
    <h3>🔒 Смена пароля</h3>
    
    <form action="change_password.php" method="POST">
        <div class="form-group">
            <label>Текущий пароль</label>
            <input type="password" name="current_password" required>
        </div>
        
        <div class="form-group">
            <label>Новый пароль</label>
            <input type="password" name="new_password" minlength="6" required>
        </div>
        
        <div class="form-group">
            <label>Подтвердите новый пароль</label>
            <input type="password" name="confirm_new_password" required>
        </div>
        
        <button type="submit" class="btn-primary">Сменить пароль</button>
    </form>
</div>

<!-- Действия -->
<div class="profile-actions">
    <a href="map.php" class="btn">🗺️ Перейти к карте</a>
    <a href="my_routes.php" class="btn">📍 Мои маршруты</a>
    <a href="logout.php" class="btn btn-danger">🚪 Выход</a>
</div>
```

[ВСТАВИТЬ СЮДА СКРИНШОТ: Страница профиля с формой смены пароля - Рисунок 4.12]

**Функциональность:**
- Отображение типа аккаунта (локальный или OAuth)
- Форма смены пароля (только для локальных аккаунтов)
- Валидация текущего пароля
- Хеширование нового пароля
- Статус-сообщения об успехе/ошибке

### 4.4.7 Вспомогательные страницы

**logout.php** - Завершение сессии:
```php
<?php
session_start();
session_destroy();
header("location: index.php");
exit;
?>
```

**change_password.php** - Обработка смены пароля (описана в section 4.2)

**yandex_login.php** - Инициализация OAuth:
```php
<?php
$authUrl = 'https://oauth.yandex.ru/authorize?response_type=code&client_id='.YANDEX_CLIENT_ID.'&redirect_uri='.urlencode(CALLBACK_URL);
header("Location: " . $authUrl);
?>
```

**yandex_callback.php** - Обработка OAuth callback (описана в section 4.1)

---

## 4.5 API Backend - Подробная реализация

### 4.5.1 Основной маршрутизатор api.php

```php
<?php
require_once "config.php";

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = $_GET["action"] ?? null;

$response = [
    "success" => false,
    "message