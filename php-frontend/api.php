<?php
require_once "config.php";

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');

function callBackendAPI($endpoint, $method = 'GET', $data = null) {
    $url = BACKEND_API_URL . $endpoint;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json'
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return [
            'code' => 0,
            'data' => null,
            'error' => $error
        ];
    }
    
    return [
        'code' => $httpCode,
        'data' => json_decode($response, true),
        'raw' => $response
    ];
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'build_smart_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        // ИСПРАВЛЕНО: Правильная обработка settings
        $settings = $input['settings'] ?? [];
        if (!is_array($settings)) {
            $settings = [];
        }
        $pace = $settings['pace'] ?? 'balanced';
        $time_strictness = isset($settings['time_strictness']) ? intval($settings['time_strictness']) : 5;
        
        // ИСПРАВЛЕНО: min_places_per_category должен быть объектом, а не массивом
        $min_places = $input['min_places_per_category'] ?? [];
        if (!is_array($min_places) || array_values($min_places) === $min_places) {
            // Если пришёл пустой массив [], преобразуем в пустой объект {}
            $min_places = new stdClass();
        }
        
        // Подготовка данных для бэкенда
        $routeData = [
            'start_point' => [
                'name' => $input['start_point']['name'] ?? 'Начало',
                'coords' => $input['start_point']['coords'] ?? [55.751574, 37.573856]
            ],
            'end_point' => !empty($input['end_point']) ? [
                'name' => $input['end_point']['name'] ?? 'Конец',
                'coords' => $input['end_point']['coords'] ?? null
            ] : null,
            'categories' => $input['categories'] ?? [],
            'time_limit_minutes' => intval($input['time_limit_minutes'] ?? 60),
            'return_to_start' => boolval($input['return_to_start'] ?? false),
            'mode' => $input['mode'] ?? 'pedestrian',
            'min_places_per_category' => $min_places,
            'settings' => [
                'pace' => $pace,
                'time_strictness' => $time_strictness
            ]
        ];
        
        $result = callBackendAPI('/calculate_route', 'POST', $routeData);
        
        if ($result['code'] === 200 && $result['data']) {
            // Сохранить маршрут в историю если пользователь авторизован
            if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
                $userId = $_SESSION["id"];
                $stmt = $link->prepare("INSERT INTO route_history (user_id, route_type, start_point, end_point, categories, time_limit, route_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
                if ($stmt) {
                    $routeType = 'smart';
                    $startName = $routeData['start_point']['name'];
                    $endName = $routeData['end_point']['name'] ?? null;
                    $categoriesJson = json_encode($routeData['categories']);
                    $timeLimit = $routeData['time_limit_minutes'];
                    $routeJson = json_encode($result['data']);
                    $stmt->bind_param("issisis", $userId, $routeType, $startName, $endName, $categoriesJson, $timeLimit, $routeJson);
                    $stmt->execute();
                    $stmt->close();
                }
            }
            
            echo json_encode(['success' => true, 'data' => $result['data']]);
        } else {
            echo json_encode([
                'success' => false, 
                'error' => 'Backend error', 
                'details' => $result['data'] ?? $result['error'] ?? 'Unknown error',
                'raw' => $result['raw'] ?? null
            ]);
        }
        break;
        
    case 'build_simple_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Для простого маршрута возвращаем данные для Yandex Maps
        echo json_encode([
            'success' => true,
            'data' => [
                'type' => 'simple',
                'start_point' => $input['start_point'],
                'end_point' => $input['end_point'],
                'waypoints' => $input['waypoints'] ?? [],
                'mode' => $input['mode'] ?? 'auto'
            ]
        ]);
        
        // Сохранить простой маршрут
        if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
            $userId = $_SESSION["id"];
            $stmt = $link->prepare("INSERT INTO route_history (user_id, route_type, start_point, end_point, transport_mode, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
            if ($stmt) {
                $routeType = 'simple';
                $startName = $input['start_point'];
                $endName = $input['end_point'];
                $mode = $input['mode'] ?? 'auto';
                $stmt->bind_param("issss", $userId, $routeType, $startName, $endName, $mode);
                $stmt->execute();
                $stmt->close();
            }
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
}
?>
