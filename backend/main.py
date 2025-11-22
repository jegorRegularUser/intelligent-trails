from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal
from dotenv import load_dotenv

load_dotenv()

import yandex_api
import solver

app = FastAPI()


class Point(BaseModel):
    name: str
    coords: List[float]


class StageSettings(BaseModel):
    """Настройки для одного этапа прогулки"""
    duration_minutes: int  # Время на этап
    transport_mode: Literal["pedestrian", "auto", "masstransit", "bicycle"] = "pedestrian"
    category: Optional[str] = None  # Категория места (если не конкретное место)
    specific_place: Optional[Point] = None  # Конкретное место (если выбрано)
    alternatives_count: int = 3  # Сколько альтернатив генерировать


class SmartWalkRequest(BaseModel):
    """Новый формат запроса для поэтапной прогулки"""
    start_point: Point
    stages: List[StageSettings]
    return_to_start: bool = False
    end_point: Optional[Point] = None


class StageAlternative(BaseModel):
    """Альтернативный вариант места для этапа"""
    place: Point
    category: str
    estimated_time_minutes: int


class StageResult(BaseModel):
    """Результат одного этапа"""
    stage_index: int
    duration_minutes: int
    transport_mode: str
    selected_place: Point
    alternatives: List[StageAlternative]  # Другие варианты для слайдера
    category: str


class SmartWalkResponse(BaseModel):
    """Ответ с полным маршрутом"""
    stages: List[StageResult]
    total_time_minutes: int
    total_distance_meters: Optional[int] = None
    route_geometry: Optional[List[List[float]]] = None  # Для отрисовки реального маршрута
    warnings: List[str] = []


class RouteSettings(BaseModel):
    pace: Literal["relaxed", "balanced", "active"] = "balanced"
    time_strictness: int = 5


class RouteRequest(BaseModel):
    """Старый формат для обратной совместимости"""
    start_point: Point
    end_point: Optional[Point] = None
    categories: List[str]
    time_limit_minutes: int
    return_to_start: bool
    mode: str = "pedestrian"
    min_places_per_category: Dict[str, int] = Field(default_factory=dict)
    settings: RouteSettings = Field(default_factory=RouteSettings)


class RouteResponse(BaseModel):
    ordered_route: List[Point]
    total_time_minutes: int
    warnings: List[str] = []


@app.post("/calculate_smart_walk", response_model=SmartWalkResponse)
async def calculate_smart_walk(request: SmartWalkRequest):
    """
    Новый эндпоинт для поэтапных прогулок с альтернативами
    """
    if not yandex_api.YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    warnings = []
    stage_results = []
    current_point = request.start_point
    total_time = 0
    all_route_points = [request.start_point.coords]

    for stage_idx, stage in enumerate(request.stages):
        print(f"[STAGE {stage_idx + 1}] Processing...")
        
        # Если указано конкретное место - используем его
        if stage.specific_place:
            selected_place = stage.specific_place
            alternatives = []
        else:
            # Ищем места по категории
            try:
                places = await yandex_api.search_places(
                    center_coords=current_point.coords,
                    categories=[stage.category] if stage.category else [],
                    radius_m=3000
                )
            except Exception as e:
                print(f"[STAGE {stage_idx + 1}] Search error: {e}")
                places = []
            
            if not places:
                warnings.append(f"Этап {stage_idx + 1}: места категории '{stage.category}' не найдены")
                continue
            
            # Фильтруем по доступности в пределах времени этапа
            accessible_places = []
            for place in places[:20]:  # Проверяем топ-20 ближайших
                dist = yandex_api.calculate_geo_distance(current_point.coords, place['coords'])
                est_time = yandex_api.estimate_time_by_mode(dist, stage.transport_mode) // 60
                
                if est_time <= stage.duration_minutes:
                    accessible_places.append({
                        **place,
                        'estimated_time': est_time
                    })
            
            if not accessible_places:
                warnings.append(f"Этап {stage_idx + 1}: нет доступных мест в пределах {stage.duration_minutes} мин")
                continue
            
            # Сортируем по расстоянию
            accessible_places.sort(key=lambda p: p['estimated_time'])
            
            # Выбираем лучший вариант
            selected_place = Point(
                name=accessible_places[0]['name'],
                coords=accessible_places[0]['coords']
            )
            
            # Генерируем альтернативы для слайдера
            alternatives = []
            for alt_place in accessible_places[1:stage.alternatives_count + 1]:
                alternatives.append(StageAlternative(
                    place=Point(name=alt_place['name'], coords=alt_place['coords']),
                    category=alt_place.get('category', stage.category or 'место'),
                    estimated_time_minutes=alt_place['estimated_time']
                ))
        
        # Добавляем результат этапа
        stage_results.append(StageResult(
            stage_index=stage_idx,
            duration_minutes=stage.duration_minutes,
            transport_mode=stage.transport_mode,
            selected_place=selected_place,
            alternatives=alternatives,
            category=stage.category or "конкретное место"
        ))
        
        all_route_points.append(selected_place.coords)
        total_time += stage.duration_minutes
        current_point = selected_place
    
    # Если возврат к началу
    if request.return_to_start:
        all_route_points.append(request.start_point.coords)
    elif request.end_point:
        all_route_points.append(request.end_point.coords)
    
    # Получаем геометрию реального маршрута
    route_geometry = None
    if len(all_route_points) >= 2:
        # Используем режим первого этапа (можно улучшить)
        main_mode = request.stages[0].transport_mode if request.stages else 'pedestrian'
        route_geometry = await yandex_api.get_route_geometry(all_route_points, main_mode)
    
    return SmartWalkResponse(
        stages=stage_results,
        total_time_minutes=total_time,
        route_geometry=route_geometry,
        warnings=warnings
    )


@app.post("/calculate_route", response_model=RouteResponse)
async def calculate_route_endpoint(request: RouteRequest):
    """Старый эндпоинт для обратной совместимости"""
    if not yandex_api.YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    warnings = []

    try:
        places_of_interest = await yandex_api.search_places(
            center_coords=request.start_point.coords,
            categories=request.categories
        )
    except Exception as e:
        print(f"Search places error: {e}")
        places_of_interest = []

    if not places_of_interest:
        warnings.append("Интересные места не найдены. Построен прямой маршрут.")
    
    start_point_dict = {"name": request.start_point.name, "coords": request.start_point.coords, "type": "start"}
    
    base_limit = yandex_api.MAX_POINTS_FOR_MATRIX - 1
    if request.settings.pace == "active":
        limit = base_limit
    elif request.settings.pace == "relaxed":
        limit = max(3, int(base_limit * 0.6))
    else:
        limit = int(base_limit * 0.8)

    if request.end_point and not request.return_to_start:
        limit -= 1

    filtered_places = yandex_api.smart_filter(
        start_point_dict, 
        places_of_interest, 
        limit=limit
    )
    
    all_points_dicts = [start_point_dict]
    all_points_dicts.extend(filtered_places)
    
    end_point_index = None
    if not request.return_to_start and request.end_point:
        end_point_dict = {"name": request.end_point.name, "coords": request.end_point.coords, "type": "end"}
        all_points_dicts.append(end_point_dict)
        end_point_index = len(all_points_dicts) - 1

    try:
        time_matrix, success_rate = await yandex_api.get_routing_matrix(all_points_dicts, request.mode)
        time_matrix = [[int(cell) for cell in row] for row in time_matrix]
    except Exception as e:
        print(f"Matrix calculation error: {e}")
        time_matrix = yandex_api.generate_fallback_matrix_with_mode(all_points_dicts, request.mode)
        warnings.append("Ошибка сервиса карт. Маршрут построен геометрически.")

    try:
        ordered_indices = solver.solve_vrp_dynamic(
            matrix=time_matrix,
            time_limit_minutes=request.time_limit_minutes,
            return_to_start=request.return_to_start,
            end_point_index=end_point_index,
            pace=request.settings.pace,
            strictness=request.settings.time_strictness
        )
    except Exception as e:
        print(f"Solver error: {e}")
        ordered_indices = [0]
        if end_point_index: 
            ordered_indices.append(end_point_index)

    final_route_points = []
    total_time_sec = 0
    
    for i in range(len(ordered_indices)):
        idx = ordered_indices[i]
        final_route_points.append(Point(
            name=all_points_dicts[idx]['name'], 
            coords=all_points_dicts[idx]['coords']
        ))
        if i > 0:
            prev = ordered_indices[i-1]
            total_time_sec += time_matrix[prev][idx]

    real_time_min = int(total_time_sec / 60)
    
    if len(final_route_points) <= 2 and len(all_points_dicts) > 5 and real_time_min < 5:
        warnings.append("Не удалось построить оптимальный маршрут. Попробуйте увеличить время или сменить локацию.")

    if real_time_min > request.time_limit_minutes:
        warnings.append(f"Внимание! Маршрут займет {real_time_min} мин (лимит {request.time_limit_minutes} мин).")

    return RouteResponse(
        ordered_route=final_route_points,
        total_time_minutes=real_time_min,
        warnings=warnings
    )
