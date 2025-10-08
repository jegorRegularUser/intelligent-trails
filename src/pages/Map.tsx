// MapPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Navigation, MapPin, X, Route as RouteIcon, Clock, TrendingUp, Footprints, Bike, Car, Loader2, Sparkles, Play, Pause, Square, BarChart3 } from "lucide-react";
import Header from "@/components/Header";
import SystemStatus from "@/components/SystemStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useMapIntegration } from "@/hooks/useMapIntegration";
import { TransportMode } from "@/types/graph";
import { UserPreferences, RouteConstraints } from "@/types/routing";

const YANDEX_API_KEY = "7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193";

const MapPage = () => {
  // UI State
  const [showRoutePanel, setShowRoutePanel] = useState(true);
  const [fromLocation, setFromLocation] = useState("Москва, Красная площадь");
  const [toLocation, setToLocation] = useState("Москва, Парк Горького");
  const [selectedTransportModes, setSelectedTransportModes] = useState<TransportMode[]>([TransportMode.WALKING]);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [activeTab, setActiveTab] = useState("route");

  // User Preferences State
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    speed: 3,
    safety: 4,
    accessibility: 3,
    cost: 3,
    comfort: 3,
    environmental: 2,
    scenic: true,
    minimizeTransfers: true,
    avoidWalking: false,
    avoidCycling: false,
    avoidStairs: false,
    requireWheelchairAccessibility: false,
    preferredModes: [TransportMode.WALKING],
    avoidedModes: []
  });

  // Route Constraints State
  const [routeConstraints, setRouteConstraints] = useState<RouteConstraints>({
    maxDistance: 50000, // 50km
    maxDuration: 7200, // 2 hours
    maxTransfers: 3,
    maxWalkingDistance: 2000, // 2km
    maxCyclingDistance: 15000, // 15km
    maxCost: 500,
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false,
    avoidUnpavedRoads: false,
    requireBikeLane: false,
    requireSidewalk: false
  });

  // Map Integration Hook
  const {
    mapState,
    visualizationOptions,
    isLoading,
    error,
    mapContainerRef,
    isInitialized,
    currentRoute,
    alternativeRoutes,
    calculateRoute,
    selectAlternativeRoute,
    clearRoute,
    updateVisualizationOptions,
    setInteractionHandlers,
    startRouteAnimation,
    pauseRouteAnimation,
    stopRouteAnimation,
    centerOnUserLocation,
    geocode
  } = useMapIntegration(YANDEX_API_KEY);

  const transportModes = useMemo(() => [
    { id: TransportMode.WALKING, label: "Пешком", icon: Footprints },
    { id: TransportMode.BICYCLE, label: "Велосипед", icon: Bike },
    { id: TransportMode.CAR, label: "Авто", icon: Car },
    { id: TransportMode.BUS, label: "Автобус", icon: Car },
    { id: TransportMode.METRO, label: "Метро", icon: TrendingUp },
    { id: TransportMode.TRAM, label: "Трамвай", icon: TrendingUp }
  ], []);

  const visualizationThemes = [
    { id: "default", label: "По умолчанию" },
    { id: "dark", label: "Темная" },
    { id: "accessibility", label: "Доступность" }
  ];

  const handleTransportModeToggle = (mode: TransportMode) => {
    setSelectedTransportModes(prev => {
      const isSelected = prev.includes(mode);
      if (isSelected) {
        return prev.filter(m => m !== mode);
      } else {
        return [...prev, mode];
      }
    });

    // Update user preferences
    setUserPreferences(prev => ({
      ...prev,
      preferredModes: selectedTransportModes.includes(mode) 
        ? prev.preferredModes.filter(m => m !== mode)
        : [...prev.preferredModes, mode]
    }));
  };

  // Build route with new system
  const buildRoute = async () => {
    if (!fromLocation || !toLocation) {
      toast.error("Заполните точки маршрута");
      return;
    }

    try {
      // Geocode addresses
      const fromCoords = await geocode(fromLocation);
      const toCoords = await geocode(toLocation);

      if (!fromCoords || !toCoords) {
        toast.error("Не удалось найти указанные адреса");
        return;
      }

      // Prepare route request
      const routeRequest = {
        origin: { latitude: fromCoords[0], longitude: fromCoords[1] },
        destination: { latitude: toCoords[0], longitude: toCoords[1] },
        preferences: userPreferences,
        constraints: routeConstraints,
        options: {
          algorithm: isAdvancedMode ? 'multicriteria' as const : 'dijkstra' as const,
          optimizeFor: isAdvancedMode ? ['time', 'cost', 'accessibility'] as any : ['time'] as any,
          returnAlternatives: isAdvancedMode,
          maxAlternatives: 3,
          useRealTimeData: true,
          visualize: true
        }
      };

      // Calculate route
      const result = await calculateRoute(routeRequest);

      if (result.success && result.route) {
        const routeType = isAdvancedMode ? "умный маршрут" : "маршрут";
        toast.success(`${routeType.charAt(0).toUpperCase() + routeType.slice(1)} построен!`, {
          description: `Дистанция: ${(result.route.totalDistance / 1000).toFixed(1)}км, Время: ${Math.round(result.route.totalDuration / 60)}мин`
        });

        if (result.alternatives.length > 0) {
          toast.success(`Найдено ${result.alternatives.length + 1} вариантов маршрута`);
        }
      } else {
        toast.error(result.error || "Не удалось построить маршрут");
      }
    } catch (error) {
      console.error('Route building error:', error);
      toast.error("Ошибка при построении маршрута");
    }
  };

  // Update preferences
  const updatePreference = (key: keyof UserPreferences, value: any) => {
    setUserPreferences(prev => ({ ...prev, [key]: value }));
  };

  // Update constraints
  const updateConstraint = (key: keyof RouteConstraints, value: any) => {
    setRouteConstraints(prev => ({ ...prev, [key]: value }));
  };

  // Handle alternative route selection
  const handleAlternativeRouteSelect = async (routeId: string) => {
    try {
      await selectAlternativeRoute(routeId);
      toast.success("Маршрут изменен");
    } catch (error) {
      toast.error("Ошибка при смене маршрута");
    }
  };

  // Set up interaction handlers
  useEffect(() => {
    setInteractionHandlers({
      onRouteClick: (route) => {
        console.log('Route clicked:', route);
        setActiveTab('stats');
      },
      onSegmentClick: (segment) => {
        toast.info(`Сегмент: ${segment.mode} - ${Math.round(segment.distance)}м`, {
          description: `Время: ${Math.round(segment.duration / 60)}мин, Стоимость: ${segment.cost}₽`
        });
      },
      onPOIClick: (poi) => {
        toast.info(`POI: ${poi.name || 'Точка интереса'}`, {
          description: poi.properties?.address || 'Место на маршруте'
        });
      },
      onMapClick: (coordinate) => {
        console.log('Map clicked at:', coordinate);
      }
    });
  }, [setInteractionHandlers]);

  // Show success message when route is calculated
  useEffect(() => {
    if (currentRoute && !isLoading) {
      setActiveTab('stats');
    }
  }, [currentRoute, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Инициализация системы маршрутизации...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">Ошибка системы: {error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Перезагрузить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 relative">
        <div 
          ref={mapContainerRef} 
          className="absolute inset-0 w-full h-full"
        />

        {/* Статус системы */}
        <div className="absolute bottom-4 left-4 z-[1000] w-80">
          <SystemStatus
            isInitialized={isInitialized}
            isLoading={isLoading}
            error={error}
            hasRoute={!!currentRoute}
            alternativesCount={alternativeRoutes.length}
          />
        </div>

        {/* Панель управления */}
        <div
          className={`absolute top-4 right-4 z-[1000] transition-all duration-300 ${
            showRoutePanel ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
          }`}
        >
          <Card className="w-[500px] max-h-[calc(100vh-80px)] min-h-[60vh] shadow-2xl flex-shrink-0 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RouteIcon className="h-5 w-5 text-primary" />
                  Умная маршрутизация
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => centerOnUserLocation()}
                    className="h-8 w-8"
                    title="Мое местоположение"
                  >
                    <Navigation className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowRoutePanel(false)} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <ScrollArea className="max-h-[calc(85vh-160px)]">
              <CardContent className="space-y-4 pr-3 w-full max-w-[470px]">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="route">Маршрут</TabsTrigger>
                    <TabsTrigger value="preferences">Настройки</TabsTrigger>
                    <TabsTrigger value="alternatives">Варианты</TabsTrigger>
                    <TabsTrigger value="stats">Статистика</TabsTrigger>
                  </TabsList>

                  <TabsContent value="route" className="space-y-4 mt-4">
                    <div className="space-y-3 w-full">
                      <div className="space-y-1.5 w-full">
                        <div className="flex items-center gap-2 text-sm font-medium truncate">
                          <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="truncate">Откуда</span>
                        </div>
                        <Input 
                          value={fromLocation} 
                          onChange={(e) => setFromLocation(e.target.value)} 
                          placeholder="Начальная точка" 
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-1.5 w-full">
                        <div className="flex items-center gap-2 text-sm font-medium truncate">
                          <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="truncate">Куда</span>
                        </div>
                        <Input 
                          value={toLocation} 
                          onChange={(e) => setToLocation(e.target.value)} 
                          placeholder="Конечная точка" 
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Режим маршрутизации</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setIsAdvancedMode(false)}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all text-xs ${
                            !isAdvancedMode ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Navigation className="h-4 w-4" />
                          Быстрый
                        </button>
                        <button
                          onClick={() => setIsAdvancedMode(true)}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all text-xs ${
                            isAdvancedMode ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Sparkles className="h-4 w-4" />
                          Мультимодальный
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Виды транспорта</div>
                      <div className="grid grid-cols-2 gap-2">
                        {transportModes.map((mode) => {
                          const Icon = mode.icon;
                          const isSelected = selectedTransportModes.includes(mode.id);
                          return (
                            <button
                              key={mode.id}
                              onClick={() => handleTransportModeToggle(mode.id)}
                              className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all text-xs ${
                                isSelected
                                  ? "border-primary bg-primary/5 text-primary" 
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                              <span>{mode.label}</span>
                              {isSelected && <div className="w-2 h-2 bg-primary rounded-full ml-auto" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Button 
                      onClick={buildRoute} 
                      className="w-full" 
                      size="sm"
                      disabled={isLoading || !isInitialized}
                      variant={isAdvancedMode ? "default" : "outline"}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isAdvancedMode ? (
                        <Sparkles className="h-4 w-4" />
                      ) : (
                        <Navigation className="h-4 w-4" />
                      )}
                      <span className="truncate">
                        {isLoading ? "Расчет маршрута..." : 
                         isAdvancedMode ? "Построить мультимодальный маршрут" : "Построить маршрут"}
                      </span>
                    </Button>
                  </TabsContent>

                  <TabsContent value="preferences" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Приоритеты маршрута</div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs">Скорость</span>
                            <Slider
                              value={[userPreferences.speed]}
                              onValueChange={([value]) => updatePreference('speed', value)}
                              max={5}
                              min={1}
                              step={1}
                              className="w-24"
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs">Безопасность</span>
                            <Slider
                              value={[userPreferences.safety]}
                              onValueChange={([value]) => updatePreference('safety', value)}
                              max={5}
                              min={1}
                              step={1}
                              className="w-24"
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs">Доступность</span>
                            <Slider
                              value={[userPreferences.accessibility]}
                              onValueChange={([value]) => updatePreference('accessibility', value)}
                              max={5}
                              min={1}
                              step={1}
                              className="w-24"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Опции</div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="scenic"
                              checked={userPreferences.scenic}
                              onCheckedChange={(checked) => updatePreference('scenic', checked)}
                            />
                            <label htmlFor="scenic" className="text-xs cursor-pointer">Живописный маршрут</label>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="minimizeTransfers"
                              checked={userPreferences.minimizeTransfers}
                              onCheckedChange={(checked) => updatePreference('minimizeTransfers', checked)}
                            />
                            <label htmlFor="minimizeTransfers" className="text-xs cursor-pointer">Минимум пересадок</label>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="wheelchair"
                              checked={userPreferences.requireWheelchairAccessibility}
                              onCheckedChange={(checked) => updatePreference('requireWheelchairAccessibility', checked)}
                            />
                            <label htmlFor="wheelchair" className="text-xs cursor-pointer">Доступ для колясок</label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="alternatives" className="space-y-4 mt-4">
                    {alternativeRoutes.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Альтернативные маршруты</div>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2 pr-3">
                            {alternativeRoutes.map((route, index) => (
                              <div
                                key={route.id}
                                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                  currentRoute?.id === route.id
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                                onClick={() => handleAlternativeRouteSelect(route.id)}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm truncate">Маршрут {index + 1}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {route.segments.map(s => s.mode).join(' → ')}
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="ml-2 flex-shrink-0">
                                    {Math.round(route.accessibilityScore * 100)}/100
                                  </Badge>
                                </div>
                                
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>{(route.totalDistance / 1000).toFixed(1)} км</span>
                                  <span>{Math.round(route.totalDuration / 60)} мин</span>
                                  <span>{route.totalTransfers} перес.</span>
                                  <span>{route.totalCost}₽</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <RouteIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Постройте маршрут для получения альтернатив</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="stats" className="space-y-4 mt-4">
                    {currentRoute ? (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <div className="text-sm font-medium">Основная информация</div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-muted-foreground" />
                              <span>{(currentRoute.totalDistance / 1000).toFixed(1)} км</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>{Math.round(currentRoute.totalDuration / 60)} мин</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-medium">Управление визуализацией</div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={startRouteAnimation}>
                              <Play className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={pauseRouteAnimation}>
                              <Pause className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={stopRouteAnimation}>
                              <Square className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={clearRoute}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Постройте маршрут для просмотра статистики</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </ScrollArea>
          </Card>
        </div>

        {!showRoutePanel && (
          <Button onClick={() => setShowRoutePanel(true)} className="absolute top-4 right-4 z-[1000] shadow-lg" size="icon">
            <MapPin className="h-5 w-5" />
          </Button>
        )}

        {/* Кнопка очистки маршрута */}
        {currentRoute && (
          <Button 
            onClick={clearRoute} 
            className="absolute bottom-4 right-4 z-[1000] shadow-lg" 
            variant="outline"
            size="sm"
          >
            <X className="h-4 w-4 mr-2" />
            Очистить маршрут
          </Button>
        )}
      </div>
    </div>
  );
};

export default MapPage;