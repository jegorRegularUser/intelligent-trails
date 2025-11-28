# Intelligent Trails Backend

🎉 **Smart routes for walks and trips**

Backend service for building optimal routes with visiting interesting places.

---

## Features

### Hybrid Routing System (NEW!)

- **3 free APIs** with automatic fallback:
  - OSRM - fully free (walk, bike, car)
  - GraphHopper - 500 requests/day (excellent bike routes)
  - Mapbox - 100k requests/month (traffic data!)
- **Smart selection** of best service for each transport mode
- **Route caching** for 30 days
- **API usage statistics**

### Smart Walks

- **Flexible activities**: walks, place visits
- **Different styles**: scenic (through parks), direct (shortest)
- **Multimodal**: pedestrian, auto, bicycle, mass transit
- **Place search**: cafes, parks, museums, monuments, etc.

### Route Optimization

- **VRP solution** using Google OR-Tools
- **Dynamic pace**: relaxed, balanced, active
- **Flexible time constraints**

---

## Quick Start

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configuration

```bash
cp .env.example .env
```

**Minimal config** (works immediately):
- OSRM already available, no setup needed!

**Recommended config** (full features):

```env
# .env
GRAPHHOPPER_API_KEY=your_key  # https://www.graphhopper.com/
MAPBOX_API_KEY=your_token     # https://account.mapbox.com/
```

See: [`ROUTING_MIGRATION.md`](./ROUTING_MIGRATION.md)

### 3. Run

```bash
uvicorn main:app --reload
```

Server starts at: http://localhost:8000

### 4. Test

```bash
python test_routing.py
```

---

## API Documentation

### Main endpoint

#### `POST /calculate_smart_walk`

Smart walk building with activities.

**Example request:**

```json
{
  "start_point": {
    "name": "Red Square",
    "coords": [55.7539, 37.6208]
  },
  "activities": [
    {
      "type": "walk",
      "duration_minutes": 30,
      "walking_style": "scenic",
      "transport_mode": "pedestrian"
    },
    {
      "type": "place",
      "duration_minutes": 45,
      "category": "cafe",
      "time_at_place": 30,
      "transport_mode": "pedestrian"
    }
  ]
}
```

### Monitoring

- `GET /routing/stats` - API usage statistics
- `POST /routing/clear_cache` - Clear route cache  
- `GET /status` - Server health check

---

## Architecture

```
backend/
├── main.py                  # FastAPI app, endpoints
├── routing_service.py      # Hybrid routing (OSRM, GraphHopper, Mapbox)
├── yandex_api.py           # Place search via OpenStreetMap
├── solver.py               # VRP optimization (OR-Tools)
├── test_routing.py         # Routing tests
├── .env.example            # Config example
├── ROUTING_MIGRATION.md    # Migration guide
└── README.md               # This file
```

---

## Technologies

- **FastAPI** - modern async web framework
- **Pydantic** - data validation
- **httpx** - async HTTP client
- **Google OR-Tools** - route optimization

### Routing

- **OSRM** - Open Source Routing Machine
- **GraphHopper** - commercial API (free tier)
- **Mapbox Directions** - commercial API (free tier)

### Place Search

- **OpenStreetMap Overpass API** - fully free

---

## Roadmap

- [ ] Redis for cache (instead of in-memory)
- [ ] HERE Maps API (250k/month free)
- [ ] Public transport (OpenTripPlanner)
- [ ] WebSocket for real-time updates
- [ ] Prometheus metrics
- [ ] Docker compose with Redis
- [ ] CI/CD pipeline

---

## Support

If you have questions:

1. Read [`ROUTING_MIGRATION.md`](./ROUTING_MIGRATION.md)
2. Run `python test_routing.py`
3. Check `/routing/stats`
4. Open issue on GitHub

---

**Made with ❤️ for smart walking routes**
