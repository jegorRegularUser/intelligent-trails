<?php
require_once 'config.php';

if (!isset($_GET['code'])) {
    die('Ошибка: Не получен авторизационный код от Яндекса.');
}
$code = $_GET['code'];

$token_request_params = [
    'grant_type'    => 'authorization_code',
    'code'          => $code,
    'client_id'     => YANDEX_CLIENT_ID,
    'client_secret' => YANDEX_CLIENT_SECRET,
];

$ch = curl_init('https://oauth.yandex.ru/token');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($token_request_params));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if (!isset($data['access_token'])) {
    die('Ошибка: Не удалось получить токен доступа. Ответ Яндекса: ' . $response);
}
$access_token = $data['access_token'];

$user_info_ch = curl_init('https://login.yandex.ru/info');
curl_setopt($user_info_ch, CURLOPT_HTTPHEADER, ['Authorization: OAuth ' . $access_token]);
curl_setopt($user_info_ch, CURLOPT_RETURNTRANSFER, true);
$user_info_response = curl_exec($user_info_ch);
curl_close($user_info_ch);

$user_data = json_decode($user_info_response, true);

if (!isset($user_data['id'])) {
    die('Ошибка: Не удалось получить информацию о пользователе Яндекса.');
}

$yandex_id = $user_data['id'];
$yandex_username = $user_data['login'] ?? explode('@', $user_data['default_email'])[0];

$sql = "SELECT id, username FROM users WHERE yandex_id = ?";
if ($stmt = $link->prepare($sql)) {
    $stmt->bind_param("s", $yandex_id);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows == 1) {
        $stmt->bind_result($id, $username);
        $stmt->fetch();

        $_SESSION["loggedin"] = true;
        $_SESSION["id"] = $id;
        $_SESSION["username"] = $username;

        header("location: map.php");
        exit;
    } else {
        $check_username_sql = "SELECT id FROM users WHERE username = ?";
        $check_stmt = $link->prepare($check_username_sql);
        $check_stmt->bind_param("s", $yandex_username);
        $check_stmt->execute();
        $check_stmt->store_result();
        
        if ($check_stmt->num_rows > 0) {
            $yandex_username .= '_' . rand(100, 999);
        }
        $check_stmt->close();
        
        $insert_sql = "INSERT INTO users (username, yandex_id) VALUES (?, ?)";
        if ($insert_stmt = $link->prepare($insert_sql)) {
            $insert_stmt->bind_param("ss", $yandex_username, $yandex_id);
            if ($insert_stmt->execute()) {
                $_SESSION["loggedin"] = true;
                $_SESSION["id"] = $link->insert_id;
                $_SESSION["username"] = $yandex_username;

                header("location: map.php");
                exit;
            } else {
                die("Ошибка при создании нового пользователя.");
            }
            $insert_stmt->close();
        }
    }
    $stmt->close();
}
$link->close();
?>
