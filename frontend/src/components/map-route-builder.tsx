import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Navigation,
  Trash2,
  Car,
  Footprints,
  Settings,
  Bus,
  MapPin,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronUp,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import AddressInput from "./ui/address-input";
import { useYandexMap } from "../hooks/use-yandex-map";
import { useRouteBuilder } from "../hooks/use-route-builder";
import { RouteOptions, Address, RouteData } from "../types";
import MapSidebar from "./map-sidebar"; // Импорт боковой панели
import { cn } from "@/lib/utils";

const MapRouteBuilder: React.FC = () => {
  const { routeData, updateStartPoint, updateEndPoint, clearCurrentRoute, updateRouteOptions } = useRouteBuilder();
  const { isReady, isRouteLoading, error, buildRoute, clearRoute, mapRef } = useYandexMap();
  const [mode, setMode] = useState<'driving' | 'walking' | 'transit'>('driving');
  const [avoidTraffic, setAvoidTraffic] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); // true по умолчанию для десктопа
  const [isMobile] = useState(window.innerWidth < 1024); // Изменили breakpoint на 1024
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    updateRouteOptions({ mode, avoidTraffic });
  }, [mode, avoidTraffic, updateRouteOptions]);

  // Функция toggle sidebar с правильной анимацией
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleModeChange = useCallback((newMode: 'driving' | 'walking' | 'transit') => {
    setMode(newMode);
  }, []);

  const handleTrafficChange = useCallback((checked: boolean) => {
    setAvoidTraffic(checked);
  }, []);

  const handleBuildRoute = useCallback(async () => {
    const updatedRouteData: RouteData = {
      ...routeData,
      options: { mode, avoidTraffic },
    };
    await buildRoute(updatedRouteData);
  }, [routeData, mode, avoidTraffic, buildRoute]);

  const handleStartPointChange = useCallback((value: string, address?: Address) => {
    updateStartPoint(value, address?.fullAddress, address?.coordinates);
  }, [updateStartPoint]);

  const handleEndPointChange = useCallback((value: string, address?: Address) => {
    updateEndPoint(value, address?.fullAddress, address?.coordinates);
  }, [updateEndPoint]);

  const canBuildRoute = !!routeData.points[0].address.title && !!routeData.points[1].address.title && isReady;
  const startAddress = routeData.points[0].address;
  const endAddress = routeData.points[1].address;
  const API_KEY = '7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193';

  // Вычисляем ширину sidebar для анимации
  const sidebarWidth = sidebarOpen ? 'w-96' : 'w-0';
  const sidebarContentClasses = sidebarOpen ? 'block opacity-100' : 'hidden opacity-0';

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row overflow-hidden bg-gray-50">
      {/* Карта - основная область */}
      <div className={`relative flex-1 ${isMobile ? 'order-1' : 'lg:order-2'}`}>
        {/* Кнопка toggle sidebar */}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur-sm border-gray-200 hover:bg-white"
          onClick={toggleSidebar}
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <Settings className="w-4 h-4" />
          )}
        </Button>

        {/* Карта */}
        <div ref={mapRef} className="w-full h-full relative">
          {!isReady ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 backdrop-blur-sm">
              {error ? (
                <div className="text-center p-6 bg-white rounded-xl shadow-lg max-w-sm">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Ошибка загрузки карты</h3>
                  <p className="text-gray-600 mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()} className="w-full" variant="outline">
                    Перезагрузить страницу
                  </Button>
                </div>
              ) : (
                <div className="text-center p-6 bg-white rounded-xl shadow-lg">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                  <p className="text-gray-600">Загрузка карты Yandex...</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Информация о маршруте (overlay) */}
        {routeData.distance && (
          <div className="absolute top-4 left-4 right-4 max-w-md bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-lg border z-10 mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Маршрут готов
              </h3>
              <Badge variant="default" className="bg-green-100 text-green-800">
                {mode === 'driving' ? 'Авто' : mode === 'walking' ? 'Пешком' : 'Транспорт'}
              </Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                <span className="text-gray-600">Расстояние</span>
                <span className="font-semibold text-gray-900">{routeData.distance.toFixed(1)} км</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                <span className="text-gray-600">Время в пути</span>
                <span className="font-semibold text-gray-900">{Math.round(routeData.duration)} мин</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Боковая панель - улучшенная с правильным скроллом и анимацией */}
      <div 
        ref={sidebarRef}
        className={cn(
          "lg:flex lg:flex-col transition-all duration-300 ease-in-out overflow-hidden bg-white border-r border-gray-200 shadow-lg",
          sidebarWidth,
          isMobile 
            ? sidebarOpen 
              ? "fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col" 
              : "hidden" 
            : "relative"
        )}
      >
        {/* Header панели - всегда виден */}
        <div className="flex-shrink-0 border-b border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-blue-600" />
              Построение маршрута
            </h2>
            {!isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className="h-8 w-8 p-0 hover:bg-gray-100"
              >
                {sidebarOpen ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Контент панели - скроллируемый */}
        <div 
          className={cn(
            "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
            sidebarContentClasses,
            isMobile ? "flex-1 overflow-y-auto" : ""
          )}
          style={{ 
            transition: 'opacity 0.3s ease-in-out', 
            maxHeight: sidebarOpen ? 'calc(100vh - 80px)' : '0' 
          }}
        >
          <div className="p-4 space-y-6">
            {/* Поля ввода адресов */}
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Откуда</label>
                <AddressInput
                  value={startAddress.title}
                  onChange={handleStartPointChange}
                  placeholder="Введите адрес отправления"
                  error={!startAddress.title && startAddress.title !== ''}
                  className="w-full"
                  coordinates={startAddress.coordinates}
                />
              </div>
              

              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Куда</label>
                <AddressInput
                  value={endAddress.title}
                  onChange={handleEndPointChange}
                  placeholder="Введите адрес назначения"
                  error={!endAddress.title && endAddress.title !== ''}
                  className="w-full"
                  coordinates={endAddress.coordinates}
                />
              </div>
            </div>

            {/* Настройки маршрута */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Настройки маршрута
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Тип маршрута</label>
                  <Select value={mode} onValueChange={(value: any) => handleModeChange(value as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driving">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4" />
                          <span>Автомобиль</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="walking">
                        <div className="flex items-center gap-2">
                          <Footprints className="w-4 h-4" />
                          <span>Пешком</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="transit">
                        <div className="flex items-center gap-2">
                          <Bus className="w-4 h-4" />
                          <span>Общественный транспорт</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border">
                    <Checkbox
                      id="avoid-traffic"
                      checked={avoidTraffic}
                      onCheckedChange={handleTrafficChange}
                    />
                    <label htmlFor="avoid-traffic" className="text-sm text-gray-700 cursor-pointer flex-1">
                      Избегать пробок
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Кнопки действий */}
            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={handleBuildRoute}
                disabled={!canBuildRoute || isRouteLoading}
                className="flex-1 size-lg"
                size="lg"
              >
                {isRouteLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Строим маршрут...
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4 mr-2" />
                    Построить маршрут
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={clearCurrentRoute}
                disabled={isRouteLoading}
                className="size-lg"
                size="lg"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Очистить маршрут
              </Button>
            </div>

            {/* Дополнительная информация */}
            {!canBuildRoute && (startAddress.title || endAddress.title) && (
              <div className="text-center py-4">
                <AlertCircle className="w-5 h-5 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600">
                  {startAddress.title && !endAddress.title 
                    ? 'Введите адрес назначения для построения маршрута' 
                    : !startAddress.title && endAddress.title 
                    ? 'Введите адрес отправления для построения маршрута'
                    : 'Введите адреса для построения маршрута'
                  }
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer для мобильных */}
        {isMobile && (
          <div className="flex-shrink-0 border-t border-gray-200 p-3 bg-white lg:hidden">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setSidebarOpen(false)}
            >
              <ChevronUp className="w-4 h-4 mr-2 rotate-180" />
              Скрыть панель
            </Button>
          </div>
        )}
      </div>

      {/* Мобильный overlay для закрытия */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};
export default MapRouteBuilder