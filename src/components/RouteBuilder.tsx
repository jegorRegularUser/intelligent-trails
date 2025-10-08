// RouteBuilder.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, Car, Bike, Footprints, Search, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useYandexMaps } from "@/hooks/useYandexMaps";

const YANDEX_API_KEY = "7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193";

const RouteBuilder = () => {
  const navigate = useNavigate();
  const { geocode, calculateRoute, loading } = useYandexMaps(YANDEX_API_KEY);
  
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [travelTime, setTravelTime] = useState("");
  const [transportMode, setTransportMode] = useState<string>("walking");
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const placeTypes = [
    { id: "historical", label: "Исторические места", icon: "🏛️" },
    { id: "cultural", label: "Культурные центры", icon: "🎭" },
    { id: "parks", label: "Парки", icon: "🌳" },
    { id: "food", label: "Кафе и рестораны", icon: "🍽️" },
    { id: "shopping", label: "Магазины", icon: "🛍️" },
    { id: "viewpoints", label: "Смотровые площадки", icon: "🌅" },
  ];

  const transportModes = [
    { id: "walking", label: "Пешком", icon: Footprints },
    { id: "bike", label: "Велосипед", icon: Bike },
    { id: "car", label: "Автомобиль", icon: Car },
  ];

  const handlePlaceToggle = (placeId: string) => {
    setSelectedPlaces((prev) =>
      prev.includes(placeId)
        ? prev.filter((id) => id !== placeId)
        : [...prev, placeId]
    );
  };

  const handleBuildRoute = async (isSmart: boolean = false) => {
    if (!fromLocation || !toLocation) {
      toast.error("Заполните точки маршрута");
      return;
    }

    setIsBuilding(true);

    try {
      // Геокодируем адреса
      const fromCoords = await geocode(fromLocation);
      const toCoords = await geocode(toLocation);

      if (!fromCoords || !toCoords) {
        toast.error("Не удалось найти указанные адреса");
        return;
      }

      // Сохраняем данные в localStorage для передачи на карту
      const routeData = {
        from: fromLocation,
        to: toLocation,
        fromCoords,
        toCoords,
        mode: transportMode,
        isSmart,
        selectedPlaces: isSmart ? selectedPlaces : [],
        maxTime: travelTime ? parseInt(travelTime) : null
      };

      localStorage.setItem('routeData', JSON.stringify(routeData));

      toast.success("Маршрут построен!", {
        description: "Переход на карту",
      });

      // Переход на страницу с картой
      setTimeout(() => {
        navigate("/map");
      }, 800);

    } catch (error) {
      toast.error("Ошибка при построении маршрута");
    } finally {
      setIsBuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Загружаем карту...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 min-h-screen py-6">
      <Card className="shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Построение маршрута
          </CardTitle>
          <CardDescription>
            Укажите точки отправления и назначения для построения маршрута
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from">Откуда</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="from"
                placeholder="Введите адрес или название места"
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to">Куда</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-accent" />
              <Input
                id="to"
                placeholder="Введите адрес или название места"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Button 
            onClick={() => handleBuildRoute(false)} 
            className="w-full" 
            size="lg"
            disabled={isBuilding}
          >
            {isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isBuilding ? "Строим маршрут..." : "Построить простой маршрут"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-2 border-primary/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-accent" />
            Умный маршрут
          </CardTitle>
          <CardDescription>
            Настройте параметры для построения оптимального маршрута с посещением интересных мест
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="time" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Примерное время в пути (минуты)
            </Label>
            <Input
              id="time"
              type="number"
              placeholder="60"
              value={travelTime}
              onChange={(e) => setTravelTime(e.target.value)}
              min="1"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-base">Способ передвижения</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {transportModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setTransportMode(mode.id)}
                    className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      transportMode === mode.id
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:border-primary/50 hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base">Места для посещения</Label>
            <div className="max-h-48 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-2">
                {placeTypes.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-secondary transition-colors"
                  >
                    <Checkbox
                      id={place.id}
                      checked={selectedPlaces.includes(place.id)}
                      onCheckedChange={() => handlePlaceToggle(place.id)}
                    />
                    <label
                      htmlFor={place.id}
                      className="flex items-center gap-2 flex-1 cursor-pointer text-sm font-medium"
                    >
                      <span className="text-lg">{place.icon}</span>
                      {place.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button 
            onClick={() => handleBuildRoute(true)} 
            className="w-full mt-6" 
            size="lg"
            variant="accent"
            disabled={isBuilding}
          >
            {isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isBuilding ? "Строим умный маршрут..." : "Построить умный маршрут"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RouteBuilder;