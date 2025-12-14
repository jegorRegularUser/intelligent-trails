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
    <link rel="stylesheet" href="assets/styles/route-info-panel.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193&suggest_apikey=1019e534-8f99-42e2-85b2-d0c7ed9ccca2"></script>
</head>

<body <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>data-logged-in="true"<?php endif; ?>>
    <?php require_once "components/navigation.php"; ?>

    <main class="map-page-container">
        <div id="map">
            <div id="map-legend"></div>
            <div id="map-info-panel"></div>
        </div>

        <button class="floating-action-btn" id="openRouteModal" title="Построить маршрут">
            <span class="fab-icon">✨</span>
            <span class="fab-text">Построить маршрут</span>
        </button>

        <div class="route-info-panel" id="routeInfoPanel" style="display: none;">
            <div class="route-info-header">
                <h3>📏 Ваша прогулка</h3>
                <button class="close-panel-btn" id="closeRouteInfo">&times;</button>
            </div>
            <div class="route-info-stats" id="routeInfoStats"></div>
            <div class="route-stages-list" id="routeStagesList"></div>
        </div>
    </main>

    <script src="assets/js/event-bus.js"></script>
    <script src="assets/js/state-manager.js"></script>

    <script src="assets/js/route-modal/route-modal-template.js"></script>
    <script src="assets/js/route-modal/route-modal-yandex.js"></script>
    <script src="assets/js/route-modal/route-modal-waypoints.js"></script>
    <script src="assets/js/route-modal/route-modal-activities.js"></script>
    <script src="assets/js/route-modal/route-modal-builder.js"></script>
    <script src="assets/js/route-modal/route-modal-core.js"></script>

    <script src="assets/js/map/map-place-markers.js"></script>
    <script src="assets/js/map/map-info-panel.js"></script>
    <script src="assets/js/map/map-route-builder.js"></script>
    <script src="assets/js/map/map-smart-walk.js"></script>
    <script src="assets/js/map/map-route-loader.js"></script>
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
    
    <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>
    <script>
        console.log('[MAP.PHP] User is logged in, body data-logged-in should be set');
        console.log('[MAP.PHP] Body dataset:', document.body.dataset);
    </script>
    <?php else: ?>
    <script>
        console.log('[MAP.PHP] User is NOT logged in');
    </script>
    <?php endif; ?>
</body>
</html>