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


class Activity(BaseModel):
    type: Literal["walk", "place"]
    duration_minutes: int
    
    walking_style: Optional[Literal["scenic", "direct"]] = "scenic"
    
    category: Optional[str] = None
    specific_place: Optional[Point] = None
    time_at_place: Optional[int] = 15
    
    transport_mode: Literal["pedestrian", "auto", "bicycle", "masstransit"] = "pedestrian"


class SmartWalkRequest(BaseModel):
    start_point: Point
    activities: List[Activity]
    return_to_start: bool = False
    end_point: Optional[Point] = None


class ActivityResult(BaseModel):
    activity_index: int
    activity_type: str
    duration_minutes: int
    transport_mode: str
    
    route_segment: Optional[List[Point]] = None
    route_geometry: Optional[List[List[float]]] = None
    
    selected_place: Optional[Point] = None
    alternatives: Optional[List[Dict]] = None
    category: Optional[str] = None
    time_at_place: Optional[int] = None


class SmartWalkResponse(BaseModel):
    activities: List[ActivityResult]
    total_duration_minutes: int
    total_distance_meters: Optional[int] = None
    full_route_geometry: Optional[List[List[float]]] = None
    warnings: List[str] = []


class RouteSettings(BaseModel):
    pace: Literal["relaxed", "balanced", "active"] = "balanced"
    time_strictness: int = 5


class RouteRequest(BaseModel):
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
    route_geometry: Optional[List[List[float]]] = None
    warnings: List[str] = []


@app.get("/")
async def root():
    return {"status": "ok", "service": "intelligent-trails"}


@app.get("/status")
async def status():
    return {"status": "ok"}


@app.post("/calculate_smart_walk", response_model=SmartWalkResponse)
async def calculate_smart_walk(request: SmartWalkRequest):
    if not yandex_api.YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    warnings = []
    activity_results = []
    current_point = request.start_point
    total_duration = 0
    total_distance = 0
    all_route_points = [request.start_point.coords]
    all_geometry = []

    for act_idx, activity in enumerate(request.activities):
        print(f"[ACTIVITY {act_idx + 1}] Type: {activity.type}")
        
        if activity.type == "walk":
            walk_duration = activity.duration_minutes
            
            if activity.walking_style == "scenic":
                try:
                    scenic_places = await yandex_api.search_places(
                        center_coords=current_point.coords,
                        categories=["парк", "сквер"],
                        radius_m=int(walk_duration * 75)
                    )
                    
                    if scenic_places:
                        scenic_places.sort(
                            key=lambda p: yandex_api.calculate_geo_distance(current_point.coords, p['coords'])
                        )
                        
                        waypoints = [Point(name=scenic_places[0]['name'], coords=scenic_places[0]['coords'])]
                        if len(scenic_places) > 1 and walk_duration > 30:
                            waypoints.append(Point(name=scenic_places[1]['name'], coords=scenic_places[1]['coords']))
                        
                        walk_end = waypoints[-1]
                    else:
                        angle = act_idx * 1.2
                        walk_end = yandex_api.point_at_distance(
                            current_point.coords, 
                            walk_duration * 60, 
                            angle
                        )
                        waypoints = [Point(name="Точка прогулки", coords=walk_end)]
                        
                except Exception as e:
                    print(f"[WALK] Error finding scenic route: {e}")
                    walk_end = yandex_api.point_at_distance(current_point.coords, walk_duration * 60, 0)
                    waypoints = [Point(name="Точка прогулки", coords=walk_end)]
            else:
                if act_idx < len(request.activities) - 1:
                    next_act = request.activities[act_idx + 1]
                    if next_act.type == "place" and next_act.specific_place:
                        walk_end = next_act.specific_place
                        waypoints = [walk_end]
                    else:
                        walk_end = yandex_api.point_at_distance(current_point.coords, walk_duration * 60, 0)
                        waypoints = [Point(name="Промежуточная точка", coords=walk_end)]
                else:
                    if request.return_to_start:
                        walk_end = request.start_point
                    elif request.end_point:
                        walk_end = request.end_point
                    else:
                        walk_end = yandex_api.point_at_distance(current_point.coords, walk_duration * 60, 0)
                        walk_end = Point(name="Конец прогулки", coords=walk_end)
                    waypoints = [walk_end]
            
            route_points_for_api = [current_point.coords] + [w.coords for w in waypoints]
            route_data = await yandex_api.get_multi_route(route_points_for_api, activity.transport_mode)
            
            route_geometry = None
            if route_data and 'geometry' in route_data:
                route_geometry = route_data['geometry']
                all_geometry.extend(route_geometry)
                if 'distance_meters' in route_data:
                    total_distance += route_data['distance_meters']
            
            activity_results.append(ActivityResult(
                activity_index=act_idx,
                activity_type="walk",
                duration_minutes=walk_duration,
                transport_mode=activity.transport_mode,
                route_segment=[current_point] + waypoints,
                route_geometry=route_geometry
            ))
            
            current_point = waypoints[-1]
            all_route_points.extend([w.coords for w in waypoints])
            total_duration += walk_duration
            
        else:
            time_to_place = activity.duration_minutes - (activity.time_at_place or 0)
            
            if activity.specific_place:
                selected_place = activity.specific_place
                alternatives = []
            else:
                try:
                    places = await yandex_api.search_places(
                        center_coords=current_point.coords,
                        categories=[activity.category] if activity.category else [],
                        radius_m=int(time_to_place * 75)
                    )
                except Exception as e:
                    print(f"[PLACE] Search error: {e}")
                    places = []
                
                if not places:
                    warnings.append(f"Активность {act_idx + 1}: места категории '{activity.category}' не найдены")
                    continue
                
                accessible = []
                for place in places[:20]:
                    dist = yandex_api.calculate_geo_distance(current_point.coords, place['coords'])
                    est_time = yandex_api.estimate_time_by_mode(dist, activity.transport_mode) // 60
                    
                    if est_time <= time_to_place:
                        accessible.append({**place, 'est_time': est_time})
                
                if not accessible:
                    warnings.append(f"Активность {act_idx + 1}: нет мест в пределах {time_to_place} мин")
                    continue
                
                accessible.sort(key=lambda p: p['est_time'])
                
                selected_place = Point(name=accessible[0]['name'], coords=accessible[0]['coords'])
                
                alternatives = [
                    {
                        'place': Point(name=p['name'], coords=p['coords']),
                        'category': p.get('category', activity.category or 'место'),
                        'estimated_time_minutes': p['est_time']
                    }
                    for p in accessible[1:4]
                ]
            
            route_to_place = await yandex_api.get_single_route(
                current_point.coords,
                selected_place.coords,
                activity.transport_mode
            )
            
            route_geometry = None
            if route_to_place and 'geometry' in route_to_place:
                route_geometry = route_to_place['geometry']
                all_geometry.extend(route_geometry)
                if 'distance_meters' in route_to_place:
                    total_distance += route_to_place['distance_meters']
            
            activity_results.append(ActivityResult(
                activity_index=act_idx,
                activity_type="place",
                duration_minutes=activity.duration_minutes,
                transport_mode=activity.transport_mode,
                selected_place=selected_place,
                alternatives=alternatives,
                category=activity.category or "конкретное место",
                time_at_place=activity.time_at_place,
                route_geometry=route_geometry
            ))
            
            current_point = selected_place
            all_route_points.append(selected_place.coords)
            total_duration += activity.duration_minutes

    if request.return_to_start:
        final_route = await yandex_api.get_single_route(
            current_point.coords,
            request.start_point.coords,
            request.activities[-1].transport_mode if request.activities else 'pedestrian'
        )
        if final_route and 'geometry' in final_route:
            all_geometry.extend(final_route['geometry'])
            if 'distance_meters' in final_route:
                total_distance += final_route['distance_meters']
        all_route_points.append(request.start_point.coords)
    elif request.end_point:
        final_route = await yandex_api.get_single_route(
            current_point.coords,
            request.end_point.coords,
            request.activities[-1].transport_mode if request.activities else 'pedestrian'
        )
        if final_route and 'geometry' in final_route:
            all_geometry.extend(final_route['geometry'])
            if 'distance_meters' in final_route:
                total_distance += final_route['distance_meters']
        all_route_points.append(request.end_point.coords)

    full_geometry = all_geometry if len(all_geometry) > 0 else None

    return SmartWalkResponse(
        activities=activity_results,
        total_duration_minutes=total_duration,
        total_distance_meters=total_distance if total_distance > 0 else None,
        full_route_geometry=full_geometry,
        warnings=warnings
    )


@app.post("/calculate_route", response_model=RouteResponse)
async def calculate_route_endpoint(request: RouteRequest):
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

    filtered_places = yandex_api.smart_filter(start_point_dict, places_of_interest, limit=limit)
    
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

    route_coords = [p.coords for p in final_route_points]
    route_geometry = await yandex_api.get_route_geometry(route_coords, request.mode)

    return RouteResponse(
        ordered_route=final_route_points,
        total_time_minutes=real_time_min,
        route_geometry=route_geometry,
        warnings=warnings
    )
