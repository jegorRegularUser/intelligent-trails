<?php
require_once "config.php";

if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
    header("location: map.php");
    exit;
}

$username = $password = "";
$username_err = $password_err = $login_err = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (empty(trim($_POST["username"]))) {
        $username_err = "Пожалуйста, введите имя пользователя.";
    } else {
        $username = trim($_POST["username"]);
    }

    if (empty(trim($_POST["password"]))) {
        $password_err = "Пожалуйста, введите пароль.";
    } else {
        $password = trim($_POST["password"]);
    }

    if (empty($username_err) && empty($password_err)) {
        $sql = "SELECT id, username, password FROM users WHERE username = ?";
        if ($stmt = $link->prepare($sql)) {
            $stmt->bind_param("s", $param_username);
            $param_username = $username;
            if ($stmt->execute()) {
                $stmt->store_result();
                if ($stmt->num_rows == 1) {
                    $stmt->bind_result($id, $username, $hashed_password);
                    if ($stmt->fetch()) {
                        if (password_verify($password, $hashed_password)) {
                            $_SESSION["loggedin"] = true;
                            $_SESSION["id"] = $id;
                            $_SESSION["username"] = $username;
                            header("location: map.php");
                        } else {
                            $login_err = "Неверное имя пользователя или пароль.";
                        }
                    }
                } else {
                    $login_err = "Неверное имя пользователя или пароль.";
                }
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
    <title>Вход</title>
    <link rel="stylesheet" href="assets/css/main.css">
</head>
<body>
<div class="form-wrapper">
    <h2>Вход</h2>
    <p style="text-align: center; margin-bottom: 20px;">Введите свои учетные данные для входа.</p>
    <?php 
    if(!empty($login_err)){
        echo '<div class="alert alert-danger">' . $login_err . '</div>';
    }        
    ?>
    <form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
        <div class="form-group">
            <label>Имя пользователя</label>
            <input type="text" name="username" class="form-control" value="<?php echo $username; ?>">
        </div>    
        <div class="form-group">
            <label>Пароль</label>
            <input type="password" name="password" class="form-control">
        </div>
        <div class="form-group">
            <input type="submit" class="btn-primary" value="Войти">
        </div>
        <div class="or-separator">ИЛИ</div>
        <div class="form-group">
             <a href="yandex_login.php" class="yandex-btn">
                <img src="https://yastatic.net/s3/doc-binary/freeze/forms/26point/Ya.svg" width="24" height="24" alt="Yandex">
                Войти через Яндекс
            </a>
        </div>
        <p style="text-align:center;">Нет аккаунта? <a href="register.php">Зарегистрируйтесь</a>.</p>
    </form>
</div>
</body>
</html>
