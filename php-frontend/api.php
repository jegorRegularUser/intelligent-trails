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
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
    
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

function saveRouteToDatabase($userId, $routeType, $routeData, $result) {
    global $link;
    
    $routeName = 'Маршрут ' . date('d.m.Y H:i');
    $startPoint = '';
    $endPoint = null;
    $categories = null;
    $timeLimit = null;
    $transportMode = 'pedestrian';
    $returnToStart = 0;
    $minPlacesPerCategory = null;
    $pace = 'balanced';
    $timeStrictness = 5;
    $routeDataJson = json_encode($result);
    $totalDistance = null;
    $totalTime = null;
    $placesCount = 0;
    
    // Извлекаем данные в зависимости от типа маршрута
    if ($routeType === 'simple') {
        $startPoint = $routeData['start_point'] ?? '';
        $endPoint = $routeData['end_point'] ?? null;
        $transportMode = $routeData['mode'] ?? 'auto';
        
    } elseif ($routeType === 'smart') {
        $startPoint = $routeData['start_point']['name'] ?? 'Начало';
        $endPoint = isset($routeData['end_point']) && !empty($routeData['end_point']) ? ($routeData['end_point']['name'] ?? null) : null;
        $categories = json_encode($routeData['categories'] ?? []);
        $timeLimit = intval($routeData['time_limit_minutes'] ?? 60);
        $transportMode = $routeData['mode'] ?? 'pedestrian';
        $returnToStart = $routeData['return_to_start'] ? 1 : 0;
        $minPlacesPerCategory = json_encode($routeData['min_places_per_category'] ?? new stdClass());
        $pace = $routeData['settings']['pace'] ?? 'balanced';
        $timeStrictness = intval($routeData['settings']['time_strictness'] ?? 5);
        
        // Извлекаем статистику из результата
        if (isset($result['total_distance'])) {
            $totalDistance = floatval($result['total_distance']);
        }
        if (isset($result['total_time'])) {
            $totalTime = intval($result['total_time']);
        }
        if (isset($result['places']) && is_array($result['places'])) {
            $placesCount = count($result['places']);
        }
        
    } elseif ($routeType === 'smart_walk') {
        $startPoint = $routeData['start_point']['name'] ?? 'Начало';
        
        if (isset($result['total_distance'])) {
            $totalDistance = floatval($result['total_distance']);
        }
        if (isset($result['total_time'])) {
            $totalTime = intval($result['total_time']);
        }
        if (isset($result['places']) && is_array($result['places'])) {
            $placesCount = count($result['places']);
        }
    }
    
    $stmt = $link->prepare("INSERT INTO saved_routes (
        user_id, route_name, route_type, start_point, end_point, categories, 
        time_limit, transport_mode, return_to_start, min_places_per_category,
        pace, time_strictness, route_data, total_distance, total_time, places_count,
        created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
    
    if ($stmt) {
        $stmt->bind_param("isssssisississdii", 
            $userId, $routeName, $routeType, $startPoint, $endPoint, $categories,
            $timeLimit, $transportMode, $returnToStart, $minPlacesPerCategory,
            $pace, $timeStrictness, $routeDataJson, $totalDistance, $totalTime, $placesCount
        );
        $success = $stmt->execute();
        $routeId = $stmt->insert_id;
        $stmt->close();
        
        if ($success) {
            error_log("[API] Route saved successfully. ID: $routeId, Type: $routeType");
            return $routeId;
        } else {
            error_log("[API] Failed to save route: " . $link->error);
            return null;
        }
    }
    
    error_log("[API] Failed to prepare statement: " . $link->error);
    return null;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'rebuild_route_segment':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $result = callBackendAPI('/rebuild_route_segment', 'POST', $input);
        
        if ($result['code'] === 200 && $result['data']) {
            echo json_encode(['success' => true, 'data' => $result['data']]);
        } else {
            echo json_encode([
                'success' => false,
                'error' => 'Backend error',
                'details' => $result['data'] ?? $result['error'] ?? 'Unknown error'
            ]);
        }
        break;

    case 'build_smart_walk':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $result = callBackendAPI('/calculate_smart_walk', 'POST', $input);
        
        if ($result['code'] === 200 && $result['data']) {
            $routeId = null;
            if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
                $userId = $_SESSION["id"];
                $routeId = saveRouteToDatabase($userId, 'smart_walk', $input, $result['data']);
                error_log("[API] Smart walk saved with route_id: " . ($routeId ?? 'null'));
            }
            
            echo json_encode([
                'success' => true, 
                'data' => $result['data'],
                'route_id' => $routeId
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'error' => 'Backend error',
                'details' => $result['data'] ?? $result['error'] ?? 'Unknown error'
            ]);
        }
        break;
    
    case 'build_smart_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $settings = $input['settings'] ?? [];
        if (!is_array($settings)) {
            $settings = [];
        }
        $pace = $settings['pace'] ?? 'balanced';
        $time_strictness = isset($settings['time_strictness']) ? intval($settings['time_strictness']) : 5;
        
        $min_places = $input['min_places_per_category'] ?? [];
        if (!is_array($min_places) || array_values($min_places) === $min_places) {
            $min_places = new stdClass();
        }
        
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
            $routeId = null;
            if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
                $userId = $_SESSION["id"];
                $routeId = saveRouteToDatabase($userId, 'smart', $routeData, $result['data']);
                error_log("[API] Smart route saved with route_id: " . ($routeId ?? 'null'));
            }
            
            echo json_encode([
                'success' => true, 
                'data' => $result['data'],
                'route_id' => $routeId
            ]);
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
        
        $simpleRouteData = [
            'type' => 'simple',
            'start_point' => $input['start_point'],
            'end_point' => $input['end_point'],
            'waypoints' => $input['waypoints'] ?? [],
            'mode' => $input['mode'] ?? 'auto'
        ];
        
        $routeId = null;
        if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
            $userId = $_SESSION["id"];
            $routeId = saveRouteToDatabase($userId, 'simple', $input, $simpleRouteData);
            error_log("[API] Simple route saved with route_id: " . ($routeId ?? 'null'));
        }
        
        echo json_encode([
            'success' => true,
            'data' => $simpleRouteData,
            'route_id' => $routeId
        ]);
        break;
    
    case 'load_route':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        if (!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true) {
            echo json_encode(['success' => false, 'error' => 'Authentication required']);
            exit;
        }
        
        $routeId = intval($_GET['route_id'] ?? 0);
        $userId = $_SESSION["id"];
        
        if ($routeId <= 0) {
            echo json_encode(['success' => false, 'error' => 'Invalid route ID']);
            exit;
        }
        
        $stmt = $link->prepare("SELECT route_data, route_type FROM saved_routes WHERE id = ? AND user_id = ?");
        if ($stmt) {
            $stmt->bind_param("ii", $routeId, $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($row = $result->fetch_assoc()) {
                // Обновляем last_used_at
                $updateStmt = $link->prepare("UPDATE saved_routes SET last_used_at = NOW() WHERE id = ?");
                $updateStmt->bind_param("i", $routeId);
                $updateStmt->execute();
                $updateStmt->close();
                
                echo json_encode([
                    'success' => true,
                    'data' => json_decode($row['route_data'], true),
                    'route_type' => $row['route_type']
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Route not found']);
            }
            
            $stmt->close();
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
}
?>
