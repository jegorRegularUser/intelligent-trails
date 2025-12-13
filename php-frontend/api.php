<?php
require_once "config.php";

// Включаем логирование ошибок
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/api_errors.log');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');

function logDebug($message, $data = null) {
    $logMessage = "[" . date('Y-m-d H:i:s') . "] " . $message;
    if ($data !== null) {
        $logMessage .= " | Data: " . json_encode($data, JSON_UNESCAPED_UNICODE);
    }
    error_log($logMessage);
    echo json_encode(['log' => $message, 'data' => $data]) . "\n";
}

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
    
    error_log("[API] 💾 Starting saveRouteToDatabase");
    error_log("[API] User ID: $userId");
    error_log("[API] Route Type: $routeType");
    error_log("[API] Route Data: " . json_encode($routeData, JSON_UNESCAPED_UNICODE));
    
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
        
        // Для smart_walk результат уже содержит данные о маршруте
        if (isset($routeData['places']) && is_array($routeData['places'])) {
            $placesCount = count($routeData['places']);
            
            // Вычисляем общее расстояние и время если есть данные
            $totalDistance = 0;
            $totalTime = 0;
            
            // Данные должны быть в сегментах (если они есть)
            foreach ($routeData['places'] as $place) {
                if (isset($place['distance'])) {
                    $totalDistance += floatval($place['distance']);
                }
                if (isset($place['duration'])) {
                    $totalTime += intval($place['duration']);
                }
            }
        }
        
        // Категории из мест
        if (isset($routeData['categories']) && is_array($routeData['categories'])) {
            $categories = json_encode($routeData['categories']);
        }
        
        // Время
        if (isset($routeData['time_limit_minutes'])) {
            $timeLimit = intval($routeData['time_limit_minutes']);
        }
        
        // Режим транспорта
        if (isset($routeData['mode'])) {
            $transportMode = $routeData['mode'];
        }
    }
    
    error_log("[API] Extracted data:");
    error_log("[API]   - Start: $startPoint");
    error_log("[API]   - End: " . ($endPoint ?? 'null'));
    error_log("[API]   - Categories: " . ($categories ?? 'null'));
    error_log("[API]   - Distance: " . ($totalDistance ?? 'null'));
    error_log("[API]   - Time: " . ($totalTime ?? 'null'));
    error_log("[API]   - Places: $placesCount");
    
    $stmt = $link->prepare("INSERT INTO saved_routes (
        user_id, route_name, route_type, start_point, end_point, categories, 
        time_limit, transport_mode, return_to_start, min_places_per_category,
        pace, time_strictness, route_data, total_distance, total_time, places_count,
        created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
    
    if (!$stmt) {
        error_log("[API] ❌ Failed to prepare statement: " . $link->error);
        return null;
    }
    
    error_log("[API] ✓ Statement prepared");
    
    $bindResult = $stmt->bind_param("isssssisississdii", 
        $userId, $routeName, $routeType, $startPoint, $endPoint, $categories,
        $timeLimit, $transportMode, $returnToStart, $minPlacesPerCategory,
        $pace, $timeStrictness, $routeDataJson, $totalDistance, $totalTime, $placesCount
    );
    
    if (!$bindResult) {
        error_log("[API] ❌ Failed to bind params: " . $stmt->error);
        return null;
    }
    
    error_log("[API] ✓ Parameters bound");
    
    $success = $stmt->execute();
    
    if (!$success) {
        error_log("[API] ❌ Execute failed: " . $stmt->error);
        $stmt->close();
        return null;
    }
    
    $routeId = $stmt->insert_id;
    $stmt->close();
    
    error_log("[API] ✅ Route saved successfully! ID: $routeId");
    
    return $routeId;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

error_log("[API] ============================================");
error_log("[API] New request: $action");
error_log("[API] Method: " . $_SERVER['REQUEST_METHOD']);
error_log("[API] Session loggedin: " . (isset($_SESSION["loggedin"]) ? ($_SESSION["loggedin"] ? 'true' : 'false') : 'not set'));
error_log("[API] Session user ID: " . (isset($_SESSION["id"]) ? $_SESSION["id"] : 'not set'));

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
        error_log("[API] 🚶 Processing smart walk request");
        
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        error_log("[API] Input data: " . json_encode($input, JSON_UNESCAPED_UNICODE));
        
        $routeId = null;
        
        // Проверяем авторизацию
        if (isset($_SESSION["loggedin"]) && $_SESSION["loggedin"] === true) {
            $userId = $_SESSION["id"];
            error_log("[API] ✓ User is logged in. User ID: $userId");
            
            // Сохраняем маршрут
            $routeId = saveRouteToDatabase($userId, 'smart_walk', $input, $input);
            
            if ($routeId) {
                error_log("[API] ✅ Smart walk saved with route_id: $routeId");
            } else {
                error_log("[API] ❌ Failed to save smart walk");
            }
        } else {
            error_log("[API] ⚠️ User not logged in, route not saved");
        }
        
        echo json_encode([
            'success' => true, 
            'data' => $input,
            'route_id' => $routeId,
            'saved' => ($routeId !== null)
        ]);
        break;
    
    case 'build_smart_route':
        error_log("[API] 🎯 Processing smart route request");
        
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        error_log("[API] Input data: " . json_encode($input, JSON_UNESCAPED_UNICODE));
        
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
                error_log("[API] ✓ User is logged in. User ID: $userId");
                
                $routeId = saveRouteToDatabase($userId, 'smart', $routeData, $result['data']);
                
                if ($routeId) {
                    error_log("[API] ✅ Smart route saved with route_id: $routeId");
                } else {
                    error_log("[API] ❌ Failed to save smart route");
                }
            } else {
                error_log("[API] ⚠️ User not logged in, route not saved");
            }
            
            echo json_encode([
                'success' => true, 
                'data' => $result['data'],
                'route_id' => $routeId,
                'saved' => ($routeId !== null)
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
        error_log("[API] 🗺️ Processing simple route request");
        
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        error_log("[API] Input data: " . json_encode($input, JSON_UNESCAPED_UNICODE));
        
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
            error_log("[API] ✓ User is logged in. User ID: $userId");
            
            $routeId = saveRouteToDatabase($userId, 'simple', $input, $simpleRouteData);
            
            if ($routeId) {
                error_log("[API] ✅ Simple route saved with route_id: $routeId");
            } else {
                error_log("[API] ❌ Failed to save simple route");
            }
        } else {
            error_log("[API] ⚠️ User not logged in, route not saved");
        }
        
        echo json_encode([
            'success' => true,
            'data' => $simpleRouteData,
            'route_id' => $routeId,
            'saved' => ($routeId !== null)
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

error_log("[API] ============================================");
?>
