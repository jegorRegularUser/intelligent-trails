import { useState, useEffect, useCallback } from 'react';
import { getYandexMapsUrl } from '../config/yandex-api-keys';

export const useYandexAPI = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [ymaps, setYmaps] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadYandexAPI = useCallback(async () => {
    if (isLoaded || window.ymaps) {
      setIsLoaded(true);
      setYmaps(window.ymaps);
      setLoading(false);
      return;
    }

    // Проверяем, не загружен ли уже скрипт
    const existingScript = document.querySelector('script[src*="api-maps.yandex.ru"]') as HTMLScriptElement;
    if (existingScript) {
      existingScript.onerror = () => {
        setError('Ошибка загрузки Yandex Maps API');
        setLoading(false);
      };
      existingScript.onload = () => {
        setIsLoaded(true);
        setYmaps(window.ymaps);
        setLoading(false);
      };
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = getYandexMapsUrl();
      script.async = true;
      script.onload = () => {
        setLoading(false);
        if (window.ymaps) {
          setYmaps(window.ymaps);
          // Ждем полной готовности API
          window.ymaps.ready(() => {
            setIsLoaded(true);
            resolve();
          });
        } else {
          setError('Yandex Maps API не загружен');
          reject(new Error('Yandex Maps API not loaded'));
        }
      };
      script.onerror = () => {
        setError('Ошибка загрузки Yandex Maps API. Проверьте ключи API.');
        setLoading(false);
        reject(new Error('Failed to load Yandex Maps API'));
      };
      
      document.head.appendChild(script);
    });
  }, [isLoaded]);

  useEffect(() => {
    loadYandexAPI().catch((err) => {
      console.error('Yandex API load error:', err);
      setError(err.message);
    });

    return () => {
      // Не удаляем скрипт при размонтировании - API может использоваться другими компонентами
    };
  }, [loadYandexAPI]);

  return {
    ymaps,
    isLoaded: isLoaded && !!window.ymaps,
    error,
    loading,
    loadYandexAPI,
  };
};
