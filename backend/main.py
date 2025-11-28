"""
Intelligent Trails Backend - FastAPI Application
Full version with ALL endpoints including legacy support
"""

from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import logging
import os
from dotenv import load_dotenv

from routing_service import get_routing_service
from yandex_api import YandexMapsAPI
import yandex_api as yandex_api_module
import solver

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Intelligent Trails API",
    description="Backend API for intelligent route planning with multiple places",
    version="2.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get API key from environment
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
if not YANDEX_API_KEY:
    logger.error("YANDEX_API_KEY not found in environment variables!")

# Initialize services
routing_service = get_routing_service(YANDEX_API_KEY) if YANDEX_API_KEY else None
yandex_api = YandexMapsAPI(YANDEX_API_KEY) if YANDEX_API_KEY else None

# Set module-level variables for legacy code
if YANDEX_API_KEY:
    yandex_api_module.YANDEX_API_KEY = YANDEX_API_KEY


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

# New API models
class Place(BaseModel):
    id: Optional[int] = None
    name: str
    coordinates: List[float]
    address: Optional[str] = None
    type: str = "must_visit"


class RouteRequest(BaseModel):
    places: List[Place] = Field(..., min_length=2)
    mode: str = "pedestrian"
    optimize: bool = True


# Legacy models
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
    geometry: Optional[List[List[float]]] = None
    duration_seconds: Optional[int] = None
    distance_meters: Optional[int] = None
    route_segment: Optional[List[Point]] = None
    selected_place: Optional[Point] = None
    alternatives: Optional[List[Dict]] = None
    category: Optional[str] = None
    time_at_place: Optional[int] = None


class SmartWalkResponse(BaseModel):
    activities: List[ActivityResult]
    total_duration_minutes: int
    total_distance_meters: Optional[int] = None
    warnings: List[str] = []


class RebuildSegmentRequest(BaseModel):
    activity_index: int
    new_place: Point
    prev_place_coords: List[float]
    next_place_coords: Optional[List[float]] = None
    transport_mode: str = "pedestrian"


class RebuildSegmentResponse(BaseModel):
    geometry: List[List[float]]
    duration_seconds: int
    distance_meters: int


class RouteSettings(BaseModel):
    pace: Literal["relaxed", "balanced", "active"] = "balanced"
    time_strictness: int = 5


class RouteRequest2(BaseModel):
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


# ============================================================================
# NEW API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    return {
        "service": "Intelligent Trails API",
        "version": "2.0.0",
        "status": "running",
        "api_key_configured": bool(YANDEX_API_KEY)
    }


@app.get("/status")
async def status():
    """Status endpoint for health checks"""
    return {
        "status": "ok",
        "api_key_configured": bool(YANDEX_API_KEY)
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "api_key_configured": bool(YANDEX_API_KEY)
    }


@app.post("/api/route/build")
async def build_route(request: RouteRequest):
    try:
        if not YANDEX_API_KEY or not routing_service:
            raise HTTPException(status_code=500, detail="API key not configured")
            
        places_data = [place.model_dump() for place in request.places]
        route_data = await routing_service.build_route(
            places=places_data,
            mode=request.mode,
            optimize=request.optimize
        )
        
        if not route_data.get('success'):
            raise HTTPException(status_code=400, detail=route_data.get('error'))
        
        return route_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/route/modes")
async def get_routing_modes():
    from routing_service import ROUTING_MODES
    return {"success": True, "modes": ROUTING_MODES}


# ============================================================================
# LEGACY API ENDPOINTS (для совместимости со старым фронтом)
# ============================================================================

@app.post("/calculate_smart_walk", response_model=SmartWalkResponse)
async def calculate_smart_walk(request: SmartWalkRequest):
    """
    LEGACY ENDPOINT - обработка умной прогулки
    Совместимость со старым фронтендом
    """
    if not YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    logger.info(f"[LEGACY] Smart walk: {len(request.activities)} activities")

    warnings = []
    activity_results = []
    current_point = request.start_point
    total_duration = 0
    total_distance = 0

    for act_idx, activity in enumerate(request.activities):
        logger.info(f"[ACTIVITY {act_idx + 1}] Type: {activity.type}, Mode: {activity.transport_mode}")
        
        if activity.type == "walk":
            # Walk activity
            waypoints = []
            
            if activity.walking_style == "scenic":
                # Scenic walk - try to find parks
                try:
                    scenic_places = await yandex_api_module.search_places(
                        center_coords=current_point.coords,
                        categories=["парк", "сквер"],
                        radius_m=int(activity.duration_minutes * 75)
                    )
                    
                    if scenic_places:
                        scenic_places.sort(
                            key=lambda p: yandex_api_module.calculate_geo_distance(current_point.coords, p['coords'])
                        )
                        waypoints = [Point(name=scenic_places[0]['name'], coords=scenic_places[0]['coords'])]
                    else:
                        angle = act_idx * 60
                        walk_end_coords = yandex_api_module.point_at_distance(
                            current_point.coords, 
                            activity.duration_minutes * 75, 
                            angle
                        )
                        waypoints = [Point(name="Точка прогулки", coords=walk_end_coords)]
                except Exception as e:
                    logger.error(f"Scenic walk error: {e}")
                    angle = act_idx * 60
                    walk_end_coords = yandex_api_module.point_at_distance(
                        current_point.coords, 
                        activity.duration_minutes * 75, 
                        angle
                    )
                    waypoints = [Point(name="Точка прогулки", coords=walk_end_coords)]
            else:
                # Direct walk
                next_destination = None
                for next_idx in range(act_idx + 1, len(request.activities)):
                    next_act = request.activities[next_idx]
                    if next_act.type == "place" and next_act.specific_place:
                        next_destination = next_act.specific_place
                        break
                
                if not next_destination:
                    if request.return_to_start:
                        next_destination = request.start_point
                    elif request.end_point:
                        next_destination = request.end_point
                    else:
                        angle = act_idx * 60
                        walk_end_coords = yandex_api_module.point_at_distance(
                            current_point.coords, 
                            activity.duration_minutes * 75, 
                            angle
                        )
                        next_destination = Point(name="Конец прогулки", coords=walk_end_coords)
                
                waypoints = [next_destination]
            
            route_waypoints = [current_point.coords] + [w.coords for w in waypoints]
            route_data = await yandex_api_module.build_route(route_waypoints, activity.transport_mode)
            
            if route_data:
                activity_results.append(ActivityResult(
                    activity_index=act_idx,
                    activity_type="walk",
                    duration_minutes=activity.duration_minutes,
                    transport_mode=activity.transport_mode,
                    geometry=route_data['geometry'],
                    duration_seconds=route_data['duration_seconds'],
                    distance_meters=route_data['distance_meters'],
                    route_segment=[current_point] + waypoints
                ))
                total_distance += route_data['distance_meters']
            else:
                warnings.append(f"Прогулка {act_idx + 1}: не удалось построить маршрут")
                activity_results.append(ActivityResult(
                    activity_index=act_idx,
                    activity_type="walk",
                    duration_minutes=activity.duration_minutes,
                    transport_mode=activity.transport_mode,
                    geometry=None,
                    route_segment=[current_point] + waypoints
                ))
            
            current_point = waypoints[-1]
            total_duration += activity.duration_minutes
            
        else:
            # Place activity
            if activity.specific_place:
                selected_place = activity.specific_place
                alternatives = []
            else:
                try:
                    search_radius = 3000
                    places = await yandex_api_module.search_places(
                        center_coords=current_point.coords,
                        categories=[activity.category] if activity.category else [],
                        radius_m=search_radius
                    )
                except Exception as e:
                    logger.error(f"Place search error: {e}")
                    places = []
                
                if not places:
                    warnings.append(f"Активность {act_idx + 1}: места категории '{activity.category}' не найдены")
                    continue
                
                places.sort(key=lambda p: yandex_api_module.calculate_geo_distance(current_point.coords, p['coords']))
                selected_place = Point(name=places[0]['name'], coords=places[0]['coords'])
                
                alternatives = []
                for p in places[1:min(5, len(places))]:
                    dist = yandex_api_module.calculate_geo_distance(current_point.coords, p['coords'])
                    est_time = yandex_api_module.estimate_time_by_mode(dist, activity.transport_mode) // 60
                    alternatives.append({
                        'place': Point(name=p['name'], coords=p['coords']),
                        'category': p.get('category', activity.category or 'место'),
                        'estimated_time_minutes': est_time
                    })
            
            route_waypoints = [current_point.coords, selected_place.coords]
            route_data = await yandex_api_module.build_route(route_waypoints, activity.transport_mode)
            
            if route_data:
                activity_results.append(ActivityResult(
                    activity_index=act_idx,
                    activity_type="place",
                    duration_minutes=activity.duration_minutes,
                    transport_mode=activity.transport_mode,
                    geometry=route_data['geometry'],
                    duration_seconds=route_data['duration_seconds'],
                    distance_meters=route_data['distance_meters'],
                    selected_place=selected_place,
                    alternatives=alternatives,
                    category=activity.category or "конкретное место",
                    time_at_place=activity.time_at_place
                ))
                total_distance += route_data['distance_meters']
            else:
                warnings.append(f"Место {act_idx + 1}: не удалось построить маршрут")
                activity_results.append(ActivityResult(
                    activity_index=act_idx,
                    activity_type="place",
                    duration_minutes=activity.duration_minutes,
                    transport_mode=activity.transport_mode,
                    geometry=None,
                    selected_place=selected_place,
                    alternatives=alternatives,
                    category=activity.category or "конкретное место",
                    time_at_place=activity.time_at_place
                ))
            
            current_point = selected_place
            total_duration += activity.duration_minutes

    return SmartWalkResponse(
        activities=activity_results,
        total_duration_minutes=total_duration,
        total_distance_meters=total_distance if total_distance > 0 else None,
        warnings=warnings
    )


@app.post("/rebuild_route_segment", response_model=RebuildSegmentResponse)
async def rebuild_route_segment(request: RebuildSegmentRequest):
    """
    LEGACY ENDPOINT - Перестраивает маршрут до нового выбранного места
    """
    if not YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")
    
    waypoints = [request.prev_place_coords, request.new_place.coords]
    route_data = await yandex_api_module.build_route(waypoints, request.transport_mode)
    
    if route_data:
        return RebuildSegmentResponse(
            geometry=route_data['geometry'],
            duration_seconds=route_data['duration_seconds'],
            distance_meters=route_data['distance_meters']
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to rebuild route")


@app.post("/calculate_route", response_model=RouteResponse)
async def calculate_route_endpoint(request: RouteRequest2):
    """LEGACY ENDPOINT - Старый эндпоинт для обратной совместимости"""
    if not YANDEX_API_KEY:
        raise HTTPException(status_code=500, detail="Yandex API key is not configured.")

    warnings = []

    try:
        places_of_interest = await yandex_api_module.search_places(
            center_coords=request.start_point.coords,
            categories=request.categories
        )
    except Exception as e:
        logger.error(f"Search places error: {e}")
        places_of_interest = []

    if not places_of_interest:
        warnings.append("Интересные места не найдены. Построен прямой маршрут.")
    
    start_point_dict = {"name": request.start_point.name, "coords": request.start_point.coords, "type": "start"}
    
    base_limit = yandex_api_module.MAX_POINTS_FOR_MATRIX - 1
    if request.settings.pace == "active":
        limit = base_limit
    elif request.settings.pace == "relaxed":
        limit = max(3, int(base_limit * 0.6))
    else:
        limit = int(base_limit * 0.8)

    if request.end_point and not request.return_to_start:
        limit -= 1

    filtered_places = yandex_api_module.smart_filter(start_point_dict, places_of_interest, limit=limit)
    
    all_points_dicts = [start_point_dict]
    all_points_dicts.extend(filtered_places)
    
    end_point_index = None
    if not request.return_to_start and request.end_point:
        end_point_dict = {"name": request.end_point.name, "coords": request.end_point.coords, "type": "end"}
        all_points_dicts.append(end_point_dict)
        end_point_index = len(all_points_dicts) - 1

    try:
        time_matrix, success_rate = await yandex_api_module.get_routing_matrix(all_points_dicts, request.mode)
        time_matrix = [[int(cell) for cell in row] for row in time_matrix]
    except Exception as e:
        logger.error(f"Matrix calculation error: {e}")
        time_matrix = yandex_api_module.generate_fallback_matrix_with_mode(all_points_dicts, request.mode)
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
        logger.error(f"Solver error: {e}")
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

    return RouteResponse(
        ordered_route=final_route_points,
        total_time_minutes=real_time_min,
        warnings=warnings
    )


# Cleanup
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down...")
    if yandex_api:
        await yandex_api.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
