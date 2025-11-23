<?php
require_once "config.php";
// ... остальной PHP код без изменений ...
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Регистрация</title>
    <link rel="stylesheet" href="assets/css/main.css">
</head>
<body>
    <div class="form-wrapper">
        <h2>Регистрация</h2>
        <p style="text-align: center; margin-bottom: 20px;">Заполните форму для создания аккаунта.</p>
        <form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
            <div class="form-group">
                <label>Имя пользователя</label>
                <input type="text" name="username" class="form-control" value="<?php echo $username; ?>">
                <?php if(!empty($username_err)) echo '<div class="alert alert-danger" style="margin-top:5px; padding: 5px;">'.$username_err.'</div>'; ?>
            </div>    
            <div class="form-group">
                <label>Пароль</label>
                <input type="password" name="password" class="form-control" value="<?php echo $password; ?>">
                <?php if(!empty($password_err)) echo '<div class="alert alert-danger" style="margin-top:5px; padding: 5px;">'.$password_err.'</div>'; ?>
            </div>
            <div class="form-group">
                <label>Подтвердите пароль</label>
                <input type="password" name="confirm_password" class="form-control" value="<?php echo $confirm_password; ?>">
                <?php if(!empty($confirm_password_err)) echo '<div class="alert alert-danger" style="margin-top:5px; padding: 5px;">'.$confirm_password_err.'</div>'; ?>
            </div>
            <div class="form-group">
                <input type="submit" class="btn-primary" value="Зарегистрироваться">
            </div>
             <div class="or-separator">ИЛИ</div>
            <div class="form-group">
                 <a href="yandex_login.php" class="yandex-btn">
                    <img src="https://yastatic.net/s3/doc-binary/freeze/forms/26point/Ya.svg" width="24" height="24" alt="Yandex">
                    Войти через Яндекс
                </a>
            </div>
            <p style="text-align:center;">Уже есть аккаунт? <a href="login.php">Войдите</a>.</p>
        </form>
    </div>    
</body>
</html>
