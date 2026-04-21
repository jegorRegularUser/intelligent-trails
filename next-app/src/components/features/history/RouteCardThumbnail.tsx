import { SavedRoute } from "@/types/history";
import { PLACE_CATEGORIES } from "@/constants/categories";

interface RouteCardThumbnailProps {
  route: SavedRoute;
  className?: string;
}

export function RouteCardThumbnail({ route, className }: RouteCardThumbnailProps) {
  const pointsCount = route.metrics.placesCount;

  return (
    <div className={className}>
      <svg
        viewBox="0 0 200 80"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Градиентный фон */}
        <defs>
          <linearGradient id={`gradient-${route.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <rect width="200" height="80" fill={`url(#gradient-${route.id})`} rx="12" />

        {/* Линия маршрута */}
        <path
          d={generateRoutePath(pointsCount)}
          stroke="#10b981"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Точки маршрута */}
        {generateRoutePoints(pointsCount).map((point, i) => {
          const isStart = i === 0;
          const isEnd = i === pointsCount - 1;
          const isWaypoint = !isStart && !isEnd;

          // Определяем тип точки
          let pointType: "address" | "category" = "address";
          let categoryId: string | undefined;

          if (isStart) {
            pointType = route.startPoint.type;
            categoryId = route.startPoint.category;
          } else if (isEnd) {
            pointType = route.endPoint.type;
            categoryId = route.endPoint.category;
          } else if (route.waypoints && route.waypoints[i - 1]) {
            pointType = route.waypoints[i - 1].type;
            categoryId = route.waypoints[i - 1].category;
          }

          const category = categoryId ? PLACE_CATEGORIES[categoryId as keyof typeof PLACE_CATEGORIES] : null;
          const CategoryIcon = category?.icon;

          return (
            <g key={i}>
              {/* Основной круг */}
              <circle
                cx={point.x}
                cy={point.y}
                r={isStart || isEnd ? 8 : 8}
                fill={isStart ? "#64748b" : isEnd ? "#1e293b" : "#10b981"}
                stroke="white"
                strokeWidth="2.5"
              />

              {/* Иконка категории для промежуточных точек */}
              {isWaypoint && pointType === "category" && CategoryIcon && (
                <g>
                  {/* Белый круг под иконкой */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={6}
                    fill="white"
                  />
                  {/* SVG иконка - рендерим как foreignObject */}
                  <foreignObject
                    x={point.x - 5}
                    y={point.y - 5}
                    width="10"
                    height="10"
                  >
                    <div className="flex items-center justify-center w-full h-full text-brand-600">
                      <CategoryIcon size={10} strokeWidth={2} />
                    </div>
                  </foreignObject>
                </g>
              )}

              {/* Иконка категории для конечной точки */}
              {isEnd && pointType === "category" && CategoryIcon && (
                <g>
                  {/* Белый круг под иконкой */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={6}
                    fill="white"
                  />
                  {/* SVG иконка - рендерим как foreignObject */}
                  <foreignObject
                    x={point.x - 5}
                    y={point.y - 5}
                    width="10"
                    height="10"
                  >
                    <div className="flex items-center justify-center w-full h-full text-slate-800">
                      <CategoryIcon size={10} strokeWidth={2} />
                    </div>
                  </foreignObject>
                </g>
              )}

              {/* Маленькая белая точка для адресов (промежуточные) */}
              {isWaypoint && pointType === "address" && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill="white"
                />
              )}

              {/* Белая точка для конечной точки-адреса */}
              {isEnd && pointType === "address" && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill="white"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function generateRoutePoints(count: number) {
  const points = [];
  const padding = 20;
  const width = 200 - padding * 2;
  const height = 80 - padding * 2;

  for (let i = 0; i < count; i++) {
    const x = padding + (width / (count - 1)) * i;
    const y = padding + height / 2 + Math.sin(i * 0.8) * (height / 3);
    points.push({ x, y });
  }

  return points;
}

function generateRoutePath(count: number) {
  const points = generateRoutePoints(count);
  if (points.length === 0) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }

  return path;
}
