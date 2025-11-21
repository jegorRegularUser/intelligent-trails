<?php
require_once "config.php";

if (!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true) {
    header("location: login.php");
    exit;
}

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $current_password = $_POST['current_password'];
    $new_password = $_POST['new_password'];
    $confirm_new_password = $_POST['confirm_new_password'];
    $user_id = $_SESSION['id'];
    $error_message = '';

    if (empty($current_password) || empty($new_password) || empty($confirm_new_password)) {
        $error_message = "Все поля обязательны для заполнения.";
    } elseif (strlen($new_password) < 6) {
        $error_message = "Новый пароль должен содержать не менее 6 символов.";
    } elseif ($new_password !== $confirm_new_password) {
        $error_message = "Новые пароли не совпадают.";
    } else {
        $sql = "SELECT password FROM users WHERE id = ?";
        if ($stmt = $link->prepare($sql)) {
            $stmt->bind_param("i", $user_id);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows == 1) {
                $stmt->bind_result($hashed_password);
                $stmt->fetch();
                
                if (password_verify($current_password, $hashed_password)) {
                    $new_hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
                    $update_sql = "UPDATE users SET password = ? WHERE id = ?";
                    
                    if ($update_stmt = $link->prepare($update_sql)) {
                        $update_stmt->bind_param("si", $new_hashed_password, $user_id);
                        if ($update_stmt->execute()) {
                            header("location: profile.php?status=pw_success");
                            exit();
                        } else {
                            $error_message = "Произошла ошибка при обновлении пароля.";
                        }
                        $update_stmt->close();
                    }
                } else {
                    $error_message = "Текущий пароль введен неверно.";
                }
            }
            $stmt->close();
        }
    }

    if (!empty($error_message)) {
        header("location: profile.php?status=pw_error&message=" . urlencode($error_message));
        exit();
    }
    $link->close();
} else {
    header("location: index.php");
    exit;
}
?>
