"""
Intelligent Trails Backend - FastAPI Application
Improved version with proper route handling and state management
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
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get API key from environment
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
if not YANDEX_API_KEY:
    logger.error("YANDEX_API_KEY not found in environment variables!")
    raise ValueError("YANDEX_API_KEY must be set")

# Initialize services
routing_service = get_routing_service(YANDEX_API_KEY)
yandex_api = YandexMapsAPI(YANDEX_API_KEY)


# Pydantic models for new API
class Place(BaseModel):
    """Model for a place/location"""
    id: Optional[int] = None
    name: str = Field(..., description="Name of the place")
    coordinates: List[float] = Field(..., description="[longitude, latitude]")
    address: Optional[str] = Field(None, description="Human-readable address")
    type: str = Field("must_visit", description="must_visit or optional")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Красная площадь",
                "coordinates": [37.6173, 55.7539],
                "address": "Москва, Красная площадь",
                "type": "must_visit"
            }
        }


class RouteRequest(BaseModel):
    """Model for route building request"""
    places: List[Place] = Field(..., min_length=2, description="List of places to visit")
    mode: str = Field("pedestrian", description="pedestrian, driving, or masstransit")
    optimize: bool = Field(True, description="Whether to optimize the order of places")
    
    class Config:
        json_schema_extra = {
            "example": {
                "places": [
                    {
                        "name": "Красная площадь",
                        "coordinates": [37.6173, 55.7539],
                        "type": "must_visit"
                    },
                    {
                        "name": "ГУМ",
                        "coordinates": [37.6211, 55.7558],
                        "type": "must_visit"
                    }
                ],
                "mode": "pedestrian",
                "optimize": True
            }
        }


class UpdatePlaceRequest(BaseModel):
    """Model for updating a place in existing route"""
    place_index: int = Field(..., description="Index of place to update (0-based)")
    new_place: Place = Field(..., description="New place data")


class GeocodeRequest(BaseModel):
    """Model for geocoding request"""
    address: str = Field(..., description="Address to geocode")


class ReverseGeocodeRequest(BaseModel):
    """Model for reverse geocoding request"""
    coordinates: List[float] = Field(..., description="[longitude, latitude]")


# Legacy models for backward compatibility
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


class RebuildSegmentRequest(BaseModel):
    activity_index: int
    new_place: Point
    prev_place_coords: List[float]
    next_place_coords: Optional[List[float]] = None
    transport_mode: str = "pedestrian"


# API Endpoints - New improved API

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Intelligent Trails API",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "new_api": {
                "build_route": "/api/route/build",
                "update_place": "/api/route/update-place",
                "place_info": "/api/place/info",
                "geocode": "/api/geocode",
                "reverse_geocode": "/api/reverse-geocode",
                "modes": "/api/route/modes"
            },
            "legacy": {
                "smart_walk": "/calculate_smart_walk",
                "rebuild_segment": "/rebuild_route_segment"
            }
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "api_key_configured": bool(YANDEX_API_KEY)
    }


@app.post("/api/route/build")
async def build_route(request: RouteRequest):
    """
    Build an optimized route through multiple places
    
    Args:
        request: RouteRequest with places, mode, and optimization flag
        
    Returns:
        Route data with segments, distances, and durations
    """
    try:
        logger.info(f"Building route for {len(request.places)} places in {request.mode} mode")
        
        # Convert Pydantic models to dicts
        places_data = [place.model_dump() for place in request.places]
        
        # Build route
        route_data = await routing_service.build_route(
            places=places_data,
            mode=request.mode,
            optimize=request.optimize
        )
        
        if not route_data.get('success'):
            raise HTTPException(
                status_code=400,
                detail=route_data.get('error', 'Failed to build route')
            )
        
        logger.info(f"Route built successfully: {route_data['summary']['total_distance_km']}km")
        return route_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building route: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/route/update-place")
async def update_route_place(route_data: Dict[str, Any] = Body(...), 
                            place_index: int = Body(...),
                            new_place: Place = Body(...)):
    """
    Update a specific place in an existing route
    
    Args:
        route_data: Current route data
        place_index: Index of place to update (0-based)
        new_place: New place data
        
    Returns:
        Updated route data
    """
    try:
        logger.info(f"Updating place at index {place_index}")
        
        new_place_data = new_place.model_dump()
        
        updated_route = await routing_service.update_route_place(
            route_data=route_data,
            place_index=place_index,
            new_place=new_place_data
        )
        
        if not updated_route.get('success'):
            raise HTTPException(
                status_code=400,
                detail=updated_route.get('error', 'Failed to update place')
            )
        
        return updated_route
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating place: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/place/info")
async def get_place_info(lon: float = Query(...), lat: float = Query(...)):
    """
    Get detailed information about a place by coordinates
    
    Args:
        lon: Longitude
        lat: Latitude
        
    Returns:
        Place information including address
    """
    try:
        coordinates = [lon, lat]
        
        place_info = await routing_service.get_place_info(coordinates)
        
        if not place_info.get('success'):
            raise HTTPException(
                status_code=400,
                detail=place_info.get('error', 'Failed to get place info')
            )
        
        return place_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting place info: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/geocode")
async def geocode_address(request: GeocodeRequest):
    """
    Convert address to coordinates (forward geocoding)
    
    Args:
        request: GeocodeRequest with address string
        
    Returns:
        Coordinates [longitude, latitude]
    """
    try:
        logger.info(f"Geocoding address: {request.address}")
        
        coordinates = await yandex_api.geocode(request.address)
        
        if not coordinates:
            raise HTTPException(
                status_code=404,
                detail="Address not found"
            )
        
        return {
            "success": True,
            "address": request.address,
            "coordinates": coordinates
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error geocoding address: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reverse-geocode")
async def reverse_geocode_coordinates(request: ReverseGeocodeRequest):
    """
    Convert coordinates to address (reverse geocoding)
    
    Args:
        request: ReverseGeocodeRequest with coordinates
        
    Returns:
        Address and details
    """
    try:
        logger.info(f"Reverse geocoding: {request.coordinates}")
        
        address_data = await yandex_api.reverse_geocode(request.coordinates)
        
        return {
            "success": True,
            "coordinates": request.coordinates,
            "address": address_data.get('address'),
            "details": address_data.get('details', {})
        }
        
    except Exception as e:
        logger.error(f"Error reverse geocoding: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/route/modes")
async def get_routing_modes():
    """
    Get available routing modes and their configurations
    
    Returns:
        Dictionary of routing modes
    """
    from routing_service import ROUTING_MODES
    
    return {
        "success": True,
        "modes": ROUTING_MODES
    }


@app.post("/api/route/alternatives")
async def get_route_alternatives(
    origin: List[float] = Body(...),
    destination: List[float] = Body(...),
    mode: str = Body("pedestrian"),
    alternatives: int = Body(3)
):
    """
    Get multiple alternative routes between two points
    
    Args:
        origin: Starting coordinates [lon, lat]
        destination: Ending coordinates [lon, lat]
        mode: Routing mode
        alternatives: Number of alternatives
        
    Returns:
        List of alternative routes
    """
    try:
        logger.info(f"Getting {alternatives} alternative routes")
        
        routes = await yandex_api.get_route_alternatives(
            origin=origin,
            destination=destination,
            mode=mode,
            alternatives=alternatives
        )
        
        return {
            "success": True,
            "origin": origin,
            "destination": destination,
            "mode": mode,
            "alternatives": routes
        }
        
    except Exception as e:
        logger.error(f"Error getting alternatives: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Legacy endpoints for backward compatibility
# (keeping existing calculate_smart_walk and rebuild_route_segment)


# Cleanup on shutdown
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    logger.info("Shutting down...")
    await yandex_api.close()


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"Starting Intelligent Trails API on port {port}")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
