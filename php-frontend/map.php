<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/modal-styles.css">
    <link rel="stylesheet" href="assets/styles/map-controls.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193&suggest_apikey=1019e534-8f99-42e2-85b2-d0c7ed9ccca2"></script>
</head>

<body>
    <?php require_once "components/navigation.php"; ?>

    <main class="map-page-container">
        <div id="map">
            <!-- НОВЫЕ КОНТЕЙНЕРЫ -->
            <div id="map-legend"></div>
            <div id="map-info-panel"></div>
        </div>

        <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
            <span class="fab-icon">✨</span>
            <span class="fab-text">Построить маршрут</span>
        </button>

        <!-- СТАРАЯ ПАНЕЛЬ (можно оставить для совместимости) -->
        <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
            <div class="route-info-header">
                <h3>📊 Ваша прогулка</h3>
                <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
            </div>
            <div class="route-info-stats" id="routeInfoStats"></div>
            <div class="route-stages-list" id="routeStagesList"></div>
        </div>
    </main>

    <script src="assets/js/event-bus.js"></script>
    <script src="assets/js/state-manager.js"></script>

    <!-- Route Modal Scripts -->
    <script src="assets/js/route-modal/route-modal-template.js"></script>
    <script src="assets/js/route-modal/route-modal-yandex.js"></script>
    <script src="assets/js/route-modal/route-modal-waypoints.js"></script>
    <script src="assets/js/route-modal/route-modal-activities.js"></script>
    <script src="assets/js/route-modal/route-modal-builder.js"></script>
    <script src="assets/js/route-modal/route-modal-core.js"></script>

    <!-- Map Scripts  -->
    <script src="assets/js/map/map-legend.js"></script>
    <script src="assets/js/map/map-place-markers.js"></script>
    <script src="assets/js/map/map-info-panel.js"></script>
    <script src="assets/js/map/map-variants.js"></script>
    <script src="assets/js/map/map-simple-route.js"></script>
    <script src="assets/js/map/map-smart-walk.js"></script>
    <script src="assets/js/map/map-core.js"></script>

    <script>
    ymaps.ready(function() {
        console.log('[MAP.PHP] Yandex Maps ready, initializing...');
        
        if (window.MapCore) {
            window.MapCore.init();
        } else {
            console.error('[MAP.PHP] MapCore not found!');
        }
    });
    </script>
</body>
</html>
