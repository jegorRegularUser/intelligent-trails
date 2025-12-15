<nav class="navbar">
    <div class="container">
        <a href="index.php" class="logo">
            <span class="logo-icon">✨</span>
            Intelligent Trails
        </a>
        <div class="nav-links">
            <?php if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>
                <a href="map.php">Карта</a>
                <a href="my_routes.php">Мои маршруты</a>
                <a href="profile.php">Профиль (<?php echo htmlspecialchars($_SESSION["username"]); ?>)</a>
                <a href="logout.php">Выход</a>
            <?php else: ?>
                <a href="login.php">Вход</a>
                <a href="register.php">Регистрация</a>
            <?php endif; ?>

        </div>
    </div>
</nav>