// hooks/use-route-builder.ts (обновленный хук для работы с маршрутами)
import { useState, useCallback } from 'react';
import { RouteData, RoutePoint, RouteOptions } from '@/types';
import { useYandexMap } from './use-yandex-map';
import { useToast } from '@/components/ui/use-toast';

export const useRouteBuilder = () => {
  const [routeData, setRouteData] = useState<RouteData>({
    points: [
      { 
        address: { title: '', fullAddress: '' }, 
        coordinates: { lat: 0, lng: 0 } 
      },
      { 
        address: { title: '', fullAddress: '' }, 
        coordinates: { lat: 0, lng: 0 } 
      },
    ],
    options: {
      mode: 'driving',
      avoidTraffic: false,
    },
  });

  const { geocodeAddress } = useYandexMap();
  const { toast } = useToast();

  const updateStartPoint = useCallback(async (
    title: string, 
    fullAddress?: string, 
    coordinates?: { lat: number; lng: number }
  ) => {
    let coords: { lat: number; lng: number };

    if (coordinates && coordinates.lat !== 0) {
      coords = coordinates;
    } else if (title) {
      coords = await geocodeAddress(title) || { lat: 0, lng: 0 };
    } else {
      coords = { lat: 0, lng: 0 };
    }

    const newPoint: RoutePoint = {
      address: {
        title,
        fullAddress: fullAddress || title,
      },
      coordinates: coords,
    };

    setRouteData(prev => ({
      ...prev,
      points: [newPoint, prev.points[1]],
    }));

    return newPoint;
  }, [geocodeAddress]);

  const updateEndPoint = useCallback(async (
    title: string, 
    fullAddress?: string, 
    coordinates?: { lat: number; lng: number }
  ) => {
    let coords: { lat: number; lng: number };

    if (coordinates && coordinates.lat !== 0) {
      coords = coordinates;
    } else if (title) {
      coords = await geocodeAddress(title) || { lat: 0, lng: 0 };
    } else {
      coords = { lat: 0, lng: 0 };
    }

    const newPoint: RoutePoint = {
      address: {
        title,
        fullAddress: fullAddress || title,
      },
      coordinates: coords,
    };

    setRouteData(prev => ({
      ...prev,
      points: [prev.points[0], newPoint],
    }));

    return newPoint;
  }, [geocodeAddress]);

  const updateRouteOptions = useCallback((options: Partial<RouteOptions>) => {
    setRouteData(prev => ({
      ...prev,
      options: { ...prev.options, ...options },
    }));
  }, []);

  const clearCurrentRoute = useCallback(() => {
    setRouteData({
      points: [
        { address: { title: '', fullAddress: '' }, coordinates: { lat: 0, lng: 0 } },
        { address: { title: '', fullAddress: '' }, coordinates: { lat: 0, lng: 0 } },
      ],
      options: {
        mode: 'driving',
        avoidTraffic: false,
      },
      distance: undefined,
      duration: undefined,
      path: undefined,
    });
  }, []);

  return {
    routeData,
    updateStartPoint,
    updateEndPoint,
    updateRouteOptions,
    clearCurrentRoute,
  };
};
