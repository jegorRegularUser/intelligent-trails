<?php
require_once "config.php";

header('Content-Type: application/json');

// URL вашего бэкенда
define('BACKEND_API_URL', 'http://localhost:8000/api'); // Измените на ваш URL

function callBackendAPI($endpoint, $method = 'GET', $data = null) {
    $url = BACKEND_API_URL . $endpoint;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
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
    curl_close($ch);
    
    return [
        'code' => $httpCode,
        'data' => json_decode($response, true)
    ];
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'build_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $routeData = [
            'start_point' => $input['start_point'] ?? '',
            'end_point' => $input['end_point'] ?? '',
            'transport_mode' => $input['transport_mode'] ?? 'auto',
            'preferences' => [
                'avoid_tolls' => $input['avoid_tolls'] ?? false,
                'avoid_traffic' => $input['avoid_traffic'] ?? false,
                'scenic_route' => $input['scenic_route'] ?? false,
                'fastest_route' => $input['fastest_route'] ?? true
            ],
            'waypoints' => $input['waypoints'] ?? []
        ];
        
        $result = callBackendAPI('/route/build', 'POST', $routeData);
        
        if ($result['code'] === 200) {
            // Сохранить маршрут в историю если пользователь авторизован
            if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
                $userId = $_SESSION["id"];
                $stmt = $link->prepare("INSERT INTO route_history (user_id, start_point, end_point, transport_mode, route_data, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
                $routeJson = json_encode($result['data']);
                $stmt->bind_param("issss", $userId, $input['start_point'], $input['end_point'], $input['transport_mode'], $routeJson);
                $stmt->execute();
            }
            
            echo json_encode(['success' => true, 'data' => $result['data']]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Backend error', 'details' => $result['data']]);
        }
        break;
        
    case 'get_suggestions':
        $query = $_GET['query'] ?? '';
        $result = callBackendAPI('/geocode/suggest?query=' . urlencode($query));
        echo json_encode($result['data'] ?? []);
        break;
        
    case 'optimize_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $result = callBackendAPI('/route/optimize', 'POST', $input);
        
        echo json_encode(['success' => $result['code'] === 200, 'data' => $result['data']]);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
}
?>
