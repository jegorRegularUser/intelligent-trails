from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
from dotenv import load_dotenv
import yandex_api

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Intelligent Trails API",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
YANDEX_SUGGEST_API_KEY = os.getenv("YANDEX_SUGGEST_API_KEY")

@app.get("/")
async def root():
    return {
        "service": "Intelligent Trails API", 
        "version": "4.0.0",
        "status": "running"
    }

@app.post("/api/search/places")
async def search_places_endpoint(request: dict = Body(...)):
    try:
        if not YANDEX_API_KEY or not YANDEX_SUGGEST_API_KEY:
            raise HTTPException(status_code=500, detail="API keys not configured")
        
        center_coords = request.get('center_coords')
        categories = request.get('categories', [])
        radius_m = request.get('radius_m', 5000)
        
        if not center_coords or len(center_coords) != 2:
            raise HTTPException(status_code=400, detail="Invalid center_coords: must be [lon, lat]")
        
        if not categories or len(categories) == 0:
            raise HTTPException(status_code=400, detail="Categories list is empty")
        
        logger.info(f"Search request: {categories} near {center_coords}, radius={radius_m}m")
        
        places = await yandex_api.search_places(center_coords, categories, radius_m)
        
        places_by_category = {}
        for place in places:
            category = place['category']
            if category not in places_by_category:
                places_by_category[category] = []
            places_by_category[category].append(place)
        
        return {
            "success": True,
            "places_by_category": places_by_category,
            "total_count": len(places)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
