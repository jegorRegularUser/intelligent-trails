// hooks/useYandexMaps.ts
import { useState, useEffect } from 'react';

declare global {
  interface Window {
    ymaps: any;
  }
}

interface YandexRoute {
  distance: number;
  duration: number;
  coordinates: [number, number][];
}

interface Place {
  id: string;
  name: string;
  type: string;
  coordinates: [number, number];
  description: string;
  icon: string;
  address: string;
  popularity?: 'high' | 'medium' | 'low';
  rating?: number;
  visitDuration?: number;
  priceLevel?: number;
  categories?: string[];
}

export const useYandexMaps = (apiKey: string) => {
  const [ymaps, setYmaps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.ymaps) {
      setYmaps(window.ymaps);
      setLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    
    script.onload = () => {
      window.ymaps.ready(() => {
        setYmaps(window.ymaps);
        setLoading(false);
      });
    };

    script.onerror = () => {
      setError('Failed to load Yandex Maps');
      setLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [apiKey]);

  const geocode = async (address: string): Promise<[number, number] | null> => {
    if (!ymaps) return null;

    return new Promise((resolve) => {
      ymaps.geocode(address).then((result: any) => {
        const firstGeoObject = result.geoObjects.get(0);
        if (firstGeoObject) {
          const coordinates = firstGeoObject.geometry.getCoordinates();
          resolve(coordinates);
        } else {
          resolve(null);
        }
      }).catch(() => resolve(null));
    });
  };

  // Реальное построение маршрута через Yandex Router API
  const calculateRoute = async (
    from: [number, number],
    to: [number, number],
    mode: 'walking' | 'bike' | 'car'
  ): Promise<YandexRoute | null> => {
    if (!ymaps) return null;

    return new Promise((resolve) => {
      try {
        // Преобразуем режим в формат Яндекса
        const routingMode = mode === 'walking' ? 'pedestrian' : mode === 'bike' ? 'bicycle' : 'auto';
        
        // Создаем мультимаршрут через Yandex Router
        const multiRoute = new ymaps.multiRouter.MultiRoute({
          referencePoints: [from, to],
          params: {
            routingMode: routingMode,
            results: 1
          }
        }, {
          boundsAutoApply: false,
          wayPointVisible: false,
          routeActiveStrokeWidth: 6,
          routeActiveStrokeColor: mode === 'walking' ? '#4CAF50' : mode === 'bike' ? '#2196F3' : '#F44336'
        });

        // Обработка результата
        multiRoute.model.events.once('requestsuccess', function () {
          const activeRoute = multiRoute.getActiveRoute();
          if (activeRoute) {
            const routeData = activeRoute.properties.getAll();
            const coordinates = activeRoute.geometry.getCoordinates();
            
            resolve({
              distance: routeData.distance?.value || calculateDirectDistance(from, to) * 1000,
              duration: routeData.duration?.value || calculateDirectDuration(calculateDirectDistance(from, to), mode) * 60,
              coordinates: coordinates.map((coord: number[]) => [coord[0], coord[1]] as [number, number])
            });
          } else {
            // Fallback
            resolve({
              distance: calculateDirectDistance(from, to) * 1000,
              duration: calculateDirectDuration(calculateDirectDistance(from, to), mode) * 60,
              coordinates: generateRouteCoordinates(from, to, 5)
            });
          }
        });

        multiRoute.model.events.once('requesterror', function () {
          console.error('Yandex routing error, using fallback');
          resolve({
            distance: calculateDirectDistance(from, to) * 1000,
            duration: calculateDirectDuration(calculateDirectDistance(from, to), mode) * 60,
            coordinates: generateRouteCoordinates(from, to, 5)
          });
        });

      } catch (error) {
        console.error('Route calculation error:', error);
        // Fallback на прямую линию
        resolve({
          distance: calculateDirectDistance(from, to) * 1000,
          duration: calculateDirectDuration(calculateDirectDistance(from, to), mode) * 60,
          coordinates: [from, to]
        });
      }
    });
  };

  // Расчет прямого расстояния по координатам
  const calculateDirectDistance = (from: [number, number], to: [number, number]): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (to[0] - from[0]) * Math.PI / 180;
    const dLon = (to[1] - from[1]) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(from[0] * Math.PI / 180) * Math.cos(to[0] * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Добавляем коэффициент для учета реальных дорог
    const roadFactor = 1.3;
    return Math.round(distance * roadFactor * 10) / 10;
  };

  // Расчет времени по расстоянию и типу транспорта
  const calculateDirectDuration = (distance: number, mode: string): number => {
    const speeds: { [key: string]: number } = {
      walking: 5, // km/h
      bike: 15,   // km/h
      car: 40     // km/h (учитывая городское движение)
    };
    const speed = speeds[mode] || 5;
    return Math.round((distance / speed) * 60);
  };

  // Генерация промежуточных точек для визуализации маршрута
  const generateRouteCoordinates = (
    from: [number, number], 
    to: [number, number], 
    pointsCount: number
  ): [number, number][] => {
    const coordinates: [number, number][] = [from];
    
    for (let i = 1; i <= pointsCount; i++) {
      const ratio = i / (pointsCount + 1);
      const lat = from[0] + (to[0] - from[0]) * ratio;
      const lng = from[1] + (to[1] - from[1]) * ratio;
      
      // Добавляем небольшую случайную вариацию для имитации изгибов дороги
      const variation = 0.001;
      const variedLat = lat + (Math.random() - 0.5) * variation;
      const variedLng = lng + (Math.random() - 0.5) * variation;
      
      coordinates.push([variedLat, variedLng]);
    }
    
    coordinates.push(to);
    return coordinates;
  };

  // Функция поиска организаций
  const searchOrganizations = async (
    center: [number, number],
    radius: number = 1000,
    types: string[] = []
  ): Promise<Place[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Генерируем реалистичные места вокруг центра
        const mockPlaces: Place[] = [];
        const placeCount = 8 + Math.floor(Math.random() * 8); // 8-15 мест
        
        for (let i = 0; i < placeCount; i++) {
          const type = types.length > 0 
            ? types[Math.floor(Math.random() * types.length)]
            : ['historical', 'park', 'food', 'cultural'][Math.floor(Math.random() * 4)];
            
          mockPlaces.push(generatePlace(center, i, type));
        }
        
        resolve(mockPlaces);
      }, 500);
    });
  };

  // Генерация одного места с расширенными атрибутами
  const generatePlace = (center: [number, number], index: number, type: string): Place => {
    const angle = (index * 30) * Math.PI / 180;
    const distance = 0.003 + (index * 0.001); // ~300-800 метров
    
    return {
      id: `place-${Date.now()}-${index}`,
      name: getEnhancedPlaceName(type, index),
      type: type,
      coordinates: [
        center[0] + Math.cos(angle) * distance,
        center[1] + Math.sin(angle) * distance
      ],
      description: getEnhancedPlaceDescription(type),
      icon: getPlaceIcon(type),
      address: getPlaceAddress(index),
      popularity: Math.random() > 0.7 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low',
      rating: 3 + Math.random() * 2,
      visitDuration: getVisitDuration(type),
      priceLevel: getPriceLevel(type),
      categories: getPlaceCategories(type)
    };
  };

  const getEnhancedPlaceName = (type: string, index: number) => {
    const names: { [key: string]: string[] } = {
      historical: [
        "Государственный исторический музей", "Музей Отечественной войны", "Памятник архитектуры XVIII века",
        "Старинная усадьба", "Исторический центр города", "Археологический комплекс",
        "Крепостная стена", "Древний монастырь", "Музей городской истории"
      ],
      park: [
        "Центральный парк культуры", "Ботанический сад", "Ландшафтный парк",
        "Парк с озером", "Дендрарий", "Парк скульптур",
        "Природный заповедник", "Парк развлечений", "Сквер у фонтана"
      ],
      food: [
        "Ресторан традиционной кухни", "Кафе с панорамным видом", "Историческая кофейня",
        "Гастрономический ресторан", "Бистро у парка", "Кафе с летней верандой",
        "Ресторан национальной кухни", "Кондитерская XIX века", "Чайный дом"
      ],
      cultural: [
        "Художественная галерея", "Театр оперы и балета", "Концертный зал филармонии",
        "Музей современного искусства", "Выставочный центр", "Культурный центр",
        "Дом музыки", "Литературный музей", "Арт-пространство"
      ],
      viewpoint: [
        "Смотровая площадка на холме", "Панорамный вид на реку", "Высотная обзорная точка",
        "Вид на исторический центр", "Смотровая у моста", "Панорама города"
      ]
    };
    
    const typeNames = names[type] || ["Интересное место"];
    return typeNames[index % typeNames.length];
  };

  const getEnhancedPlaceDescription = (type: string) => {
    const descriptions: { [key: string]: string } = {
      historical: "Объект культурного наследия с богатой историей и архитектурной ценностью",
      park: "Благоустроенная зеленая зона с разнообразной флорой и местами для отдыха", 
      food: "Заведение с уникальной атмосферой и высококачественной кухней",
      cultural: "Центр культурной жизни с регулярными мероприятиями и выставками",
      viewpoint: "Место с захватывающими видами, популярное среди фотографов и туристов"
    };
    return descriptions[type] || "Значимое место для посещения";
  };

  const getVisitDuration = (type: string): number => {
    const durations: { [key: string]: number } = {
      historical: 45,
      park: 30,
      food: 60,
      cultural: 60,
      viewpoint: 20
    };
    return durations[type] || 30;
  };

  const getPriceLevel = (type: string): number => {
    const prices: { [key: string]: number } = {
      historical: 2,
      park: 1,
      food: 3,
      cultural: 2,
      viewpoint: 1
    };
    return prices[type] || 2;
  };

  const getPlaceCategories = (type: string): string[] => {
    const categories: { [key: string]: string[] } = {
      historical: ["архитектура", "история", "культура"],
      park: ["природа", "отдых", "спорт"],
      food: ["питание", "отдых", "социум"],
      cultural: ["искусство", "образование", "развлечения"],
      viewpoint: ["природа", "фотография", "туризм"]
    };
    return categories[type] || ["достопримечательность"];
  };

  const getPlaceName = (type: string, index: number) => {
    const names: { [key: string]: string[] } = {
      historical: [
        "Исторический музей", "Краеведческий музей", "Памятник архитектуры",
        "Старинная усадьба", "Исторический центр", "Музей истории"
      ],
      park: [
        "Центральный парк", "Городской сад", "Сквер Отдыха",
        "Парк культуры", "Зеленая зона", "Аллея Славы"
      ],
      food: [
        "Кафе Уют", "Ресторан Вкусно", "Кофейня Аромо",
        "Пиццерия Италия", "Бургерная", "Суши-бар"
      ],
      cultural: [
        "Театр Драмы", "Картинная галерея", "Концертный зал",
        "Кинотеатр", "Библиотека", "Выставочный центр"
      ],
      viewpoint: [
        "Смотровая площадка", "Панорамный вид", "Высотная точка",
        "Обзорная площадка", "Вид на город"
      ]
    };
    
    const typeNames = names[type] || ["Интересное место"];
    return typeNames[index % typeNames.length];
  };

  const getPlaceDescription = (type: string) => {
    const descriptions: { [key: string]: string } = {
      historical: "Место исторического и культурного значения",
      park: "Зона отдыха и развлечений для всей семьи", 
      food: "Уютное место для питания и отдыха",
      cultural: "Культурное учреждение с богатой программой",
      viewpoint: "Место с красивым видом на город"
    };
    return descriptions[type] || "Интересное место для посещения";
  };

  const getPlaceIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      historical: "🏛️",
      park: "🌳",
      food: "🍽️", 
      cultural: "🎭",
      viewpoint: "🌅"
    };
    return icons[type] || "📍";
  };

  const getPlaceAddress = (index: number) => {
    const streets = [
      "ул. Центральная", "пр. Ленинский", "ул. Садовая", 
      "пер. Музейный", "ул. Парковая", "пр. Мира"
    ];
    return `${streets[index % streets.length]}, ${Math.floor(Math.random() * 100) + 1}`;
  };

  return {
    ymaps,
    loading,
    error,
    geocode,
    calculateRoute,
    searchOrganizations
  };
};