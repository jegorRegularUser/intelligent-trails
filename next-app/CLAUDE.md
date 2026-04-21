# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Intelligent Trails is a Next.js 16 route planning application that helps users build intelligent walking/cycling routes with points of interest. The app uses Yandex Maps for routing, OpenStreetMap Overpass API for finding places, and supports internationalization (Russian/English).

## Page Structure

- **`/` (Landing)** - Marketing landing page with hero, features, and tutorial sections
- **`/map`** - Main route planning application with map and sidebar
- **`/history`** - User's saved routes with filtering and sorting
- **`/profile`** - User profile settings (name, password, language)
- **`/signin`, `/signup`** - Authentication pages

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
2. **Server Actions** → `src/actions/routeBuilder.ts` calls OSM Overpass API to find places by category
3. **Parallel Processing** → Address geocoding happens in parallel via `Promise.all()`
4. **Smart Ranking** → Places ranked by quality, direction, and diversity
5. **State Update** → Results stored in `useRouteStore` as `mapPoints` with alternatives
6. **Map Rendering** → `RouteMap` component reads `mapPoints` and renders Yandex Maps routes
7. **URL Persistence** → `RouteSidebarManager` encodes/decodes route state to/from URL query param `?r=`

**Performance Optimizations**:
- Parallel address geocoding (3x faster for multiple addresses)
- In-memory cache for OSM queries (15-20x faster for repeated searches)
- Smart geocoding (uses OSM addresses when available, -60% API calls)
- Adaptive radius search (finds more places, fewer "not found" errors)

### Key Components

**Landing Page Components** (`src/components/landing/`):
- **`HeroSection`**: Hero banner with title, subtitle, CTA buttons, animated background
- **`FeaturesSection`**: 6 feature cards with icons (smart routing, categories, transport, sharing, history, alternatives)
- **`TutorialSection`**: 7-step tutorial with GIF placeholders and descriptions

**Route Planning Components**:
- **`RouteSidebarManager`**: Orchestrates the entire flow, handles URL-based route restoration
- **`RouteBuilderSidebar`**: Form for creating routes (start, waypoints, end, transport modes)
- **`RouteResultSidebar`**: Displays built route with timeline, alternatives carousel, travel metrics, share and save buttons
- **`RouteMap`**: Yandex Maps integration with multi-segment routing and real-time metrics

### Server Actions Pattern

All API calls to external services (OSM, Yandex Geocoder) and database operations are implemented as Next.js Server Actions in `src/actions/`:
- `builder.ts` - Smart route building with alternatives
- `geocoder.ts` - Reverse geocoding (coordinates → address)
- `osmPlaces.ts` - Find places by category near a point
- `overpass.ts` - Low-level Overpass API queries
- `suggest.ts` - Address autocomplete
- `routes.ts` - Database operations for saving/loading user routes (requires authentication)

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
- **Categories defined in** `src/constants/categories.ts` - single source of truth for all categories
- Supports 9 categories: cafe, restaurant, park, museum, attraction, bar, cinema, shopping, viewpoint
- Russian aliases supported (кафе, ресторан, парк, музей)
- **Adaptive radius search**: progressively expands search radius until 5+ places found
- 4-second timeout per mirror, uses `Promise.any()` for fastest response
- **In-memory LRU cache** with 10-minute TTL for repeated queries
- Returns alternatives for user selection

**Smart Ranking System** (`src/utils/placeRanking.ts`):
- Quality scoring based on rating, popularity (Wikipedia, website, phone), and size
- Directional cone filtering (±90° toward destination) to avoid backtracking
- Distance penalty (0-500m: no penalty, >2000m: -30 to -50 points)
- Diversity selection (minimum 300m between alternatives)

See `ALGORITHM_IMPROVEMENTS.md` and `RANKING_ALGORITHM.md` for detailed documentation.

## Path Aliases

TypeScript is configured with `@/*` alias pointing to `src/*` (see `tsconfig.json`).

## Testing

- Framework: Vitest with Node environment
- Config: `vitest.config.ts` with 20s timeout (for slow Overpass API calls)
- Test files: `*.test.ts` pattern
- **MongoDB Memory Server**: In-memory MongoDB for isolated database tests

### Test Coverage (69 tests total)

**Database CRUD Tests** (`src/__tests__/db/mongodb.test.ts` - 34 tests):
- Users Collection: CREATE, READ, UPDATE, DELETE operations
- Routes Collection: CREATE, READ, UPDATE, DELETE operations with filtering, sorting, pagination
- Index validation (unique email, compound indexes)

**Profile Actions Tests** (`src/__tests__/actions/profile.test.ts` - 11 tests):
- `updateNameAction`: name updates, validation, authorization checks
- `updatePasswordAction`: password changes, bcrypt hashing, OAuth user handling

**Routes Actions Tests** (`src/__tests__/actions/routes.test.ts` - 17 tests):
- `saveRouteAction`: saving routes, duplicate detection, metadata extraction
- `getUserRoutesAction`, `deleteRouteAction`, `toggleFavoriteAction`, `updateRouteAction`

**OSM Service Tests** (`src/services/osm.test.ts` - 7 tests):
- Category search for all 9 categories (cafe, restaurant, park, museum, attraction, bar, cinema, shopping, viewpoint)
- Russian aliases handling
- Progressive radius search

Run tests: `npm test` or `npm test -- --run`

### Database & Authentication (MongoDB + NextAuth)

The app uses MongoDB for persistent storage and NextAuth.js for authentication:

- **Database**: MongoDB Atlas with collections for users (via NextAuth adapter) and routes
- **Authentication**: NextAuth.js with 4 providers: Credentials (email/password), Google, GitHub, Yandex
- **Session Strategy**: JWT with automatic data refresh from DB
- **Repository Pattern**: `src/lib/db/repositories/` handles all database queries
- **Indexes**: Compound indexes on `userId + createdAt`, `categories`, `metrics` for fast filtering

Key files:
- `src/lib/db/mongodb.ts` - MongoDB client singleton with connection pooling (30s timeout)
- `src/lib/db/schemas.ts` - TypeScript interfaces for User and RouteDocument
- `src/lib/db/repositories/users.ts` - User CRUD operations with bcrypt password hashing
- `src/lib/db/repositories/routes.ts` - Route CRUD operations with filtering/sorting
- `src/lib/auth/config.ts` - NextAuth configuration with session callback that refreshes user data from DB
- `src/app/api/auth/[...nextauth]/route.ts` - NextAuth API route

**Important**: NextAuth session callback automatically fetches fresh user data from MongoDB on every session request, ensuring UI always shows current data without manual refresh.

### Authentication Flow

**Registration** (`src/app/[locale]/signup/page.tsx`):
1. User fills form (name, email, password, confirm password)
2. Client validates password length (min 6 chars) and matching
3. Calls `registerUserAction` (Server Action)
4. Server hashes password with bcrypt, creates user in DB
5. Auto-login with NextAuth `signIn('credentials')`

**Login** (`src/app/[locale]/signin/page.tsx`):
- Email/password form → `signIn('credentials')`
- OAuth buttons → `signIn('google'/'github'/'yandex')`

**Profile Management** (`src/app/[locale]/profile/page.tsx`):
- Server component that checks auth with `auth()`, redirects if not authenticated
- Wrapped in `ToastProvider` for notifications
- Three settings sections: ProfileSettings, SecuritySettings, PreferencesSettings

**Profile Actions** (`src/actions/profile.ts`):
- `updateNameAction`: Updates user name in DB, triggers session refresh via `revalidatePath`
- `updatePasswordAction`: Verifies current password, hashes new password, updates DB (local provider only)

**Route History** (`src/app/[locale]/history/page.tsx`):
- Server component loads last 3 routes via `getUserRoutesAction`
- Client component (`HistoryPageClient`) handles interactions (favorite, rename, delete, share)
- All actions check authentication and user ownership

**Route Saving** (`src/components/features/RouteResultSidebar.tsx`):
- Bookmark icon button in header
- Calls `saveRouteAction` with encoded route data
- Automatic duplicate detection (compares with last saved route)
- Shows toast notification on success/error

Routes are stored with denormalized metadata (categories, transport modes, metrics) for efficient filtering and sorting without decoding the `encodedRoute` field.

### Toast Notifications

Global toast system (`src/contexts/ToastContext.tsx`):
- Types: success (green), error (red), info (gray)
- Auto-dismiss after 4 seconds
- Fixed position top-right, z-index 9999
- Used throughout app for user feedback (save success, errors, etc.)

Usage:
```typescript
const { showToast } = useToast();
showToast('Message', 'success'); // or 'error', 'info'
```

### UI Components

**Profile Components** (`src/components/features/profile/`):
- `ProfileSettings`: Name and email form with save button
- `SecuritySettings`: Password change form (local provider) or OAuth warning
- `PreferencesSettings`: Language selector (ru/en) with instant redirect

**History Components** (`src/components/features/history/`):
- `HistoryPageClient`: Main history page with search, filters, sorting
- `RouteCard`: Individual route card with actions (favorite, rename, delete, share)
- `RouteSearchBar`: Search by name or tags
- `RouteFiltersPanel`: Filter by categories, transport modes, distance, duration
- `RouteSortDropdown`: Sort by date, name, distance, duration
- `RecentRoutesCarousel`: Carousel of last 3 routes
- `RouteStatsCard`: User statistics (total routes, distance, time)
- `EmptyState`: Shown when no routes exist

**Common UI** (`src/components/ui/`):
- `Card`: Rounded white card with border
- `Input`: Text input with optional left icon
- `Button`: Primary/outline variants with loading state
- `Avatar`: User avatar with fallback initials
- `Badge`: Small colored badge for tags
- `Dropdown`: Select dropdown
- `IconButton`: Icon-only button

## Environment Variables

Required in `.env.local`:
```bash
# Maps & APIs
NEXT_PUBLIC_YANDEX_API_KEY=your_yandex_maps_api_key

# Database
MONGODB_URI=mongodb://user:pass@host1:27017,host2:27017,host3:27017/intelligent-trails?ssl=true&replicaSet=...

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
YANDEX_CLIENT_ID=your-yandex-client-id
YANDEX_CLIENT_SECRET=your-yandex-client-secret
```

**Note**: MongoDB URI uses standard format (not SRV) with replica set configuration for MongoDB Atlas.

See `DATABASE.md` for detailed setup instructions.

## React Compiler

The project uses the experimental React Compiler (`babel-plugin-react-compiler`) enabled in `next.config.ts` with `reactCompiler: true`.

## Common Patterns

### Adding a New Category

**All categories are centrally managed in `src/constants/categories.ts`**. To add a new category:

1. **Add entry to `PLACE_CATEGORIES`** in `src/constants/categories.ts`:
   ```typescript
   newcategory: {
     id: 'newcategory',
     icon: IconComponent,  // Import from lucide-react
     osmTag: '["key"="value"]',  // OpenStreetMap tag query
     radiuses: [200, 800, 2500, 6000]  // Adaptive search radiuses in meters
   }
   ```

2. **Add translations** to `messages/ru.json` and `messages/en.json`:
   ```json
   "BuilderSidebar": {
     "catNewcategory": "Название категории"
   }
   ```

3. **Optionally add Russian aliases** to `CATEGORY_ALIASES` in `src/constants/categories.ts`:
   ```typescript
   'русское_название': 'newcategory'
   ```

That's it! The category will automatically appear in:
- Route builder UI (`RouteBuilderSidebar`, `WaypointItem`)
- History filters (`RouteFiltersPanel`)
- Route cards (`RouteCard`, `RouteCardThumbnail`)
- OSM search service (`src/services/osm.ts`)
- Tests (`src/services/osm.test.ts`)

**Radius Guidelines**:
- Small venues (cafes, bars): `[200, 700, 2000, 5000]`
- Medium venues (restaurants, shops): `[200, 800, 2500, 6000]`
- Large venues (parks, attractions): `[300, 1000, 3500, 8000]`
- Rare venues (museums, cinemas, viewpoints): `[400, 1500, 4000, 10000]`

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

### Updating User Profile Data

When updating user data (name, password), follow this pattern:

1. **Server Action** updates MongoDB directly (not through repository)
2. **NextAuth Session Callback** automatically refreshes data from DB on next session request
3. **No manual refresh needed** - data updates automatically when user navigates or reloads

Example from `src/actions/profile.ts`:
```typescript
const db = await getDb();
const usersCollection = db.collection('users');
await usersCollection.updateOne(
  { _id: new ObjectId(session.user.id) },
  { $set: { name: newName } }
);
revalidatePath('/[locale]/profile', 'page'); // Triggers Next.js cache invalidation
```

The session callback in `src/lib/auth/config.ts` ensures fresh data:
```typescript
async session({ session, token }) {
  // Fetch fresh user data from DB on every session request
  const user = await usersCollection.findOne({ _id: new ObjectId(token.sub) });
  if (user) {
    session.user.name = user.name;
    session.user.email = user.email;
  }
  return session;
}
```

**Important**: Never use `router.refresh()` for profile updates - it's unnecessary and can cause race conditions. The session callback handles data freshness automatically.

### Duplicate Route Detection

When saving routes, the system automatically checks for duplicates:
- Compares `encodedRoute` with the last saved route
- Returns `{ success: true, isDuplicate: true }` if duplicate found
- Shows info toast instead of success toast
- Prevents database bloat from repeated saves of same route

## Git Workflow

- Main branch: `main`
- Recent work includes route URL persistence, profile page scaffolding, and map integration
- Commit messages are in Russian
