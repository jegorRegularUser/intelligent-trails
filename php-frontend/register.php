<?php
require_once "config.php";

if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
    header("location: map.php");
    exit;
}

$username = $password = $confirm_password = "";
$username_err = $password_err = $confirm_password_err = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (empty(trim($_POST["username"]))) {
        $username_err = "Пожалуйста, введите имя пользователя.";
    } else {
        $sql = "SELECT id FROM users WHERE username = ?";
        if ($stmt = $link->prepare($sql)) {
            $stmt->bind_param("s", $param_username);
            $param_username = trim($_POST["username"]);
            if ($stmt->execute()) {
                $stmt->store_result();
                if ($stmt->num_rows == 1) {
                    $username_err = "Это имя пользователя уже занято.";
                } else {
                    $username = trim($_POST["username"]);
                }
            } else {
                echo "Что-то пошло не так. Пожалуйста, попробуйте позже.";
            }
            $stmt->close();
        }
    }

    if (empty(trim($_POST["password"]))) {
        $password_err = "Пожалуйста, введите пароль.";
    } elseif (strlen(trim($_POST["password"])) < 6) {
        $password_err = "Пароль должен содержать не менее 6 символов.";
    } else {
        $password = trim($_POST["password"]);
    }

    if (empty(trim($_POST["confirm_password"]))) {
        $confirm_password_err = "Пожалуйста, подтвердите пароль.";
    } else {
        $confirm_password = trim($_POST["confirm_password"]);
        if (empty($password_err) && ($password != $confirm_password)) {
            $confirm_password_err = "Пароли не совпадают.";
        }
    }

    if (empty($username_err) && empty($password_err) && empty($confirm_password_err)) {
        $sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        if ($stmt = $link->prepare($sql)) {
            $stmt->bind_param("ss", $param_username, $param_password);
            $param_username = $username;
            $param_password = password_hash($password, PASSWORD_DEFAULT);
            if ($stmt->execute()) {
                header("location: login.php");
            } else {
                echo "Что-то пошло не так. Пожалуйста, попробуйте позже.";
            }
            $stmt->close();
        }
    }
    $link->close();
}
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
