<?php
require_once "config.php";

if (!isset($_SESSION["loggedin"]) || $_SESSION["loggedin"] !== true) {
    header("location: login.php");
    exit;
}

$user_id = $_SESSION["id"];

// Обработка действий
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'delete') {
        $route_id = intval($_POST['route_id']);
        $stmt = $link->prepare("DELETE FROM saved_routes WHERE id = ? AND user_id = ?");
        $stmt->bind_param("ii", $route_id, $user_id);
        $stmt->execute();
        $stmt->close();
        header("Location: my_routes.php?deleted=1");
        exit;
    }
    
    if ($action === 'toggle_favorite') {
        $route_id = intval($_POST['route_id']);
        $stmt = $link->prepare("UPDATE saved_routes SET is_favorite = NOT is_favorite WHERE id = ? AND user_id = ?");
        $stmt->bind_param("ii", $route_id, $user_id);
        $stmt->execute();
        $stmt->close();
        header("Location: my_routes.php");
        exit;
    }
    
    if ($action === 'rename') {
        $route_id = intval($_POST['route_id']);
        $new_name = trim($_POST['new_name']);
        if (!empty($new_name) && strlen($new_name) <= 255) {
            $stmt = $link->prepare("UPDATE saved_routes SET route_name = ? WHERE id = ? AND user_id = ?");
            $stmt->bind_param("sii", $new_name, $route_id, $user_id);
            $stmt->execute();
            $stmt->close();
        }
        header("Location: my_routes.php?renamed=1");
        exit;
    }
}

// Получение фильтров
$filter_type = $_GET['type'] ?? 'all';
$filter_favorite = isset($_GET['favorite']) ? 1 : 0;
$sort_by = $_GET['sort'] ?? 'created_desc';

// Построение запроса
$where_clauses = ["user_id = ?"];
$params = [$user_id];
$param_types = "i";

if ($filter_type !== 'all') {
    $where_clauses[] = "route_type = ?";
    $params[] = $filter_type;
    $param_types .= "s";
}

if ($filter_favorite) {
    $where_clauses[] = "is_favorite = 1";
}

$where_sql = implode(" AND ", $where_clauses);

// Сортировка
$order_by = match($sort_by) {
    'created_desc' => 'created_at DESC',
    'created_asc' => 'created_at ASC',
    'name_asc' => 'route_name ASC',
    'name_desc' => 'route_name DESC',
    'last_used' => 'last_used_at DESC NULLS LAST',
    default => 'created_at DESC'
};

$sql = "SELECT id, route_name, route_type, start_point, end_point, categories, 
               total_distance, total_time, places_count, is_favorite, transport_mode,
               DATE_FORMAT(created_at, '%d.%m.%Y %H:%i') as created_date,
               DATE_FORMAT(last_used_at, '%d.%m.%Y %H:%i') as last_used_date,
               tags, description
        FROM saved_routes 
        WHERE $where_sql 
        ORDER BY $order_by";

$routes = [];
if ($stmt = $link->prepare($sql)) {
    $stmt->bind_param($param_types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $routes[] = $row;
    }
    $stmt->close();
}

// Получение статистики
$stats_sql = "SELECT 
    COUNT(*) as total_routes,
    COUNT(CASE WHEN route_type = 'simple' THEN 1 END) as simple_count,
    COUNT(CASE WHEN route_type = 'smart' THEN 1 END) as smart_count,
    COUNT(CASE WHEN route_type = 'smart_walk' THEN 1 END) as smart_walk_count,
    COUNT(CASE WHEN is_favorite = 1 THEN 1 END) as favorite_count,
    SUM(total_distance) as total_distance_sum,
    SUM(total_time) as total_time_sum
FROM saved_routes WHERE user_id = ?";

$stats = [];
if ($stmt = $link->prepare($stats_sql)) {
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats = $result->fetch_assoc();
    $stmt->close();
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Мои маршруты - Intelligent Trails</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="stylesheet" href="assets/landing-styles.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" rel="stylesheet">
    <style>
        .routes-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 80px 20px 40px;
            min-height: calc(100vh - 70px);
        }
        
        .page-header {
            margin-bottom: 40px;
            text-align: center;
        }
        
        .page-header h1 {
            font-size: 36px;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .stat-card {
            background: white;
            border-radius: 16px;
            padding: 25px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            border: 2px solid #f0f2f5;
            transition: all 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
            border-color: #667eea;
        }
        
        .stat-card .stat-icon {
            font-size: 32px;
            margin-bottom: 10px;
        }
        
        .stat-card .stat-value {
            font-size: 28px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 5px;
        }
        
        .stat-card .stat-label {
            font-size: 14px;
            color: #6b7280;
        }
        
        .filters-section {
            background: white;
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .filters-row {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .filter-group {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .filter-group label {
            font-weight: 600;
            color: #374151;
            font-size: 14px;
        }
        
        .filter-select, .filter-checkbox {
            padding: 8px 15px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.3s ease;
        }
        
        .filter-select:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .route-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 25px;
        }
        
        .route-card {
            background: white;
            border-radius: 16px;
            padding: 25px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border: 2px solid #f0f2f5;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .route-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
            border-color: #667eea;
        }
        
        .route-card.favorite {
            border-color: #fbbf24;
            background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
        }
        
        .route-type-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        
        .route-type-badge.simple {
            background: #dbeafe;
            color: #1e40af;
        }
        
        .route-type-badge.smart {
            background: #fce7f3;
            color: #be185d;
        }
        
        .route-type-badge.smart_walk {
            background: #d1fae5;
            color: #065f46;
        }
        
        .route-title {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .favorite-star {
            color: #fbbf24;
            cursor: pointer;
            font-size: 20px;
        }
        
        .route-details {
            margin-bottom: 15px;
        }
        
        .route-detail-item {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 8px;
            font-size: 14px;
            color: #4b5563;
        }
        
        .route-detail-icon {
            flex-shrink: 0;
            width: 20px;
            text-align: center;
        }
        
        .route-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
            padding: 15px;
            background: #f9fafb;
            border-radius: 12px;
        }
        
        .route-stat {
            text-align: center;
        }
        
        .route-stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #667eea;
        }
        
        .route-stat-label {
            font-size: 11px;
            color: #6b7280;
            margin-top: 2px;
        }
        
        .route-meta {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
        }
        
        .route-actions {
            display: flex;
            gap: 8px;
            margin-top: 15px;
            flex-wrap: wrap;
        }
        
        .route-btn {
            flex: 1;
            padding: 10px 15px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            text-align: center;
            display: inline-block;
        }
        
        .route-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .route-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .route-btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }
        
        .route-btn-secondary:hover {
            background: #e5e7eb;
        }
        
        .route-btn-danger {
            background: #fee2e2;
            color: #dc2626;
        }
        
        .route-btn-danger:hover {
            background: #fecaca;
        }
        
        .empty-state {
            text-align: center;
            padding: 80px 20px;
        }
        
        .empty-state-icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        
        .empty-state h3 {
            font-size: 24px;
            color: #1f2937;
            margin-bottom: 10px;
        }
        
        .empty-state p {
            color: #6b7280;
            margin-bottom: 30px;
        }
        
        .modal {
            display: none;
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            align-items: center;
            justify-content: center;
        }
        
        .modal.active {
            display: flex;
        }
        
        .modal-content {
            background: white;
            border-radius: 16px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        .modal-header {
            margin-bottom: 20px;
        }
        
        .modal-header h3 {
            font-size: 24px;
            color: #1f2937;
        }
        
        .modal-body {
            margin-bottom: 20px;
        }
        
        .modal-footer {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #374151;
        }
        
        .form-group input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .alert {
            padding: 15px 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 2px solid #a7f3d0;
        }
        
        .alert-info {
            background: #dbeafe;
            color: #1e40af;
            border: 2px solid #bfdbfe;
        }
        
        @media (max-width: 768px) {
            .route-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .filters-row {
                flex-direction: column;
                align-items: stretch;
            }
        }
    </style>
</head>
<body>
    <?php require_once "components/navigation.php"; ?>
    
    <div class="routes-container">
        <div class="page-header">
            <h1>🗺️ Мои маршруты</h1>
            <p style="color: #6b7280;">Управляйте вашими сохраненными маршрутами</p>
        </div>
        
        <?php if (isset($_GET['deleted'])): ?>
            <div class="alert alert-success">
                <span>✅</span>
                <span>Маршрут успешно удален</span>
            </div>
        <?php endif; ?>
        
        <?php if (isset($_GET['renamed'])): ?>
            <div class="alert alert-success">
                <span>✅</span>
                <span>Маршрут успешно переименован</span>
            </div>
        <?php endif; ?>
        
        <!-- Статистика -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">📍</div>
                <div class="stat-value"><?php echo $stats['total_routes'] ?? 0; ?></div>
                <div class="stat-label">Всего маршрутов</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div class="stat-value"><?php echo $stats['favorite_count'] ?? 0; ?></div>
                <div class="stat-label">Избранных</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🚶</div>
                <div class="stat-value"><?php echo number_format(($stats['total_distance_sum'] ?? 0) / 1000, 1); ?> км</div>
                <div class="stat-label">Общая дистанция</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⏱️</div>
                <div class="stat-value"><?php echo number_format(($stats['total_time_sum'] ?? 0) / 60, 0); ?> ч</div>
                <div class="stat-label">Общее время</div>
            </div>
        </div>
        
        <!-- Фильтры -->
        <div class="filters-section">
            <form method="GET" action="my_routes.php">
                <div class="filters-row">
                    <div class="filter-group">
                        <label for="type">Тип маршрута:</label>
                        <select name="type" id="type" class="filter-select" onchange="this.form.submit()">
                            <option value="all" <?php echo $filter_type === 'all' ? 'selected' : ''; ?>>Все</option>
                            <option value="simple" <?php echo $filter_type === 'simple' ? 'selected' : ''; ?>>Простые</option>
                            <option value="smart" <?php echo $filter_type === 'smart' ? 'selected' : ''; ?>>Умные</option>
                            <option value="smart_walk" <?php echo $filter_type === 'smart_walk' ? 'selected' : ''; ?>>Прогулки</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="sort">Сортировка:</label>
                        <select name="sort" id="sort" class="filter-select" onchange="this.form.submit()">
                            <option value="created_desc" <?php echo $sort_by === 'created_desc' ? 'selected' : ''; ?>>Сначала новые</option>
                            <option value="created_asc" <?php echo $sort_by === 'created_asc' ? 'selected' : ''; ?>>Сначала старые</option>
                            <option value="name_asc" <?php echo $sort_by === 'name_asc' ? 'selected' : ''; ?>>По названию (А-Я)</option>
                            <option value="name_desc" <?php echo $sort_by === 'name_desc' ? 'selected' : ''; ?>>По названию (Я-А)</option>
                            <option value="last_used" <?php echo $sort_by === 'last_used' ? 'selected' : ''; ?>>По использованию</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>
                            <input type="checkbox" name="favorite" value="1" <?php echo $filter_favorite ? 'checked' : ''; ?> onchange="this.form.submit()">
                            Только избранные
                        </label>
                    </div>
                </div>
            </form>
        </div>
        
        <!-- Список маршрутов -->
        <?php if (empty($routes)): ?>
            <div class="empty-state">
                <div class="empty-state-icon">🗺️</div>
                <h3>У вас пока нет сохраненных маршрутов</h3>
                <p>Начните создавать маршруты на карте, они будут автоматически сохраняться здесь</p>
                <a href="map.php" class="route-btn route-btn-primary" style="max-width: 300px; margin: 0 auto;">
                    Перейти к карте
                </a>
            </div>
        <?php else: ?>
            <div class="route-grid">
                <?php foreach ($routes as $route): ?>
                    <div class="route-card <?php echo $route['is_favorite'] ? 'favorite' : ''; ?>">
                        <span class="route-type-badge <?php echo $route['route_type']; ?>">
                            <?php 
                            echo match($route['route_type']) {
                                'simple' => '🚗 Простой маршрут',
                                'smart' => '🎯 Умный маршрут',
                                'smart_walk' => '🚶 Умная прогулка',
                                default => 'Маршрут'
                            };
                            ?>
                        </span>
                        
                        <div class="route-title">
                            <span><?php echo htmlspecialchars($route['route_name']); ?></span>
                            <form method="POST" style="margin: 0;" onsubmit="return false;">
                                <input type="hidden" name="action" value="toggle_favorite">
                                <input type="hidden" name="route_id" value="<?php echo $route['id']; ?>">
                                <span class="favorite-star" onclick="this.closest('form').submit()">
                                    <?php echo $route['is_favorite'] ? '⭐' : '☆'; ?>
                                </span>
                            </form>
                        </div>
                        
                        <div class="route-details">
                            <div class="route-detail-item">
                                <span class="route-detail-icon">📍</span>
                                <span><?php echo htmlspecialchars($route['start_point']); ?></span>
                            </div>
                            <?php if (!empty($route['end_point'])): ?>
                                <div class="route-detail-item">
                                    <span class="route-detail-icon">🏁</span>
                                    <span><?php echo htmlspecialchars($route['end_point']); ?></span>
                                </div>
                            <?php endif; ?>
                            <?php if (!empty($route['categories'])): ?>
                                <div class="route-detail-item">
                                    <span class="route-detail-icon">🏷️</span>
                                    <span>
                                        <?php 
                                        $cats = json_decode($route['categories'], true);
                                        if (is_array($cats)) {
                                            $categoryMap = [
                                                'cafe' => '☕ Кафе',
                                                'park' => '🌳 Парки',
                                                'museum' => '🏛️ Музеи',
                                                'monument' => '🗿 Памятники',
                                                'restaurant' => '🍽️ Рестораны',
                                                'bar' => '🍺 Бары',
                                                'shop' => '🛍️ Магазины'
                                            ];
                                            $catNames = array_map(fn($c) => $categoryMap[$c] ?? $c, $cats);
                                            echo implode(', ', $catNames);
                                        }
                                        ?>
                                    </span>
                                </div>
                            <?php endif; ?>
                        </div>
                        
                        <div class="route-stats">
                            <div class="route-stat">
                                <div class="route-stat-value">
                                    <?php echo $route['total_distance'] ? number_format($route['total_distance'] / 1000, 1) : '—'; ?>
                                </div>
                                <div class="route-stat-label">км</div>
                            </div>
                            <div class="route-stat">
                                <div class="route-stat-value">
                                    <?php echo $route['total_time'] ? number_format($route['total_time'] / 60, 0) : '—'; ?>
                                </div>
                                <div class="route-stat-label">мин</div>
                            </div>
                            <div class="route-stat">
                                <div class="route-stat-value">
                                    <?php echo $route['places_count'] ?? 0; ?>
                                </div>
                                <div class="route-stat-label">мест</div>
                            </div>
                        </div>
                        
                        <div class="route-meta">
                            <div>Создан: <?php echo $route['created_date']; ?></div>
                            <?php if ($route['last_used_date']): ?>
                                <div>Использован: <?php echo $route['last_used_date']; ?></div>
                            <?php endif; ?>
                        </div>
                        
                        <div class="route-actions">
                            <a href="map.php?load_route=<?php echo $route['id']; ?>" class="route-btn route-btn-primary">
                                🗺️ Открыть на карте
                            </a>
                            <button class="route-btn route-btn-secondary" onclick="openRenameModal(<?php echo $route['id']; ?>, '<?php echo htmlspecialchars(addslashes($route['route_name'])); ?>')">
                                ✏️ Переименовать
                            </button>
                            <form method="POST" style="margin: 0; flex: 1;" onsubmit="return confirm('Вы уверены, что хотите удалить этот маршрут?');">
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="route_id" value="<?php echo $route['id']; ?>">
                                <button type="submit" class="route-btn route-btn-danger" style="width: 100%;">
                                    🗑️ Удалить
                                </button>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
    
    <!-- Модальное окно переименования -->
    <div class="modal" id="renameModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>✏️ Переименовать маршрут</h3>
            </div>
            <form method="POST">
                <div class="modal-body">
                    <input type="hidden" name="action" value="rename">
                    <input type="hidden" name="route_id" id="rename_route_id">
                    <div class="form-group">
                        <label for="new_name">Новое название:</label>
                        <input type="text" name="new_name" id="new_name" maxlength="255" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="route-btn route-btn-secondary" onclick="closeRenameModal()">
                        Отмена
                    </button>
                    <button type="submit" class="route-btn route-btn-primary">
                        Сохранить
                    </button>
                </div>
            </form>
        </div>
    </div>
    
    <script>
        function openRenameModal(routeId, currentName) {
            document.getElementById('rename_route_id').value = routeId;
            document.getElementById('new_name').value = currentName;
            document.getElementById('renameModal').classList.add('active');
            document.getElementById('new_name').focus();
        }
        
        function closeRenameModal() {
            document.getElementById('renameModal').classList.remove('active');
        }
        
        // Закрытие модального окна при клике вне его
        document.getElementById('renameModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeRenameModal();
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeRenameModal();
            }
        });
    </script>
</body>
</html>
