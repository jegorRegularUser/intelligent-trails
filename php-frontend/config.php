<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$host = 'localhost';
$db   = '***REMOVED-MYSQL-DB***';
$user = '***REMOVED-MYSQL-DB***';
$pass = '***REMOVED-MYSQL-PASS***';

$link = new mysqli($host, $user, $pass, $db);

if ($link->connect_error) {
    die('Ошибка подключения к БД (' . $link->connect_errno . '): ' . $link->connect_error);
}

$link->set_charset("utf8mb4");

session_start();

define('YANDEX_CLIENT_ID', '***REMOVED-YANDEX-OAUTH-ID***');
define('YANDEX_CLIENT_SECRET', '***REMOVED-YANDEX-OAUTH-SECRET***');
define('YANDEX_REDIRECT_URI', 'http://dvoinydx.beget.tech/yandex_callback.php');
define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');

?>
