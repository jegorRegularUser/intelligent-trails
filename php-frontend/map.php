<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intelligent Trails - Карта</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/modal-styles.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=***REMOVED-YANDEX-MAPS-KEY***&suggest_apikey=***REMOVED-YANDEX-SUGGEST-KEY***"></script>
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

    <script src="assets/js/route-modal/route-modal-template.js"></script>
    <script src="assets/js/route-modal/route-modal-yandex.js"></script>
    <script src="assets/js/route-modal/route-modal-waypoints.js"></script>
    <script src="assets/js/route-modal/route-modal-activities.js"></script>
    <script src="assets/js/route-modal/route-modal-builder.js"></script>
    <script src="assets/js/route-modal/route-modal-core.js"></script>

    <!-- Map Scripts -->
    <script src="assets/js/map/map-info-panel.js"></script>
    <script src="assets/js/mapl/map-variants.js"></script>
    <script src="assets/js/map/map-simple-route.js"></script>
    <script src="assets/js/map/map-smart-walk.js"></script>
    <script src="assets/js/map/map-core.js"></script>
</body>

</html>