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

        document.getElementById('openRouteModal').addEventListener('click', function() {
            window.routeModal.open();
        });

        // ============================================
        // ОТОБРАЖЕНИЕ УМНОГО МАРШРУТА (СТАРАЯ ВЕРСИЯ)
        // ============================================
        window.displaySmartRoute = function(routeData) {
            clearMap();

            if (!routeData.ordered_route || routeData.ordered_route.length === 0) {
                alert('Не удалось построить маршрут. Попробуйте изменить параметры.');
                return;
            }

            const points = routeData.ordered_route;
            const coordinates = points.map(p => p.coords);

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

            const polyline = new ymaps.Polyline(coordinates, {}, {
                strokeColor: '#667eea',
                strokeWidth: 4,
                strokeOpacity: 0.8
            });
            
            currentPolyline = polyline;
            map.geoObjects.add(polyline);

            map.setBounds(polyline.geometry.getBounds(), {
                checkZoomRange: true,
                zoomMargin: 50
            });

            displaySmartRouteInfo(routeData);
        };

        // ============================================
        // ОТОБРАЖЕНИЕ ПРОСТОГО МАРШРУТА (ИСПРАВЛЕНО)
        // ============================================
        window.displaySimpleRoute = async function(routeData) {
            clearMap();

            // ИСПРАВЛЕНО: Геокодируем адреса перед построением маршрута
            const startCoords = await geocodeAddress(routeData.start_point);
            const endCoords = await geocodeAddress(routeData.end_point);
            
            const points = [startCoords];
            
            // Геокодируем промежуточные точки
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

            // Маппинг режимов для Yandex Router
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

        // Вспомогательная функция геокодирования
        async function geocodeAddress(address) {
            return new Promise((resolve, reject) => {
                ymaps.geocode(address, { results: 1 }).then(
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

        if (window.routeModal) {
            window.routeModal.setMap(map);
        }
    }
    </script>
</body>
</html>
