<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
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

    <main class="page-content">
        <div class="map-page-container">
            <div id="map"></div>
            
            <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
                <span class="fab-icon">🗺️</span>
                <span class="fab-text">Построить маршрут</span>
            </button>

            <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
                <div class="route-info-header">
                    <h3>Информация о маршруте</h3>
                    <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
                </div>
                <div class="route-info-body" id="routeInfoBody"></div>
            </div>
        </div>
    </main>

    <script src="assets/route-modal.js"></script>
    <script>
    ymaps.ready(init);

    function init() {
        var map = new ymaps.Map("map", {
            center: [55.751574, 37.573856],
            zoom: 10,
            controls: ['zoomControl', 'fullscreenControl']
        });
        
        var currentRoute = null;
        var routeMarkers = [];

        // Открытие модального окна
        document.getElementById('openRouteModal').addEventListener('click', function() {
            window.routeModal.open();
        });

        // Функция отображения маршрута на карте
        window.currentMapRoute = function(routeData) {
            // Очистить предыдущий маршрут
            if (currentRoute) {
                map.geoObjects.remove(currentRoute);
            }
            routeMarkers.forEach(marker => map.geoObjects.remove(marker));
            routeMarkers = [];

            // Построить новый маршрут
            const points = [routeData.start_point, ...routeData.waypoints, routeData.end_point];
            
            ymaps.route(points, {
                routingMode: routeData.transport_mode,
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

                // Показать информацию о маршруте
                displayRouteInfo(route, routeData);
            }, function(error) {
                alert('Невозможно построить маршрут: ' + error.message);
            });
        };

        function displayRouteInfo(route, routeData) {
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
                        <div class="stat-value">${getTransportLabel(routeData.transport_mode)}</div>
                    </div>
                </div>
            `;

            document.getElementById('routeInfoBody').innerHTML = infoHTML;
            document.getElementById('routeInfoPanel').style.display = 'block';
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
