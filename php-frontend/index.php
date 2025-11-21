<?php require_once "config.php"; ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>RouteMaster - Ваш умный планировщик маршрутов</title>
    <link rel="stylesheet" href="assets/style.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" rel="stylesheet">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="index.php" class="logo">RouteMaster</a>
            <div class="nav-links">
                <a href="map.php">Карта</a>
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

    <header class="hero">
        <h1>Ваш путь, ваш выбор, ваша скорость</h1>
        <p>Интеллектуальное планирование маршрутов на автомобиле, пешком и на общественном транспорте. Откройте для себя самый быстрый и удобный путь с RouteMaster.</p>
        <a href="map.php" class="cta-button">Начать планирование</a>
    </header>

    <main>
        <section class="features-section">
            <div class="container">
                <div class="features-grid">
                    <div class="feature-item">
                        <div class="icon"><i class="fas fa-map-marked-alt"></i></div>
                        <h3>Интерактивная Карта</h3>
                        <p>Современная и быстрая карта от Яндекса для визуализации и построения маршрутов в реальном времени.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon"><i class="fas fa-route"></i></div>
                        <h3>Гибкие Маршруты</h3>
                        <p>Выбирайте, как вам удобно передвигаться: на машине, пешком или используя общественный транспорт.</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon"><i class="fas fa-history"></i></div>
                        <h3>История Поездок</h3>
                        <p>Авторизуйтесь, чтобы сохранять все свои маршруты и возвращаться к ним в любой момент.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="content-section">
            <div class="container">
                <div class="text-content">
                    <h2>Сохраняйте и управляйте</h2>
                    <p>Создайте аккаунт, чтобы разблокировать полный потенциал RouteMaster. Ваша персональная история маршрутов позволяет вам одним кликом восстанавливать прошлые поездки на карте, анализировать свои передвижения и планировать будущие путешествия еще эффективнее.</p>
                    <a href="register.php" class="cta-button" style="background-color: #28a745; color: white;">Создать аккаунт</a>
                </div>
                <div class="visual-content">
                    <img src="https://via.placeholder.com/500x300.png/007BFF/FFFFFF?text=История+маршрутов" alt="История маршрутов">
                </div>
            </div>
        </section>
    </main>

</body>
</html>
