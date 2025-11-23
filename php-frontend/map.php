<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    
    <!-- Новая модульная архитектура CSS -->
    <link rel="stylesheet" href="assets/css/main.css">
    
    <!-- Yandex Maps API -->
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

    <!-- Новая модульная архитектура JS -->
    <script type="module" src="assets/js/app.js"></script>
    
    <!-- Map initialization and compatibility layer -->
    <script>
        ymaps.ready(init);

        function init() {
            var map = new ymaps.Map("map", {
                center: [55.751574, 37.573856],
                zoom: 12,
                controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
            });

            // Передаём карту в RouteModal когда он инициализируется
            function waitForRouteModal() {
                if (window.routeModal) {
                    window.routeModal.setMap(map);
                } else {
                    setTimeout(waitForRouteModal, 100);
                }
            }
            waitForRouteModal();

            // Обработчик кнопки открытия модалки
            document.getElementById('openRouteModal').addEventListener('click', function() {
                if (window.routeModal) {
                    window.routeModal.open();
                } else {
                    console.error('RouteModal not initialized yet');
                }
            });

            // Обработчик закрытия панели
            document.getElementById('closeRouteInfo').addEventListener('click', function() {
                document.getElementById('routeInfoPanel').style.display = 'none';
            });
        }
    </script>
</body>

</html>