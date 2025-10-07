import { useEffect, useMemo, useRef, useState } from "react";
import L, { LatLngExpression, Map as LeafletMap, LayerGroup, Polyline as LeafletPolyline, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, MapPin, X, Route as RouteIcon, Clock, TrendingUp, Footprints, Bike, Car, } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// Настройка дефолтных иконок Leaflet
const setupLeafletIcons = () => {
  // @ts-expect-error private api
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
};

interface Place {
  id: string;
  name: string;
  type: string;
  coordinates: [number, number];
  description: string;
  icon: string;
}

interface RouteData {
  id: string;
  name: string;
  distance: number;
  duration: number;
  coordinates: [number, number][];
  places: Place[];
  mode: "walking" | "bike" | "car";
}

// Мок данные
const mockPlaces: Place[] = [
  { id: "1", name: "Исторический музей", type: "historical", coordinates: [55.7558, 37.6173], description: "Крупнейший музей российской истории", icon: "🏛️" },
  { id: "2", name: "Парк Горького", type: "park", coordinates: [55.7307, 37.6015], description: "Центральный парк культуры и отдыха", icon: "🌳" },
  { id: "3", name: "Кафе Пушкинъ", type: "food", coordinates: [55.7655, 37.6067], description: "Знаменитый ресторан русской кухни", icon: "🍽️" },
  { id: "4", name: "Третьяковская галерея", type: "cultural", coordinates: [55.7415, 37.6207], description: "Художественный музей", icon: "🎭" },
  { id: "5", name: "Смотровая площадка", type: "viewpoint", coordinates: [55.751, 37.5982], description: "Панорамный вид на город", icon: "🌅" },
];

const mockRoutes: RouteData[] = [
  {
    id: "1",
    name: "Культурный маршрут",
    distance: 8.5,
    duration: 120,
    mode: "walking",
    places: [mockPlaces[0], mockPlaces[3], mockPlaces[2]],
    coordinates: [
      [55.7558, 37.6173],
      [55.752, 37.615],
      [55.748, 37.618],
      [55.7415, 37.6207],
      [55.745, 37.615],
      [55.75, 37.61],
      [55.758, 37.608],
      [55.7655, 37.6067],
    ],
  },
  {
    id: "2",
    name: "Зеленый маршрут",
    distance: 6.2,
    duration: 90,
    mode: "bike",
    places: [mockPlaces[1], mockPlaces[4]],
    coordinates: [
      [55.7558, 37.6173],
      [55.75, 37.61],
      [55.745, 37.605],
      [55.74, 37.602],
      [55.735, 37.6],
      [55.7307, 37.6015],
    ],
  },
  {
    id: "3",
    name: "Быстрый маршрут",
    distance: 5.1,
    duration: 45,
    mode: "car",
    places: [],
    coordinates: [
      [55.7558, 37.6173],
      [55.752, 37.61],
      [55.748, 37.605],
      [55.745, 37.602],
      [55.7415, 37.6],
    ],
  },
];

const getRouteColor = (mode: RouteData["mode"]) => {
  switch (mode) {
    case "walking":
      return "#0ea5e9";
    case "bike":
      return "#10b981";
    case "car":
      return "#f97316";
    default:
      return "#0ea5e9";
  }
};

const MapPage = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const graphicsLayerRef = useRef<LayerGroup | null>(null);

  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(mockRoutes[0]);
  const [showRoutePanel, setShowRoutePanel] = useState(true);
  const [fromLocation, setFromLocation] = useState("Красная площадь");
  const [toLocation, setToLocation] = useState("Парк Горького");
  const [transportMode, setTransportMode] = useState<RouteData["mode"]>("walking");
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([55.7558, 37.6173]);

  const transportModes = useMemo(() => [
    { id: "walking" as const, label: "Пешком", icon: Footprints },
    { id: "bike" as const, label: "Велосипед", icon: Bike },
    { id: "car" as const, label: "Авто", icon: Car },
  ], []);

  // Init map once
  useEffect(() => {
    setupLeafletIcons();
    if (containerRef.current && !mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: mapCenter as [number, number],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapRef.current);

      graphicsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    return () => {
      // Cleanup on unmount
      mapRef.current?.remove();
      mapRef.current = null;
      graphicsLayerRef.current = null;
    };
  }, []);

  // Update view when center changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(mapCenter as [number, number], 13);
    }
  }, [mapCenter]);

  // Draw route and places
  useEffect(() => {
    const map = mapRef.current;
    const layer = graphicsLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // Draw route polyline
    if (selectedRoute) {
      const polyline: LeafletPolyline = L.polyline(selectedRoute.coordinates, {
        color: getRouteColor(selectedRoute.mode),
        weight: 4,
        opacity: 0.85,
      });
      polyline.addTo(layer);

      // Start marker
      const start = selectedRoute.coordinates[0];
      const end = selectedRoute.coordinates[selectedRoute.coordinates.length - 1];

      const startMarker: LeafletMarker = L.marker(start).bindPopup("<b>🚩 Начало маршрута</b>");
      const endMarker: LeafletMarker = L.marker(end).bindPopup("<b>🎯 Конец маршрута</b>");
      startMarker.addTo(layer);
      endMarker.addTo(layer);

      // Fit bounds
      const bounds = L.latLngBounds(selectedRoute.coordinates);
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    // Place markers
    mockPlaces.forEach((place) => {
      L.marker(place.coordinates)
        .bindPopup(`<div style="font-weight:600;display:flex;align-items:center;gap:8px;font-size:14px;">${place.icon} ${place.name}</div><div style="margin-top:6px;color:#6b7280;font-size:12px;">${place.description}</div>`)
        .addTo(layer);
    });
  }, [selectedRoute]);

  const handleRouteSelect = (route: RouteData) => {
    setSelectedRoute(route);
    setTransportMode(route.mode);
    toast.success(`Маршрут "${route.name}" выбран`);
  };

  const handleRebuildRoute = () => {
    toast.info("Перестраиваем маршрут...", { description: "Учитываем новые параметры" });
    setTimeout(() => {
      toast.success("Маршрут обновлен!", { description: "Найдено новое оптимальное решение" });
      // Имитация: меняем центр чуть-чуть
      setMapCenter(([55.7558 + Math.random() * 0.01, 37.6173 + Math.random() * 0.01]));
    }, 1000);
  };

  const getModeIcon = (mode: RouteData["mode"]) => {
    const found = transportModes.find((m) => m.id === mode);
    return found ? found.icon : Footprints;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 relative">
        {/* Map Container */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Control Panel */}
        <div
          className={`absolute top-4 right-4 z-[1000] transition-all duration-300 ${
            showRoutePanel ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
          }`}
        >
          <Card className="w-[380px] max-h-[calc(100vh-120px)] shadow-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RouteIcon className="h-5 w-5 text-primary" />
                  Управление маршрутом
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowRoutePanel(false)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Location Inputs */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Откуда
                  </div>
                  <Input value={fromLocation} onChange={(e) => setFromLocation(e.target.value)} placeholder="Начальная точка" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    Куда
                  </div>
                  <Input value={toLocation} onChange={(e) => setToLocation(e.target.value)} placeholder="Конечная точка" />
                </div>
              </div>

              {/* Transport Mode */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Транспорт</div>
                <div className="grid grid-cols-3 gap-2">
                  {transportModes.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setTransportMode(mode.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all text-xs ${
                          transportMode === mode.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleRebuildRoute} className="w-full" size="sm">
                <Navigation className="h-4 w-4" />
                Перестроить маршрут
              </Button>

              <Separator />

              {/* Available Routes */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Доступные маршруты</div>
                <ScrollArea className="h-[280px] pr-3">
                  <div className="space-y-2">
                    {mockRoutes.map((route) => {
                      const ModeIcon = getModeIcon(route.mode);
                      return (
                        <button
                          key={route.id}
                          onClick={() => handleRouteSelect(route)}
                          className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                            selectedRoute?.id === route.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-secondary"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-sm">{route.name}</h4>
                            <Badge variant="outline" className="text-xs">
                              <ModeIcon className="h-3 w-3 mr-1" />
                              {route.mode === "walking" ? "Пешком" : route.mode === "bike" ? "Вело" : "Авто"}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {route.distance} км
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {route.duration} мин
                            </div>
                          </div>

                          {route.places.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {route.places.map((place) => (
                                <span key={place.id} className="text-lg" title={place.name}>
                                  {place.icon}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Selected Route Info */}
              {selectedRoute && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Места на маршруте</div>
                    {selectedRoute.places.length > 0 ? (
                      <div className="space-y-2">
                        {selectedRoute.places.map((place, index) => (
                          <div key={place.id} className="flex items-start gap-2 p-2 rounded-md bg-secondary/50">
                            <span className="text-lg">{place.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{place.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{place.description}</div>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {index + 1}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Прямой маршрут без остановок</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Toggle Button when panel is hidden */}
        {!showRoutePanel && (
          <Button onClick={() => setShowRoutePanel(true)} className="absolute top-4 right-4 z-[1000] shadow-lg" size="icon">
            <MapPin className="h-5 w-5" />
          </Button>
        )}

        {/* Legend */}
        <Card className="absolute bottom-4 left-4 z-[1000] shadow-lg">
          <CardContent className="p-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold mb-2">Легенда</div>
              {mockPlaces.slice(0, 3).map((place) => (
                <div key={place.id} className="flex items-center gap-2 text-xs">
                  <span>{place.icon}</span>
                  <span className="text-muted-foreground">
                    {place.type === "historical" ? "Исторические" : place.type === "park" ? "Парки" : "Рестораны"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MapPage;
