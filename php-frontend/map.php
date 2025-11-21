<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Карта - RouteMaster</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/modal-styles.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193&suggest_apikey=1019e534-8f99-42e2-85b2-d0c7ed9ccca2"></script>
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="index.php" class="logo">RouteMaster</a>
            <div class="nav-links">
                <a href="map.php" class="active">Карта</a>
                <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>
                    <a href="profile.php">Профиль</a>
                    <a href="route_history.php">История</a>
                    <a href="logout.php">Выйти</a>
                <?php else: ?>
                    <a href="login.php">Вход</a>
                    <a href="register.php">Регистрация</a>
                <?php endif; ?>
            </div>
        </div>
    </nav>

    <main class="map-page-container">
        <div id="map"></div>
        
        <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
            <span class="fab-icon">✨</span>
            <span class="fab-text">Построить маршрут</span>
        </button>

        <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
            <div class="route-info-header">
                <h3>📊 Информация о маршруте</h3>
                <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
            </div>
            <div class="route-info-body" id="routeInfoBody"></div>
            <div class="route-places-list" id="routePlacesList"></div>
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
        
        var currentRoute = null;
        var routeMarkers = [];
        var currentPolyline = null;

        // Открытие модального окна
        document.getElementById('openRouteModal').addEventListener('click', function() {
            window.routeModal.open();
        });

        // ============================================
        // ОТОБРАЖЕНИЕ УМНОГО МАРШРУТА
        // ============================================
        window.displaySmartRoute = function(routeData) {
            clearMap();

            if (!routeData.ordered_route || routeData.ordered_route.length === 0) {
                alert('Не удалось построить маршрут. Попробуйте изменить параметры.');
                return;
            }

            const points = routeData.ordered_route;
            const coordinates = points.map(p => p.coords);

            // Создать маркеры для всех точек
            points.forEach((point, index) => {
                let iconPreset, iconColor;
                
                if (index === 0) {
                    iconPreset = 'islands#greenDotIcon';
                    iconColor = '#10b981';
                } else if (index === points.length - 1) {
                    iconPreset = 'islands#redDotIcon';
                    iconColor = '#ef4444';
                } else {
                    iconPreset = 'islands#blueDotIcon';
                    iconColor = '#3b82f6';
                }

                const placemark = new ymaps.Placemark(
                    point.coords,
                    {
                        balloonContent: `<strong>${point.name}</strong><br>Точка ${index + 1}`,
                        iconCaption: `${index + 1}. ${point.name}`
                    },
                    {
                        preset: iconPreset,
                        iconColor: iconColor
                    }
                );
                
                routeMarkers.push(placemark);
                map.geoObjects.add(placemark);
            });

            // Построить линию маршрута
            const polyline = new ymaps.Polyline(coordinates, {}, {
                strokeColor: '#667eea',
                strokeWidth: 4,
                strokeOpacity: 0.8
            });
            
            currentPolyline = polyline;
            map.geoObjects.add(polyline);

            // Центрировать карту на маршруте
            map.setBounds(polyline.geometry.getBounds(), {
                checkZoomRange: true,
                zoomMargin: 50
            });

            // Показать информацию о маршруте
            displaySmartRouteInfo(routeData);
        };

        // ============================================
        // ОТОБРАЖЕНИЕ ПРОСТОГО МАРШРУТА
        // ============================================
        window.displaySimpleRoute = function(routeData) {
            clearMap();

            const points = [routeData.start_point];
            if (routeData.waypoints && routeData.waypoints.length > 0) {
                points.push(...routeData.waypoints);
            }
            points.push(routeData.end_point);

            ymaps.route(points, {
                routingMode: routeData.mode,
                mapStateAutoApply: true
            }).then(function(route) {
                currentRoute = route;
                map.geoObjects.add(route);

                // Добавить маркеры
                points.forEach((point, index) => {
                    const placemark = new ymaps.Placemark(
                        point,
                        {
                            balloonContent: index === 0 ? 'Старт' : 
                                          index === points.length - 1 ? 'Финиш' : 
                                          `Точка ${index}`
                        },
                        {
                            preset: index === 0 ? 'islands#greenDotIcon' : 
                                   index === points.length - 1 ? 'islands#redDotIcon' : 
                                   'islands#orangeDotIcon'
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

        // ============================================
        // ОТОБРАЖЕНИЕ ИНФОРМАЦИИ О МАРШРУТЕ
        // ============================================
        function displaySmartRouteInfo(routeData) {
            const infoHTML = `
                <div class="route-stat">
                    <span class="stat-icon">📏</span>
                    <div>
                        <div class="stat-label">Общее время</div>
                        <div class="stat-value">${routeData.total_time_minutes} мин</div>
                    </div>
                </div>
                <div class="route-stat">
                    <span class="stat-icon">📍</span>
                    <div>
                        <div class="stat-label">Точек в маршруте</div>
                        <div class="stat-value">${routeData.ordered_route.length}</div>
                    </div>
                </div>
                <div class="route-stat">
                    <span class="stat-icon">🚶</span>
                    <div>
                        <div class="stat-label">Способ</div>
                        <div class="stat-value">Пешком</div>
                    </div>
                </div>
                ${routeData.warnings && routeData.warnings.length > 0 ? `
                    <div class="route-warnings">
                        <strong>⚠️ Предупреждения:</strong>
                        ${routeData.warnings.map(w => `<div class="warning-item">${w}</div>`).join('')}
                    </div>
                ` : ''}
            `;

            // Список мест
            const placesHTML = `
                <div class="places-header">🗺️ Маршрут</div>
                ${routeData.ordered_route.map((place, index) => `
                    <div class="place-item ${index === 0 ? 'start' : index === routeData.ordered_route.length - 1 ? 'end' : ''}">
                        <span class="place-number">${index + 1}</span>
                        <span class="place-name">${place.name}</span>
                    </div>
                `).join('')}
            `;

            document.getElementById('routeInfoBody').innerHTML = infoHTML;
            document.getElementById('routePlacesList').innerHTML = placesHTML;
            document.getElementById('routeInfoPanel').style.display = 'block';
        }

        function displaySimpleRouteInfo(route, routeData) {
            const routeInfo = route.getActiveRoute();
            const distance = (routeInfo.properties.get("distance").value / 1000).toFixed(2);
            const duration = formatDuration(routeInfo.properties.get("duration").value);

            const infoHTML = `
                <div class="route-stat">
                    <span class="stat-icon">📏</span>
                    <div>
                        <div class="stat-label">Расстояние</div>
                        <div class="stat-value">${distance} км</div>
                    </div>
                </div>
                <div class="route-stat">
                    <span class="stat-icon">⏱️</span>
                    <div>
                        <div class="stat-label">Время в пути</div>
                        <div class="stat-value">${duration}</div>
                    </div>
                </div>
                <div class="route-stat">
                    <span class="stat-icon">🚗</span>
                    <div>
                        <div class="stat-label">Способ</div>
                        <div class="stat-value">${getTransportLabel(routeData.mode)}</div>
                    </div>
                </div>
            `;

            document.getElementById('routeInfoBody').innerHTML = infoHTML;
            document.getElementById('routePlacesList').innerHTML = '';
            document.getElementById('routeInfoPanel').style.display = 'block';
        }

        function clearMap() {
            if (currentRoute) {
                map.geoObjects.remove(currentRoute);
                currentRoute = null;
            }
            if (currentPolyline) {
                map.geoObjects.remove(currentPolyline);
                currentPolyline = null;
            }
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

        function getTransportLabel(mode) {
            const labels = {
                'auto': 'Автомобиль',
                'pedestrian': 'Пешком',
                'masstransit': 'Общественный транспорт',
                'bicycle': 'Велосипед'
            };
            return labels[mode] || mode;
        }

        document.getElementById('closeRouteInfo').addEventListener('click', function() {
            document.getElementById('routeInfoPanel').style.display = 'none';
        });

        // Установить карту в модальное окно
        if (window.routeModal) {
            window.routeModal.setMap(map);
        }
    }
    </script>
</body>
</html>
