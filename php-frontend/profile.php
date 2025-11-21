<?php
require_once "config.php";

if (!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true) {
    header("location: login.php");
    exit;
}

$user_id = $_SESSION["id"];
$has_password = false;
$sql_check_pass = "SELECT password FROM users WHERE id = ?";
if($stmt_check = $link->prepare($sql_check_pass)){
    $stmt_check->bind_param("i", $user_id);
    $stmt_check->execute();
    $stmt_check->bind_result($password_hash);
    if($stmt_check->fetch()){
        if(!empty($password_hash)){
            $has_password = true;
        }
    }
    $stmt_check->close();
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Профиль - <?php echo htmlspecialchars($_SESSION["username"]); ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="index.php" class="logo">RouteMaster</a>
            <div class="nav-links">
                <a href="map.php">Карта</a>
                <a href="profile.php" class="active">Профиль</a>
                <a href="logout.php">Выйти</a>
            </div>
        </div>
    </nav>
    <div class="container">
        <div class="form-wrapper" style="max-width: 600px; margin-top: 50px;">
            <h2 style="margin-bottom: 20px;">Профиль пользователя</h2>
            <p style="text-align: center; font-size: 18px; margin-bottom: 30px;">
                Добро пожаловать, <b><?php echo htmlspecialchars($_SESSION["username"]); ?></b>!
            </p>
            
            <?php if ($has_password): ?>
                <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;">
                <h3>Смена пароля</h3>

                <?php 
                if(isset($_GET['status'])){
                    if($_GET['status'] == 'pw_success'){
                        echo '<div class="alert alert-success">Пароль успешно изменен.</div>';
                    } elseif($_GET['status'] == 'pw_error'){
                        echo '<div class="alert alert-danger">' . htmlspecialchars($_GET['message']) . '</div>';
                    }
                }
                ?>

                <form action="change_password.php" method="post">
                    <div class="form-group">
                        <label>Текущий пароль</label>
                        <input type="password" name="current_password" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Новый пароль (минимум 6 символов)</label>
                        <input type="password" name="new_password" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Подтвердите новый пароль</label>
                        <input type="password" name="confirm_new_password" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <input type="submit" class="btn-primary" value="Сменить пароль">
                    </div>
                </form>
            <?php else: ?>
                <div class="alert alert-info" style="text-align: center; margin-top: 20px;">
                    Вы вошли через аккаунт Яндекса, поэтому у вас нет локального пароля для смены.
                </div>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
