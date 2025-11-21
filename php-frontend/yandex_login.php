<?php
require_once 'config.php';

$params = [
    'response_type' => 'code',
    'client_id'     => YANDEX_CLIENT_ID,
    'redirect_uri'  => YANDEX_REDIRECT_URI,
    'force_confirm' => 'yes'
];

$url = 'https://oauth.yandex.ru/authorize?' . http_build_query($params);
header('Location: ' . $url);
exit;
?>
