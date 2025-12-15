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
    'last_used' => 'last_used_at DESC',
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
    <link rel="stylesheet" href="assets/styles/my-routes.css">

</head>
<body>
    <?php require_once "components/navigation.php"; ?>
    
    <div class="routes-container">
        <div class="page-header">
            <h1> Мои маршруты</h1>
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
                <div class="stat-value"><?php  echo number_format(($stats['total_time_sum'] ?? 0) / 60, 0); ?> ч</div>
                <div class="stat-label">Общее время</div>
            </div>
        </div>
        
        <!-- Фильтры -->
        <div class="filters-section">
            <form method="GET" action="my_routes.php" id="filterForm">
                <div class="filters-row">
                    <div class="filter-group">
                        <label for="type">Тип маршрута</label>
                        <select name="type" id="type" class="filter-select" onchange="document.getElementById('filterForm').submit()">
                            <option value="all" <?php echo $filter_type === 'all' ? 'selected' : ''; ?>>Все типы</option>
                            <option value="simple" <?php echo $filter_type === 'simple' ? 'selected' : ''; ?>>Простые</option>
                            <option value="smart_walk" <?php echo $filter_type === 'smart_walk' ? 'selected' : ''; ?>>Прогулки</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="sort">Сортировка</label>
                        <select name="sort" id="sort" class="filter-select" onchange="document.getElementById('filterForm').submit()">
                            <option value="created_desc" <?php echo $sort_by === 'created_desc' ? 'selected' : ''; ?>>Сначала новые</option>
                            <option value="created_asc" <?php echo $sort_by === 'created_asc' ? 'selected' : ''; ?>>Сначала старые</option>
                            <option value="name_asc" <?php echo $sort_by === 'name_asc' ? 'selected' : ''; ?>>По названию (А-Я)</option>
                            <option value="name_desc" <?php echo $sort_by === 'name_desc' ? 'selected' : ''; ?>>По названию (Я-А)</option>
                            <option value="last_used" <?php echo $sort_by === 'last_used' ? 'selected' : ''; ?>>По использованию</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>&nbsp;</label>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" name="favorite" id="favorite" value="1" <?php echo $filter_favorite ? 'checked' : ''; ?> onchange="document.getElementById('filterForm').submit()">
                            <label for="favorite">Только избранные</label>
                        </div>
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
