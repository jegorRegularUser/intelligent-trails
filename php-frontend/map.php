<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    
    <link rel="stylesheet" href="assets/css/main.css">
    
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
                <h3>📊 Ваша прогулка</h3>
                <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
            </div>

            <div class="route-info-stats" id="routeInfoStats"></div>

            <div class="route-stages-list" id="routeStagesList">
            </div>
        </div>
    </main>

    <!-- Подключаем модульный JS -->
    <script type="module">
        import { RouteModal } from './assets/js/modals/RouteModal.js';
        
        // Инициализируем приложение
        ymaps.ready(() => {
            // Создаём карту
            const map = new ymaps.Map("map", {
                center: [55.751574, 37.573856],
                zoom: 12,
                controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
            });
            
            // Создаём модалку маршрута
            const routeModal = new RouteModal();
            routeModal.setMap(map);
            
            // Делаем глобально доступной
            window.routeModal = routeModal;
            
            // Обработчик кнопки
            document.getElementById('openRouteModal').addEventListener('click', function() {
                console.log('Button clicked, opening modal...');
                routeModal.open();
            });

            // Закрытие панели
            document.getElementById('closeRouteInfo').addEventListener('click', function() {
                document.getElementById('routeInfoPanel').style.display = 'none';
            });
            
            console.log('✅ Map and RouteModal initialized');
        });
    </script>
</body>

</html>
