# Интегрированная система маршрутизации

## Обзор

Система интеллектуальной маршрутизации для приложения Intelligent Trails, включающая мультимодальное планирование маршрутов, визуализацию в реальном времени и адаптивные алгоритмы оптимизации.

## Архитектура

### Основные компоненты

1. **useMultiModalRouting** - Основной хук для мультимодальной маршрутизации
2. **useMapIntegration** - Интеграция с Яндекс.Картами и визуализация
3. **EnhancedRouteVisualizer** - Продвинутая визуализация маршрутов
4. **MultiCriteriaOptimizer** - Многокритериальная оптимизация
5. **RealTimeRoutingManager** - Управление данными в реальном времени

### Алгоритмы маршрутизации

- **Dijkstra** - Классический алгоритм кратчайшего пути
- **A*** - Эвристический поиск с различными функциями оценки
- **Bidirectional Search** - Двунаправленный поиск
- **Multi-Criteria Optimization** - Парето-оптимальные решения

## Использование

### Базовое использование

```tsx
import { useMapIntegration } from '@/hooks/useMapIntegration';

const MapComponent = () => {
  const {
    mapContainerRef,
    isInitialized,
    currentRoute,
    alternativeRoutes,
    calculateRoute,
    clearRoute
  } = useMapIntegration(YANDEX_API_KEY);

  const handleRouteCalculation = async () => {
    const result = await calculateRoute({
      origin: { latitude: 55.7558, longitude: 37.6173 },
      destination: { latitude: 55.7339, longitude: 37.5886 },
      preferences: userPreferences,
      constraints: routeConstraints
    });
  };

  return (
    <div ref={mapContainerRef} style={{ width: '100%', height: '400px' }} />
  );
};
```

### Настройка предпочтений пользователя

```tsx
const userPreferences: UserPreferences = {
  speed: 4,           // Приоритет скорости (1-5)
  safety: 5,          // Приоритет безопасности (1-5)
  accessibility: 3,   // Приоритет доступности (1-5)
  cost: 2,           // Приоритет стоимости (1-5)
  comfort: 4,        // Приоритет комфорта (1-5)
  environmental: 3,  // Экологичность (1-5)
  scenic: true,      // Живописный маршрут
  minimizeTransfers: true,
  requireWheelchairAccessibility: false,
  preferredModes: [TransportMode.WALKING, TransportMode.METRO],
  avoidedModes: [TransportMode.CAR]
};
```

### Ограничения маршрута

```tsx
const routeConstraints: RouteConstraints = {
  maxDistance: 50000,     // Максимальное расстояние в метрах
  maxDuration: 7200,      // Максимальное время в секундах
  maxTransfers: 3,        // Максимальное количество пересадок
  maxWalkingDistance: 2000, // Максимальное расстояние пешком
  maxCost: 500,          // Максимальная стоимость
  avoidTolls: false,
  avoidHighways: false,
  requireBikeLane: false
};
```

## Функциональность

### Мультимодальная маршрутизация

- Поддержка различных видов транспорта
- Оптимизация по множественным критериям
- Учет пересадок и ожидания
- Расчет стоимости и времени

### Визуализация

- Интерактивная карта с маршрутами
- Цветовое кодирование по типу транспорта
- Отображение условий в реальном времени
- Анимация движения по маршруту
- Информационные всплывающие окна

### Адаптация в реальном времени

- Мониторинг дорожной обстановки
- Автоматическое перестроение маршрутов
- Уведомления об изменениях
- Обновление времени прибытия

### Доступность

- Поддержка инвалидных колясок
- Информация о лифтах и пандусах
- Тактильная разметка
- Аудиосигналы

## API

### useMapIntegration

```tsx
const {
  // Состояние
  mapState,
  isLoading,
  error,
  currentRoute,
  alternativeRoutes,
  
  // Функции маршрутизации
  calculateRoute,
  selectAlternativeRoute,
  clearRoute,
  
  // Визуализация
  startRouteAnimation,
  pauseRouteAnimation,
  stopRouteAnimation,
  
  // Карта
  centerOnUserLocation,
  setMapView
} = useMapIntegration(apiKey);
```

### Типы данных

#### MultiModalRoute
```tsx
interface MultiModalRoute {
  id: string;
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
  totalCost: number;
  totalTransfers: number;
  accessibilityScore: number;
  environmentalScore: number;
  safetyScore: number;
  comfortScore: number;
  waypoints: Waypoint[];
  geometry: Coordinate[];
}
```

#### RouteSegment
```tsx
interface RouteSegment {
  id: string;
  mode: TransportMode;
  from: string;
  to: string;
  distance: number;
  duration: number;
  cost: number;
  instructions: RouteInstruction[];
  accessibility: AccessibilityInfo;
  geometry: Coordinate[];
}
```

## Конфигурация

### Настройка визуализации

```tsx
const visualizationOptions = {
  showAlternatives: true,
  showRealTimeConditions: true,
  showAccessibilityInfo: true,
  animateRoute: false,
  clusterPOIs: true,
  theme: 'default'
};
```

### Обработчики событий

```tsx
setInteractionHandlers({
  onRouteClick: (route) => console.log('Route clicked', route),
  onSegmentClick: (segment) => console.log('Segment clicked', segment),
  onPOIClick: (poi) => console.log('POI clicked', poi),
  onMapClick: (coordinate) => console.log('Map clicked', coordinate)
});
```

## Производительность

### Оптимизации

- Кэширование результатов маршрутизации
- Упрощение геометрии для больших маршрутов
- Кластеризация точек интереса
- Ленивая загрузка данных в реальном времени

### Ограничения

- Максимум 1000 маркеров на карте
- Максимум 500 сегментов маршрута
- Автоматическое упрощение при превышении лимитов

## Расширение

### Добавление новых алгоритмов

1. Создайте класс, реализующий интерфейс алгоритма
2. Зарегистрируйте в MultiCriteriaOptimizer
3. Добавьте в опции RoutingOptions

### Новые виды транспорта

1. Добавьте в enum TransportMode
2. Создайте обработчик в transport-modes/
3. Обновите визуализацию в themes

### Интеграция с внешними API

1. Создайте коннектор в realtime/
2. Реализуйте интерфейс RealTimeDataConnector
3. Зарегистрируйте в RealTimeRoutingManager

## Тестирование

```bash
# Запуск тестов
npm test

# Тесты маршрутизации
npm test -- --testPathPattern=routing

# Тесты визуализации
npm test -- --testPathPattern=visualization
```

## Примеры

См. папку `examples/` для полных примеров использования различных функций системы маршрутизации.