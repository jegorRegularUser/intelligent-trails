/**
 * Map integration hook for Yandex Maps with multi-modal routing
 * Handles map rendering, route visualization, and user interactions
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useYandexMaps } from './useYandexMaps';
import { useMultiModalRouting } from './useMultiModalRouting';
import {
  MultiModalRoute,
  RouteSegment,
  UserPreferences,
  RouteConstraints
} from '../types/routing';
import {
  Coordinate,
  TransportMode
} from '../types/graph';
import {
  RouteVisualization,
  VisualizationEvent,
  VisualizationEventType
} from '../types/visualization';

export interface MapState {
  isMapReady: boolean;
  isRouteDisplayed: boolean;
  selectedRoute: MultiModalRoute | null;
  mapCenter: [number, number];
  mapZoom: number;
  userLocation: [number, number] | null;
  isLocating: boolean;
}

export interface MapVisualizationOptions {
  showAlternatives: boolean;
  showRealTimeConditions: boolean;
  showAccessibilityInfo: boolean;
  animateRoute: boolean;
  clusterPOIs: boolean;
  theme: string;
}

export interface MapInteractionHandlers {
  onRouteClick?: (route: MultiModalRoute) => void;
  onSegmentClick?: (segment: RouteSegment) => void;
  onPOIClick?: (poi: any) => void;
  onMapClick?: (coordinate: [number, number]) => void;
  onMapMove?: (center: [number, number], zoom: number) => void;
}

export const useMapIntegration = (apiKey: string) => {
  const [mapState, setMapState] = useState<MapState>({
    isMapReady: false,
    isRouteDisplayed: false,
    selectedRoute: null,
    mapCenter: [55.7558, 37.6173], // Moscow center
    mapZoom: 13,
    userLocation: null,
    isLocating: false
  });

  const [visualizationOptions, setVisualizationOptions] = useState<MapVisualizationOptions>({
    showAlternatives: true,
    showRealTimeConditions: true,
    showAccessibilityInfo: true,
    animateRoute: false,
    clusterPOIs: true,
    theme: 'default'
  });

  // Refs for map objects
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeObjectsRef = useRef<any[]>([]);
  const poiObjectsRef = useRef<any[]>([]);
  const interactionHandlersRef = useRef<MapInteractionHandlers>({});

  // Hooks
  const { ymaps, loading: mapsLoading, error: mapsError, geocode } = useYandexMaps(apiKey);
  const {
    isCalculating,
    isInitialized,
    currentRoute,
    alternativeRoutes,
    routeComparison,
    visualization,
    realTimeConditions,
    error: routingError,
    calculateRoute,
    selectAlternativeRoute,
    setVisualizationTheme,
    startRouteAnimation,
    pauseRouteAnimation,
    resumeRouteAnimation,
    stopRouteAnimation,
    getRouteStatistics,
    addEventListener,
    removeEventListener,
    clearRoute
  } = useMultiModalRouting();

  // Initialize map
  const initializeMap = useCallback(async () => {
    if (!ymaps || !mapContainerRef.current || mapRef.current) return;

    try {
      mapRef.current = new ymaps.Map(mapContainerRef.current, {
        center: mapState.mapCenter,
        zoom: mapState.mapZoom,
        controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
      });

      // Add map event listeners
      mapRef.current.events.add('click', (e: any) => {
        const coords = e.get('coords');
        if (interactionHandlersRef.current.onMapClick) {
          interactionHandlersRef.current.onMapClick([coords[0], coords[1]]);
        }
      });

      mapRef.current.events.add('boundschange', (e: any) => {
        const center = mapRef.current.getCenter();
        const zoom = mapRef.current.getZoom();
        setMapState(prev => ({
          ...prev,
          mapCenter: [center[0], center[1]],
          mapZoom: zoom
        }));
        
        if (interactionHandlersRef.current.onMapMove) {
          interactionHandlersRef.current.onMapMove([center[0], center[1]], zoom);
        }
      });

      setMapState(prev => ({ ...prev, isMapReady: true }));
    } catch (error) {
      console.error('Map initialization error:', error);
    }
  }, [ymaps, mapState.mapCenter, mapState.mapZoom]);

  // Display route on map
  const displayRoute = useCallback(async (route: MultiModalRoute) => {
    if (!ymaps || !mapRef.current) return;

    try {
      // Clear existing route objects
      clearRouteFromMap();

      const routeObjects: any[] = [];

      // Create route segments
      for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i];
        
        // Convert coordinates
        const coordinates = segment.geometry.map(coord => [coord.latitude, coord.longitude]);
        
        // Create polyline for segment
        const polyline = new ymaps.Polyline(coordinates, {
          hintContent: `${segment.mode} - ${Math.round(segment.distance)}m, ${Math.round(segment.duration / 60)}min`,
          balloonContent: createSegmentBalloonContent(segment)
        }, {
          strokeColor: getSegmentColor(segment.mode),
          strokeWidth: getSegmentWidth(segment.mode),
          strokeOpacity: 0.8,
          zIndex: 5
        });

        // Add click handler
        polyline.events.add('click', () => {
          if (interactionHandlersRef.current.onSegmentClick) {
            interactionHandlersRef.current.onSegmentClick(segment);
          }
        });

        mapRef.current.geoObjects.add(polyline);
        routeObjects.push(polyline);
      }

      // Add start and end markers
      const startMarker = new ymaps.Placemark(
        [route.segments[0].fromCoordinate.latitude, route.segments[0].fromCoordinate.longitude],
        {
          balloonContent: 'Начало маршрута',
          hintContent: 'Старт'
        },
        {
          preset: 'islands#greenIcon'
        }
      );

      const endMarker = new ymaps.Placemark(
        [route.segments[route.segments.length - 1].toCoordinate.latitude, route.segments[route.segments.length - 1].toCoordinate.longitude],
        {
          balloonContent: 'Конец маршрута',
          hintContent: 'Финиш'
        },
        {
          preset: 'islands#redIcon'
        }
      );

      mapRef.current.geoObjects.add(startMarker);
      mapRef.current.geoObjects.add(endMarker);
      routeObjects.push(startMarker, endMarker);

      // Add transfer points
      for (let i = 0; i < route.segments.length - 1; i++) {
        const currentSegment = route.segments[i];
        const nextSegment = route.segments[i + 1];

        if (currentSegment.mode !== nextSegment.mode) {
          const transferMarker = new ymaps.Placemark(
            [currentSegment.toCoordinate.latitude, currentSegment.toCoordinate.longitude],
            {
              balloonContent: `Пересадка: ${currentSegment.mode} → ${nextSegment.mode}`,
              hintContent: 'Пересадка'
            },
            {
              preset: 'islands#yellowIcon'
            }
          );

          mapRef.current.geoObjects.add(transferMarker);
          routeObjects.push(transferMarker);
        }
      }

      // Add POI markers if available
      if (route.waypoints.length > 0) {
        for (const waypoint of route.waypoints) {
          if (waypoint.properties.poiId) {
            const poiMarker = new ymaps.Placemark(
              [waypoint.coordinate.latitude, waypoint.coordinate.longitude],
              {
                balloonContent: createPOIBalloonContent(waypoint),
                hintContent: waypoint.name || 'POI'
              },
              {
                preset: 'islands#blueIcon'
              }
            );

            poiMarker.events.add('click', () => {
              if (interactionHandlersRef.current.onPOIClick) {
                interactionHandlersRef.current.onPOIClick(waypoint);
              }
            });

            mapRef.current.geoObjects.add(poiMarker);
            routeObjects.push(poiMarker);
          }
        }
      }

      routeObjectsRef.current = routeObjects;

      // Fit map to route bounds
      if (route.geometry.length > 0) {
        const bounds = calculateRouteBounds(route.geometry);
        mapRef.current.setBounds(bounds, { checkZoomRange: true });
      }

      setMapState(prev => ({
        ...prev,
        isRouteDisplayed: true,
        selectedRoute: route
      }));

    } catch (error) {
      console.error('Error displaying route:', error);
    }
  }, [ymaps]);

  // Display alternative routes
  const displayAlternativeRoutes = useCallback(async (routes: MultiModalRoute[]) => {
    if (!ymaps || !mapRef.current || !visualizationOptions.showAlternatives) return;

    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex];
      
      for (const segment of route.segments) {
        const coordinates = segment.geometry.map(coord => [coord.latitude, coord.longitude]);
        
        const polyline = new ymaps.Polyline(coordinates, {
          hintContent: `Альтернативный маршрут ${routeIndex + 1}`,
          balloonContent: `Маршрут ${routeIndex + 1}: ${Math.round(route.totalDistance)}м, ${Math.round(route.totalDuration / 60)}мин`
        }, {
          strokeColor: getAlternativeRouteColor(routeIndex),
          strokeWidth: 3,
          strokeOpacity: 0.5,
          strokeStyle: '5 5', // Dashed line
          zIndex: 3
        });

        polyline.events.add('click', () => {
          selectAlternativeRoute(route.id);
        });

        mapRef.current.geoObjects.add(polyline);
        routeObjectsRef.current.push(polyline);
      }
    }
  }, [ymaps, visualizationOptions.showAlternatives, selectAlternativeRoute]);

  // Clear route from map
  const clearRouteFromMap = useCallback(() => {
    if (!mapRef.current) return;

    routeObjectsRef.current.forEach(obj => {
      mapRef.current.geoObjects.remove(obj);
    });
    routeObjectsRef.current = [];

    setMapState(prev => ({
      ...prev,
      isRouteDisplayed: false,
      selectedRoute: null
    }));
  }, []);

  // Get user location
  const getUserLocation = useCallback(async (): Promise<[number, number] | null> => {
    if (!navigator.geolocation) return null;

    setMapState(prev => ({ ...prev, isLocating: true }));

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          setMapState(prev => ({
            ...prev,
            userLocation: coords,
            isLocating: false
          }));
          resolve(coords);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setMapState(prev => ({ ...prev, isLocating: false }));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
  }, []);

  // Center map on user location
  const centerOnUserLocation = useCallback(async () => {
    const location = await getUserLocation();
    if (location && mapRef.current) {
      mapRef.current.setCenter(location, 15);
    }
  }, [getUserLocation]);

  // Set map center and zoom
  const setMapView = useCallback((center: [number, number], zoom?: number) => {
    if (mapRef.current) {
      mapRef.current.setCenter(center, zoom || mapState.mapZoom);
      setMapState(prev => ({
        ...prev,
        mapCenter: center,
        mapZoom: zoom || prev.mapZoom
      }));
    }
  }, [mapState.mapZoom]);

  // Update visualization options
  const updateVisualizationOptions = useCallback((options: Partial<MapVisualizationOptions>) => {
    setVisualizationOptions(prev => ({ ...prev, ...options }));
    
    // Apply theme change
    if (options.theme) {
      setVisualizationTheme(options.theme);
    }

    // Refresh route display if needed
    if (currentRoute && (options.showAlternatives !== undefined || options.showRealTimeConditions !== undefined)) {
      displayRoute(currentRoute);
      if (options.showAlternatives && alternativeRoutes.length > 0) {
        displayAlternativeRoutes(alternativeRoutes);
      }
    }
  }, [currentRoute, alternativeRoutes, displayRoute, displayAlternativeRoutes, setVisualizationTheme]);

  // Set interaction handlers
  const setInteractionHandlers = useCallback((handlers: MapInteractionHandlers) => {
    interactionHandlersRef.current = handlers;
  }, []);

  // Helper functions
  const getSegmentColor = (mode: TransportMode): string => {
    const colors = {
      [TransportMode.WALKING]: '#4CAF50',
      [TransportMode.BICYCLE]: '#2196F3',
      [TransportMode.CAR]: '#F44336',
      [TransportMode.BUS]: '#FF9800',
      [TransportMode.METRO]: '#9C27B0',
      [TransportMode.TRAM]: '#00BCD4',
      [TransportMode.TRAIN]: '#607D8B',
      [TransportMode.FERRY]: '#009688'
    };
    return colors[mode] || '#2196F3';
  };

  const getSegmentWidth = (mode: TransportMode): number => {
    const widths = {
      [TransportMode.WALKING]: 4,
      [TransportMode.BICYCLE]: 5,
      [TransportMode.CAR]: 6,
      [TransportMode.BUS]: 6,
      [TransportMode.METRO]: 6,
      [TransportMode.TRAM]: 6,
      [TransportMode.TRAIN]: 6,
      [TransportMode.FERRY]: 6
    };
    return widths[mode] || 4;
  };

  const getAlternativeRouteColor = (index: number): string => {
    const colors = ['#9E9E9E', '#795548', '#607D8B'];
    return colors[index % colors.length];
  };

  const createSegmentBalloonContent = (segment: RouteSegment): string => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 300px;">
        <h4 style="margin: 0 0 8px 0; color: #333;">${segment.mode}</h4>
        <div style="margin-bottom: 4px;"><strong>Расстояние:</strong> ${Math.round(segment.distance)}м</div>
        <div style="margin-bottom: 4px;"><strong>Время:</strong> ${Math.round(segment.duration / 60)}мин</div>
        <div style="margin-bottom: 4px;"><strong>Стоимость:</strong> ${segment.cost}₽</div>
        ${segment.properties.routeName ? `<div style="margin-bottom: 4px;"><strong>Маршрут:</strong> ${segment.properties.routeName}</div>` : ''}
        ${segment.accessibility.wheelchairAccessible ? '<div style="color: #4CAF50;">♿ Доступно для инвалидных колясок</div>' : ''}
      </div>
    `;
  };

  const createPOIBalloonContent = (waypoint: any): string => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 300px;">
        <h4 style="margin: 0 0 8px 0; color: #333;">${waypoint.name || 'Точка интереса'}</h4>
        ${waypoint.properties.address ? `<div style="margin-bottom: 4px; color: #666;">${waypoint.properties.address}</div>` : ''}
        ${waypoint.properties.type ? `<div style="margin-bottom: 4px;"><strong>Тип:</strong> ${waypoint.properties.type}</div>` : ''}
        ${waypoint.duration ? `<div style="margin-bottom: 4px;"><strong>Время посещения:</strong> ${waypoint.duration}мин</div>` : ''}
      </div>
    `;
  };

  const calculateRouteBounds = (geometry: Coordinate[]): [[number, number], [number, number]] => {
    let minLat = geometry[0].latitude;
    let maxLat = geometry[0].latitude;
    let minLon = geometry[0].longitude;
    let maxLon = geometry[0].longitude;

    for (const coord of geometry) {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLon = Math.min(minLon, coord.longitude);
      maxLon = Math.max(maxLon, coord.longitude);
    }

    return [[minLat, minLon], [maxLat, maxLon]];
  };

  // Initialize map when ymaps is ready
  useEffect(() => {
    if (ymaps && !mapRef.current) {
      initializeMap();
    }
  }, [ymaps, initializeMap]);

  // Display current route when it changes
  useEffect(() => {
    if (currentRoute && mapState.isMapReady) {
      displayRoute(currentRoute);
      
      if (visualizationOptions.showAlternatives && alternativeRoutes.length > 0) {
        displayAlternativeRoutes(alternativeRoutes);
      }
    }
  }, [currentRoute, mapState.isMapReady, alternativeRoutes, displayRoute, displayAlternativeRoutes, visualizationOptions.showAlternatives]);

  // Handle visualization events
  useEffect(() => {
    const handleVisualizationEvent = (event: VisualizationEvent) => {
      console.log('Visualization event:', event);
    };

    addEventListener(VisualizationEventType.ROUTE_LOADED, handleVisualizationEvent);
    addEventListener(VisualizationEventType.THEME_CHANGED, handleVisualizationEvent);

    return () => {
      removeEventListener(VisualizationEventType.ROUTE_LOADED, handleVisualizationEvent);
      removeEventListener(VisualizationEventType.THEME_CHANGED, handleVisualizationEvent);
    };
  }, [addEventListener, removeEventListener]);

  return {
    // State
    mapState,
    visualizationOptions,
    isLoading: mapsLoading || isCalculating,
    error: mapsError || routingError,

    // Map refs
    mapContainerRef,
    mapRef,

    // Routing state
    isInitialized,
    currentRoute,
    alternativeRoutes,
    routeComparison,
    visualization,
    realTimeConditions,

    // Map functions
    initializeMap,
    displayRoute,
    clearRouteFromMap,
    setMapView,
    getUserLocation,
    centerOnUserLocation,

    // Routing functions
    calculateRoute,
    selectAlternativeRoute,
    clearRoute,

    // Visualization functions
    updateVisualizationOptions,
    setInteractionHandlers,
    startRouteAnimation,
    pauseRouteAnimation,
    resumeRouteAnimation,
    stopRouteAnimation,
    getRouteStatistics,

    // Utilities
    geocode
  };
};