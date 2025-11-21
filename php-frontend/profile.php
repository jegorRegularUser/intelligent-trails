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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Профиль - <?php echo htmlspecialchars($_SESSION["username"]); ?></title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/landing-styles.css">
</head>
<body>
    <?php require_once "components/navigation.php"; ?>
    
    <div style="padding: 60px 20px; min-height: calc(100vh - 70px); background: linear-gradient(to bottom, #f9fafb, #ffffff);">
        <div class="form-wrapper" style="max-width: 700px;">
            <h2 style="margin-bottom: 15px;">👤 Профиль пользователя</h2>
            <p style="text-align: center; font-size: 18px; margin-bottom: 40px; color: #6b7280;">
                Добро пожаловать, <strong style="color: #667eea;"><?php echo htmlspecialchars($_SESSION["username"]); ?></strong>!
            </p>
            
            <!-- Информационная карточка -->
            <div style="background: linear-gradient(135deg, #f0f4ff 0%, #e8ecff 100%); padding: 25px; border-radius: 16px; margin-bottom: 35px; border: 2px solid #c7d2fe;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; color: white; font-weight: 800;">
                        <?php echo strtoupper(substr($_SESSION["username"], 0, 1)); ?>
                    </div>
                    <div>
                        <h3 style="margin: 0 0 5px 0; color: #1f2937; font-size: 22px;"><?php echo htmlspecialchars($_SESSION["username"]); ?></h3>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">
                            <?php echo $has_password ? '🔐 Локальный аккаунт' : '🌐 Вход через Яндекс'; ?>
                        </p>
                    </div>
                </div>
            </div>

            <?php if ($has_password): ?>
                <div style="border-top: 2px solid #f0f2f5; padding-top: 35px;">
                    <h3 style="margin-bottom: 20px; font-size: 22px; color: #1f2937; display: flex; align-items: center; gap: 10px;">
                        🔒 Смена пароля
                    </h3>

                    <?php 
                    if(isset($_GET['status'])){
                        if($_GET['status'] == 'pw_success'){
                            echo '<div class="alert alert-success">✅ Пароль успешно изменен!</div>';
                        } elseif($_GET['status'] == 'pw_error'){
                            echo '<div class="alert alert-danger">❌ ' . htmlspecialchars($_GET['message']) . '</div>';
                        }
                    }
                    ?>

                    <form action="change_password.php" method="post">
                        <div class="form-group">
                            <label>Текущий пароль</label>
                            <input type="password" name="current_password" class="form-control" required placeholder="Введите текущий пароль">
                        </div>
                        <div class="form-group">
                            <label>Новый пароль</label>
                            <input type="password" name="new_password" class="form-control" required placeholder="Минимум 6 символов">
                        </div>
                        <div class="form-group">
                            <label>Подтвердите новый пароль</label>
                            <input type="password" name="confirm_new_password" class="form-control" required placeholder="Повторите новый пароль">
                        </div>
                        <div class="form-group" style="margin-top: 30px;">
                            <button type="submit" class="btn-primary">
                                Сменить пароль
                            </button>
                        </div>
                    </form>
                </div>
            <?php else: ?>
                <div class="alert alert-info" style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px; padding: 25px;">
                    <span style="font-size: 48px;">🔐</span>
                    <div>
                        <strong>Вход через Яндекс</strong><br>
                        Вы используете авторизацию через Яндекс.<br>
                        Смена пароля для таких аккаунтов недоступна.
                    </div>
                </div>
            <?php endif; ?>

            <!-- Дополнительные действия -->
            <div style="margin-top: 35px; padding-top: 35px; border-top: 2px solid #f0f2f5; display: flex; gap: 15px; flex-wrap: wrap;">
                <a href="map.php" style="flex: 1; min-width: 200px; padding: 14px 20px; background: white; border: 2px solid #e5e7eb; border-radius: 12px; text-align: center; text-decoration: none; color: #374151; font-weight: 600; transition: all 0.3s ease;">
                    🗺️ Перейти к карте
                </a>
                <a href="route_history.php" style="flex: 1; min-width: 200px; padding: 14px 20px; background: white; border: 2px solid #e5e7eb; border-radius: 12px; text-align: center; text-decoration: none; color: #374151; font-weight: 600; transition: all 0.3s ease;">
                    📜 История маршрутов
                </a>
            </div>
        </div>
    </div>

    <style>
        .form-wrapper a[href]:hover {
            border-color: #667eea;
            background: #f9fafb;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.15);
        }
    </style>
</body>
</html>
