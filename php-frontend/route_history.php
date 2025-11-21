<?php
require_once "config.php";

if (!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Требуется авторизация']);
    exit;
}

$user_id = $_SESSION["id"];

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Сохранение маршрута
    $from = $_POST["from"] ?? '';
    $to = $_POST["to"] ?? '';
    $mode = $_POST["mode"] ?? '';

    if (!empty($from) && !empty($to) && !empty($mode)) {
        $sql = "INSERT INTO routes (user_id, from_address, to_address, mode) VALUES (?, ?, ?, ?)";
        if ($stmt = $link->prepare($sql)) {
            $stmt->bind_param("isss", $user_id, $from, $to, $mode);
            $stmt->execute();
            $stmt->close();
            header('Content-Type: application/json');
            echo json_encode(['success' => true]);
        }
    } else {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Недостаточно данных']);
    }
} elseif ($_SERVER["REQUEST_METHOD"] == "GET") {
    // Получение истории
    $sql = "SELECT from_address, to_address, mode, DATE_FORMAT(created_at, '%d.%m.%Y %H:%i') as time FROM routes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10";
    if ($stmt = $link->prepare($sql)) {
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                // **НОВОЕ: Добавляем data-атрибуты с данными маршрута**
                echo "<div class='route-item' data-from='" . htmlspecialchars($row['from_address']) . "' data-to='" . htmlspecialchars($row['to_address']) . "' data-mode='{$row['mode']}'>";
                echo "<strong>" . htmlspecialchars($row['from_address']) . " &rarr; " . htmlspecialchars($row['to_address']) . "</strong><br>";
                echo "<small>({$row['mode']}) - {$row['time']}</small></div>";
            }
        } else {
            echo "<p>Ваша история маршрутов пуста.</p>";
        }
        $stmt->close();
    }
}
$link->close();
