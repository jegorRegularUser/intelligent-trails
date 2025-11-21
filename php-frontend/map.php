<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Карта - RouteMaster</title>
    <link rel="stylesheet" href="assets/style.css">
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
                    <a href="logout.php">Выйти</a>
                <?php else: ?>
                    <a href="login.php">Вход</a>
                    <a href="register.php">Регистрация</a>
                <?php endif; ?>
            </div>
        </div>
    </nav>
    <main class="page-content">
        <div class="container">
            <div id="map-container">
                <div id="controls">
                    <h3>Построение маршрута</h3>
                    <form id="routeForm">
                        <div class="form-group">
                            <label for="from">Откуда</label>
                            <input type="text" id="from" name="from" class="form-control" placeholder="Например, Москва, ул. Тверская, 4">
                        </div>
                        <div class="form-group">
                            <label for="to">Куда</label>
                            <input type="text" id="to" name="to" class="form-control" placeholder="Например, Москва, Кремль">
                        </div>
                        <div class="form-group">
                            <label for="mode">Способ передвижения</label>
                            <select id="mode" name="mode" class="form-control">
                                <option value="auto">На машине</option>
                                <option value="pedestrian">Пешком</option>
                                <option value="masstransit">Общественный транспорт</option>
                            </select>
                        </div>
                        <button type="submit" class="btn-primary">Построить маршрут</button>
                    </form>

                    <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>
                        <div id="history">
                            <h3 style="margin-top: 30px;">Ваша история маршрутов</h3>
                            <div id="history-list"></div>
                        </div>
                    <?php else: ?>
                        <div class="alert alert-info" style="margin-top: 20px;">
                            <a href="login.php">Войдите в аккаунт</a>, чтобы сохранять маршруты и просматривать свою историю.
                        </div>
                    <?php endif; ?>
                </div>
                <div id="map"></div>
            </div>
        </div>
    </main>

    <script>
    ymaps.ready(init);

    function init() {
        var map = new ymaps.Map("map", {
            center: [55.751574, 37.573856],
            zoom: 10,
            controls: ['zoomControl']
        });
        
        var suggestViewFrom = new ymaps.SuggestView('from');
        var suggestViewTo = new ymaps.SuggestView('to');
        var currentRoute;
        var isLoggedIn = <?php echo json_encode(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true); ?>;

        function buildRoute(from, to, mode, save) {
            if (!from || !to) {
                alert("Пожалуйста, укажите начальную и конечную точки маршрута.");
                return;
            }
            
            ymaps.route([from, to], {
                routingMode: mode,
                mapStateAutoApply: true
            }).then(function(route) {
                if (currentRoute) {
                    map.geoObjects.remove(currentRoute);
                }
                currentRoute = route;
                map.geoObjects.add(currentRoute);

                if (save && isLoggedIn) {
                    saveRoute(from, to, mode);
                }
            }, function(error) {
                alert('Невозможно построить маршрут: ' + error.message);
            });
        }
        
        document.getElementById('routeForm').addEventListener('submit', function(e) {
            e.preventDefault();
            buildRoute(
                document.getElementById('from').value,
                document.getElementById('to').value,
                document.getElementById('mode').value,
                true
            );
        });
        
        document.getElementById('history-list').addEventListener('click', function(e) {
            const item = e.target.closest('.route-item');
            if (item) {
                buildRoute(item.dataset.from, item.dataset.to, item.dataset.mode, false);
            }
        });
        
        function saveRoute(from, to, mode) {
            fetch('route_history.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&mode=' + encodeURIComponent(mode)
            }).then(response => response.json()).then(data => {
                if (data.success) {
                    loadHistory();
                }
            });
        }
        
        function loadHistory() {
            if (!isLoggedIn) return;
            fetch('route_history.php').then(response => response.text()).then(html => {
                document.getElementById('history-list').innerHTML = html;
            });
        }
        
        loadHistory();
    }
    </script>
</body>
</html>
