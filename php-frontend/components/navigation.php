<?php /** Навигация-компонент */?>
<nav class="navbar">
    <div class="container">
        <a href="index.php" class="logo">
            <span class="logo-icon">✨</span>
            Intelligent Trails
        </a>
        <div class="nav-links">
            <a href="map.php">Карта</a>
            <?php if(isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true): ?>
                <a href="profile.php">Профиль</a>
                <a href="logout.php">Выйти</a>
            <?php else: ?>
                <a href="login.php">Вход</a>
                <a href="register.php" class="btn-register">Регистрация</a>
            <?php endif; ?>
        </div>
    </div>
</nav>
