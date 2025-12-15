<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$host = 'localhost';
$db   = 'dvoinydx_db';
$user = 'dvoinydx_db';
$pass = 'root1221!';

$link = new mysqli($host, $user, $pass, $db);

if ($link->connect_error) {
    die('Ошибка подключения к БД (' . $link->connect_errno . '): ' . $link->connect_error);
}

$link->set_charset("utf8mb4");

session_start();

define('YANDEX_CLIENT_ID', 'c77ba8c142f54e4b87a2ae8f0be20c37');
define('YANDEX_CLIENT_SECRET', 'd01a3a1dde264599ba61b4d1a9a25253');
define('YANDEX_REDIRECT_URI', 'http://dvoinydx.beget.tech/yandex_callback.php');


if ($_SERVER['HTTP_HOST'] === 'localhost' || $_SERVER['HTTP_HOST'] === 'localhost:80') {
    define('BACKEND_API_URL', 'http://localhost:8000');
} else {
    define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');
}
?>
