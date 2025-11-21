from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Literal
from dotenv import load_dotenv

load_dotenv()

import yandex_api
import solver

app = FastAPI()

class Point(BaseModel):
    name: str
    coords: List[float]

class RouteSettings(BaseModel):
    # "relaxed" (меньше точек), "balanced" (норма), "active" (максимум точек)
    pace: Literal["relaxed", "balanced", "active"] = "balanced" 
    # Насколько строго соблюдать время: 0 - можно опаздывать, 10 - очень строго
    time_strictness: int = 5 

class RouteRequest(BaseModel):
    start_point: Point
    end_point: Optional[Point] = None
    categories: List[str]
    time_limit_minutes: int
    return_to_start: bool
    mode: str = "pedestrian"
    min_places_per_category: Optional[Dict[str, int]] = {}
    settings: Optional[RouteSettings] = RouteSettings() # Новое поле настроек

class RouteResponse(BaseModel):
    ordered_route: List[Point]
    total_time_minutes: int
    warnings: List[str] = []

@app.post("/calculate_route", response_model=RouteResponse)
async def calculate_route_endpoint(request: RouteRequest):
    if not yandex_api.YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    warnings = []

    # 1. Поиск (с увеличенным радиусом и кол-вом результатов для выборки)
    try:
        places_of_interest = await yandex_api.search_places(
            center_coords=request.start_point.coords,
            categories=request.categories
        )
    except Exception:
        places_of_interest = []

    if not places_of_interest:
        warnings.append("Интересные места не найдены. Построен прямой маршрут.")
    
    # 2. Подготовка точек
    start_point_dict = {"name": request.start_point.name, "coords": request.start_point.coords, "type": "start"}
    
    # Адаптивный лимит точек в зависимости от "Темпа"
    # Если "active" - берем больше точек для расчета, если "relaxed" - меньше
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

    # 3. Матрица
    try:
        time_matrix, success_rate = await yandex_api.get_routing_matrix(all_points_dicts, request.mode)
        # ПРИНУДИТЕЛЬНО приводим все к int, чтобы ortools не падал
        time_matrix = [[int(cell) for cell in row] for row in time_matrix]
    except Exception:
        time_matrix = yandex_api.generate_fallback_matrix(all_points_dicts)
        warnings.append("Ошибка сервиса карт. Маршрут построен геометрически.")

    # 4. Решение с учетом профиля
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
        print(f"Solver fatal: {e}")
        ordered_indices = [0]
        if end_point_index: ordered_indices.append(end_point_index)

    # 5. Сборка ответа
    final_route_points = []
    total_time_sec = 0
    
    for i in range(len(ordered_indices)):
        idx = ordered_indices[i]
        final_route_points.append(Point(name=all_points_dicts[idx]['name'], coords=all_points_dicts[idx]['coords']))
        if i > 0:
            prev = ordered_indices[i-1]
            total_time_sec += time_matrix[prev][idx]

    real_time_min = int(total_time_sec / 60)
    
    # Если насчитали 0 минут (старт-старт), но точек было много - это ошибка алгоритма, форсируем хотя бы 1 точку
    if len(final_route_points) <= 2 and len(all_points_dicts) > 5 and real_time_min < 5:
         warnings.append("Не удалось построить оптимальный маршрут. Попробуйте увеличить время или сменить локацию.")

    if real_time_min > request.time_limit_minutes:
        warnings.append(f"Внимание! Маршрут займет {real_time_min} мин (лимит {request.time_limit_minutes} мин).")

    return RouteResponse(
        ordered_route=final_route_points,
        total_time_minutes=real_time_min,
        warnings=warnings
    )
