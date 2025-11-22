<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/modal-styles.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193&suggest_apikey=1019e534-8f99-42e2-85b2-d0c7ed9ccca2"></script>
</head>

<body>
    <?php require_once "components/navigation.php"; ?>

    <main class="map-page-container">
        <div id="map"></div>

        <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
            <span class="fab-icon">✨</span>
            <span class="fab-text">Построить маршрут</span>
        </button>

        <!-- ЛЕВОЕ МЕНЮ С ИНФОРМАЦИЕЙ И ВАРИАНТАМИ -->
        <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
            <div class="route-info-header">
                <h3>📊 Ваша прогулка</h3>
                <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
            </div>

            <div class="route-info-stats" id="routeInfoStats"></div>

            <div class="route-stages-list" id="routeStagesList">
                <!-- Этапы с вариантами будут здесь -->
            </div>
        </div>
    </main>

    <script src="assets/route-modal.js"></script>
    <script>
        ymaps.ready(init);

        function init() {
            var map = new ymaps.Map("map", {
                center: [55.751574, 37.573856],
                zoom: 12,
                controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
            });

            var currentRouteLines = [];
            var routeMarkers = [];
            var currentWalkData = null;

            document.getElementById('openRouteModal').addEventListener('click', function() {
                window.routeModal.open();
            });

            // ============================================
            // ОТОБРАЖЕНИЕ УМНОЙ ПРОГУЛКИ С РЕАЛЬНЫМИ МАРШРУТАМИ
            // ============================================
            window.displaySmartWalk = async function(walkData, startPoint, endPoint, returnToStart) {
                clearMap();
                currentWalkData = walkData;

                if (!walkData.activities || walkData.activities.length === 0) {
                    alert('Не удалось построить прогулку');
                    return;
                }

                // Собираем все точки для маршрута
                const allPoints = [startPoint.coords];
                const pointsInfo = [{
                    name: startPoint.name,
                    type: 'start',
                    coords: startPoint.coords
                }];

                walkData.activities.forEach((activity, idx) => {
                    if (activity.activity_type === 'walk' && activity.route_segment) {
                        activity.route_segment.forEach((point, segIdx) => {
                            // Пропускаем первую точку сегмента, если она совпадает с предыдущей
                            if (segIdx > 0 || allPoints.length === 0 ||
                                !coordsEqual(allPoints[allPoints.length - 1], point.coords)) {
                                allPoints.push(point.coords);
                                pointsInfo.push({
                                    name: point.name,
                                    type: 'walk_point',
                                    coords: point.coords,
                                    activityIndex: idx
                                });
                            }
                        });
                    } else if (activity.activity_type === 'place' && activity.selected_place) {
                        allPoints.push(activity.selected_place.coords);
                        pointsInfo.push({
                            name: activity.selected_place.name,
                            type: 'place',
                            coords: activity.selected_place.coords,
                            category: activity.category,
                            activityIndex: idx,
                            alternatives: activity.alternatives
                        });
                    }
                });

                if (returnToStart) {
                    allPoints.push(startPoint.coords);
                } else if (endPoint) {
                    allPoints.push(endPoint.coords);
                    pointsInfo.push({
                        name: endPoint.name,
                        type: 'end',
                        coords: endPoint.coords
                    });
                }

                // Строим РЕАЛЬНЫЙ маршрут через Yandex Maps API
                try {
                    const mode = walkData.activities[0]?.transport_mode || 'pedestrian';
                    const routingMode = {
                        'pedestrian': 'pedestrian',
                        'auto': 'auto',
                        'bicycle': 'bicycle',
                        'masstransit': 'masstransit'
                    } [mode] || 'pedestrian';

                    const route = await ymaps.route(allPoints, {
                        routingMode: routingMode,
                        mapStateAutoApply: false
                    });

                    currentRouteLines.push(route);
                    map.geoObjects.add(route);

                    // Центрируем карту на маршруте
                    map.setBounds(route.getBounds(), {
                        checkZoomRange: true,
                        zoomMargin: 50
                    });

                } catch (error) {
                    console.error('Error building route:', error);
                    // Fallback - просто линия между точками
                    const polyline = new ymaps.Polyline(allPoints, {}, {
                        strokeColor: '#667eea',
                        strokeWidth: 4,
                        strokeOpacity: 0.8
                    });
                    currentRouteLines.push(polyline);
                    map.geoObjects.add(polyline);

                    map.setBounds(polyline.geometry.getBounds(), {
                        checkZoomRange: true,
                        zoomMargin: 50
                    });
                }

                // Добавляем маркеры
                pointsInfo.forEach((point, index) => {
                    let iconPreset, iconColor;

                    if (point.type === 'start') {
                        iconPreset = 'islands#greenDotIcon';
                        iconColor = '#10b981';
                    } else if (point.type === 'end') {
                        iconPreset = 'islands#redDotIcon';
                        iconColor = '#ef4444';
                    } else if (point.type === 'place') {
                        iconPreset = 'islands#blueDotIcon';
                        iconColor = '#667eea';
                    } else {
                        // walk_point - не показываем маркеры для промежуточных точек прогулки
                        return;
                    }

                    const placemark = new ymaps.Placemark(
                        point.coords, {
                            balloonContent: `<strong>${point.name}</strong>${point.category ? '<br>' + point.category : ''}`,
                            iconCaption: point.name
                        }, {
                            preset: iconPreset,
                            iconColor: iconColor
                        }
                    );

                    routeMarkers.push(placemark);
                    map.geoObjects.add(placemark);
                });

                // Отображаем информацию в левой панели
                displayWalkInfo(walkData, pointsInfo);
            };

            // Вспомогательная функция сравнения координат
            function coordsEqual(c1, c2) {
                return Math.abs(c1[0] - c2[0]) < 0.0001 && Math.abs(c1[1] - c2[1]) < 0.0001;
            }

            // ============================================
            // ОТОБРАЖЕНИЕ ИНФОРМАЦИИ В ЛЕВОЙ ПАНЕЛИ
            // ============================================
            function displayWalkInfo(walkData, pointsInfo) {
                // Статистика
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

                // Этапы с вариантами
                let stagesHTML = '<div class="stages-header">🗺️ Этапы прогулки</div>';

                walkData.activities.forEach((activity, idx) => {
                    const activityIcon = getActivityIcon(activity);
                    const activityName = getActivityName(activity);
                    const activityDetails = `${activity.duration_minutes} мин · ${getTransportLabel(activity.transport_mode)}`;

                    if (activity.activity_type === 'place' && activity.alternatives && activity.alternatives.length > 0) {
                        // Этап с вариантами - добавляем слайдер
                        const allVariants = [{
                                place: activity.selected_place,
                                category: activity.category,
                                estimated_time_minutes: 0 // Текущий выбор
                            },
                            ...activity.alternatives
                        ];

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
                        // Обычный этап без вариантов
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

                // Обработчики слайдера вариантов
                attachVariantSliderHandlers();

                document.getElementById('routeInfoPanel').style.display = 'block';
                // Добавляем визуализацию зон для парков и прогулочных мест
                walkData.activities.forEach((activity, idx) => {
                    if (activity.activity_type === 'place' &&
                        (activity.category === 'парк' || activity.category === 'сквер')) {

                        if (activity.selected_place) {
                            // Рисуем круг вокруг парка как зону прогулки
                            const circle = new ymaps.Circle(
                                [activity.selected_place.coords, 200], // радиус 200м
                                {}, {
                                    fillColor: '#10b98130',
                                    strokeColor: '#10b981',
                                    strokeWidth: 2,
                                    strokeStyle: 'shortdash'
                                }
                            );

                            routeMarkers.push(circle);
                            map.geoObjects.add(circle);
                        }
                    }
                });

            }

            function getActivityIcon(activity) {
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
            }

            function getActivityName(activity) {
                if (activity.activity_type === 'walk') {
                    return activity.walking_style === 'scenic' ? 'Живописная прогулка' : 'Прямая прогулка';
                } else {
                    return activity.selected_place ? activity.selected_place.name : activity.category;
                }
            }

            function getTransportLabel(mode) {
                const labels = {
                    'pedestrian': 'Пешком',
                    'auto': 'Авто',
                    'bicycle': 'Велосипед',
                    'masstransit': 'Транспорт'
                };
                return labels[mode] || mode;
            }

            // Обработчики слайдера вариантов
            let currentVariantIndices = {}; // Храним текущий индекс для каждого этапа

            function attachVariantSliderHandlers() {
                document.querySelectorAll('.stage-card').forEach(stageCard => {
                    const stageIndex = parseInt(stageCard.dataset.stage);
                    currentVariantIndices[stageIndex] = 0;

                    const prevBtn = stageCard.querySelector('.slider-btn.prev');
                    const nextBtn = stageCard.querySelector('.slider-btn.next');
                    const counter = stageCard.querySelector('.slider-counter');
                    const variants = stageCard.querySelectorAll('.variant-option');

                    if (!prevBtn || !nextBtn || variants.length <= 1) return;

                    updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

                    prevBtn.addEventListener('click', () => {
                        if (currentVariantIndices[stageIndex] > 0) {
                            currentVariantIndices[stageIndex]--;
                            switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
                        }
                    });

                    nextBtn.addEventListener('click', () => {
                        if (currentVariantIndices[stageIndex] < variants.length - 1) {
                            currentVariantIndices[stageIndex]++;
                            switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
                        }
                    });
                });
            }

            function switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
                const currentIndex = currentVariantIndices[stageIndex];

                // Скрываем все варианты с анимацией
                variants.forEach((v, idx) => {
                    if (idx !== currentIndex) {
                        v.classList.remove('active');
                    }
                });

                // Показываем выбранный вариант
                variants[currentIndex].classList.add('active');

                updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

                // ПЕРЕСТРАИВАЕМ МАРШРУТ С НОВЫМ МЕСТОМ
                rebuildRouteWithNewVariant(stageIndex, currentIndex);
            }

            function updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
                const currentIndex = currentVariantIndices[stageIndex];

                prevBtn.disabled = currentIndex === 0;
                nextBtn.disabled = currentIndex === variants.length - 1;
                counter.textContent = `${currentIndex + 1} / ${variants.length}`;
            }

            async function rebuildRouteWithNewVariant(stageIndex, variantIndex) {
                if (!currentWalkData) return;

                console.log(`Переключение этапа ${stageIndex} на вариант ${variantIndex}`);

                // Получаем новое место из варианта
                const activity = currentWalkData.activities[stageIndex];
                if (!activity || !activity.alternatives || !activity.alternatives[variantIndex - 1]) {
                    return;
                }

                const newPlace = activity.alternatives[variantIndex - 1].place;

                // Обновляем выбранное место в данных
                activity.selected_place = newPlace;

                // Очищаем карту
                clearMap();

                // Перестраиваем маршрут с обновленными данными
                const startPoint = {
                    name: currentWalkData.activities[0]?.selected_place?.name || "Старт",
                    coords: allRoutePoints[0]
                };

                await window.displaySmartWalk(currentWalkData, startPoint, null, false);

                // Показываем уведомление
                showQuickNotification(`✅ Место изменено на: ${newPlace.name}`);
            }

            function showQuickNotification(message) {
                const notification = document.createElement('div');
                notification.className = 'quick-notification';
                notification.textContent = message;
                notification.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-weight: 600;
        animation: slideInUp 0.3s ease;
    `;

                document.body.appendChild(notification);

                setTimeout(() => {
                    notification.style.animation = 'slideOutDown 0.3s ease';
                    setTimeout(() => notification.remove(), 300);
                }, 2000);
            }

            // Добавляем CSS для анимации уведомлений
            const notificationStyles = document.createElement('style');
            notificationStyles.textContent = `
    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideOutDown {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(20px);
        }
    }
`;
            document.head.appendChild(notificationStyles);


            // ============================================
            // ОТОБРАЖЕНИЕ ПРОСТОГО МАРШРУТА
            // ============================================
            window.displaySimpleRoute = async function(routeData) {
                clearMap();

                const startCoords = await geocodeAddress(routeData.start_point);
                const endCoords = await geocodeAddress(routeData.end_point);

                const points = [startCoords];

                if (routeData.waypoints && routeData.waypoints.length > 0) {
                    for (const waypoint of routeData.waypoints) {
                        try {
                            const coords = await geocodeAddress(waypoint);
                            points.push(coords);
                        } catch (e) {
                            console.error('Failed to geocode waypoint:', waypoint, e);
                        }
                    }
                }

                points.push(endCoords);

                const modeMapping = {
                    'auto': 'auto',
                    'pedestrian': 'pedestrian',
                    'masstransit': 'masstransit',
                    'bicycle': 'bicycle'
                };

                const yandexMode = modeMapping[routeData.mode] || 'auto';

                ymaps.route(points, {
                    routingMode: yandexMode,
                    mapStateAutoApply: true
                }).then(function(route) {
                    currentRouteLines.push(route);
                    map.geoObjects.add(route);

                    points.forEach((point, index) => {
                        const placemark = new ymaps.Placemark(
                            point, {
                                balloonContent: index === 0 ? 'Старт' : index === points.length - 1 ? 'Финиш' : `Точка ${index}`
                            }, {
                                preset: index === 0 ? 'islands#greenDotIcon' : index === points.length - 1 ? 'islands#redDotIcon' : 'islands#orangeDotIcon'
                            }
                        );
                        routeMarkers.push(placemark);
                        map.geoObjects.add(placemark);
                    });

                    displaySimpleRouteInfo(route, routeData);
                }, function(error) {
                    alert('Невозможно построить маршрут: ' + error.message);
                });
            };

            async function geocodeAddress(address) {
                return new Promise((resolve, reject) => {
                    ymaps.geocode(address, {
                        results: 1
                    }).then(
                        (result) => {
                            const firstGeoObject = result.geoObjects.get(0);
                            if (firstGeoObject) {
                                resolve(firstGeoObject.geometry.getCoordinates());
                            } else {
                                reject(new Error("Адрес не найден"));
                            }
                        },
                        (error) => reject(error)
                    );
                });
            }

            function displaySimpleRouteInfo(route, routeData) {
                const routeInfo = route.getActiveRoute();
                const distance = (routeInfo.properties.get("distance").value / 1000).toFixed(2);
                const duration = formatDuration(routeInfo.properties.get("duration").value);

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
                        <div class="stat-value">${getTransportLabel(routeData.mode)}</div>
                    </div>
                </div>
            `;

                document.getElementById('routeInfoStats').innerHTML = statsHTML;
                document.getElementById('routeStagesList').innerHTML = '';
                document.getElementById('routeInfoPanel').style.display = 'block';
            }

            // ============================================
            // СТАРАЯ ФУНКЦИЯ ДЛЯ СОВМЕСТИМОСТИ
            // ============================================
            window.displaySmartRoute = function(routeData) {
                // Конвертируем в новый формат
                const walkData = {
                    activities: routeData.ordered_route.map((point, idx) => ({
                        activity_type: 'place',
                        selected_place: point,
                        category: 'место',
                        duration_minutes: idx < routeData.ordered_route.length - 1 ? 10 : 0,
                        transport_mode: 'pedestrian'
                    })),
                    total_duration_minutes: routeData.total_time_minutes,
                    warnings: routeData.warnings || []
                };

                const startPoint = {
                    name: routeData.ordered_route[0].name,
                    coords: routeData.ordered_route[0].coords
                };

                window.displaySmartWalk(walkData, startPoint, null, false);
            };

            function clearMap() {
                currentRouteLines.forEach(line => map.geoObjects.remove(line));
                currentRouteLines = [];

                routeMarkers.forEach(marker => map.geoObjects.remove(marker));
                routeMarkers = [];
            }

            function formatDuration(seconds) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);

                if (hours > 0) {
                    return `${hours} ч ${minutes} мин`;
                }
                return `${minutes} мин`;
            }

            document.getElementById('closeRouteInfo').addEventListener('click', function() {
                document.getElementById('routeInfoPanel').style.display = 'none';
            });

            if (window.routeModal) {
                window.routeModal.setMap(map);
            }
        }
    </script>
</body>

</html>