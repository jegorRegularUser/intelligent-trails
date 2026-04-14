# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Intelligent Trails is a Next.js 16 route planning application that helps users build intelligent walking/cycling routes with points of interest. The app uses Yandex Maps for routing, OpenStreetMap Overpass API for finding places, and supports internationalization (Russian/English).

## Development Commands

```bash
# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Run tests (Vitest)
npm test
```

## Architecture

### State Management (Zustand)

The app uses a single Zustand store (`src/store/useRouteStore.ts`) that manages:
- **Form state**: `startPoint`, `waypoints`, `endPoint`, transport modes
- **Map state**: `mapPoints` array with resolved coordinates, alternatives, and travel metrics
- **Build state**: `isRouteBuilt` flag to toggle between builder and result views

The store acts as a bridge between the route builder form and the map visualization.

### Route Building Flow

1. **User Input** → `RouteBuilderSidebar` collects start/waypoints/end (addresses or categories)
2. **Server Actions** → `src/actions/builder.ts` calls OSM Overpass API to find places by category
3. **State Update** → Results stored in `useRouteStore` as `mapPoints` with alternatives
4. **Map Rendering** → `RouteMap` component reads `mapPoints` and renders Yandex Maps routes
5. **URL Persistence** → `RouteSidebarManager` encodes/decodes route state to/from URL query param `?r=`

### Key Components

- **`RouteSidebarManager`**: Orchestrates the entire flow, handles URL-based route restoration
- **`RouteBuilderSidebar`**: Form for creating routes (start, waypoints, end, transport modes)
- **`RouteResultSidebar`**: Displays built route with timeline, alternatives carousel, travel metrics
- **`RouteMap`**: Yandex Maps integration with multi-segment routing and real-time metrics

### Server Actions Pattern

All API calls to external services (OSM, Yandex Geocoder) are implemented as Next.js Server Actions in `src/actions/`:
- `builder.ts` - Smart route building with alternatives
- `geocoder.ts` - Reverse geocoding (coordinates → address)
- `osmPlaces.ts` - Find places by category near a point
- `overpass.ts` - Low-level Overpass API queries
- `suggest.ts` - Address autocomplete

### Internationalization (next-intl)

- Configured in `src/i18n.ts` with locales `['ru', 'en']`
- Messages stored in `messages/ru.json` and `messages/en.json`
- Routes use `[locale]` dynamic segment: `/ru/...` or `/en/...`
- **Important**: Next.js 15+ requires `await params` in layouts/pages (params is now a Promise)

### URL-Based Route Sharing

Routes are encoded into a compressed Base64 URL parameter (`?r=...`) using `src/utils/routeCodec.ts`. This allows:
- Sharing routes via link
- Browser back/forward navigation
- Fast restoration without re-querying OSM (coordinates are cached in URL)

The codec uses a compressed format with single-letter keys (`s`, `e`, `st`, `w`, `t`, `v`, `c`, `d`, `m`) to minimize URL length.

### Map Integration

The app uses **Yandex Maps** (not Maplibre) via `@pbe/react-yandex-maps`:
- API key required: `NEXT_PUBLIC_YANDEX_API_KEY` in `.env.local`
- Multi-segment routing with `ymapsInstance.multiRouter.MultiRoute`
- Real-time distance/duration metrics extracted from route model events
- Different stroke colors per transport mode (green=pedestrian, orange=masstransit, blue=auto)

### OSM Overpass API

Place search uses multiple Overpass API mirrors with fallback (`src/services/osm.ts`):
- Supports categories: cafe, restaurant, park, museum (with Russian aliases)
- Progressive radius search: tries 300m → 1000m → 3000m until 5+ results found
- 4-second timeout per mirror, uses `Promise.any()` for fastest response
- Returns alternatives for user selection

## Path Aliases

TypeScript is configured with `@/*` alias pointing to `src/*` (see `tsconfig.json`).

## Testing

- Framework: Vitest with Node environment
- Config: `vitest.config.ts` with 20s timeout (for slow Overpass API calls)
- Test files: `*.test.ts` pattern (currently only `src/services/osm.test.ts`)

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_YANDEX_API_KEY=your_yandex_maps_api_key
```

## React Compiler

The project uses the experimental React Compiler (`babel-plugin-react-compiler`) enabled in `next.config.ts` with `reactCompiler: true`.

## Common Patterns

### Adding a New Category

1. Add OSM tag to `CATEGORY_CONFIG` in `src/services/osm.ts`
2. Add Russian alias to `ALIASES` if needed
3. Add translation keys to `messages/ru.json` and `messages/en.json`

### Modifying Route Building Logic

The core algorithm is in `src/actions/builder.ts` → `buildSmartRouteWithAlternatives()`:
- Takes start/end coordinates and category list
- For each category, finds nearest places via OSM
- Returns array of `BuiltStep` with alternatives and travel metrics
- Uses hardcoded speeds per transport mode (pedestrian: 1.38 m/s, bicycle: 4.16 m/s, etc.)

### Working with Alternatives

Alternatives are stored at two levels:
1. **FormWaypoint** (form state): `alternatives` array with `selectedAlternativeIndex`
2. **MapRoutePoint** (map state): same structure, synced by `RouteSidebarManager`

When user selects a different alternative in `AlternativesCarousel`, both states must be updated and URL re-encoded.

## Git Workflow

- Main branch: `main`
- Recent work includes route URL persistence, profile page scaffolding, and map integration
- Commit messages are in Russian
