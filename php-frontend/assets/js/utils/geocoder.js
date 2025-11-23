/**
 * Geocoder Utility
 * Yandex Maps geocoding and suggest integration
 */

export async function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        if (typeof ymaps === 'undefined') {
            reject(new Error('Yandex Maps API не загружен'));
            return;
        }
        
        ymaps.geocode(address, { results: 1 }).then(
            (result) => {
                const firstGeoObject = result.geoObjects.get(0);
                if (firstGeoObject) {
                    resolve(firstGeoObject.geometry.getCoordinates());
                } else {
                    reject(new Error(`Адрес не найден: ${address}`));
                }
            },
            (error) => reject(error)
        );
    });
}

export function setupYandexSuggest(inputElement, options = {}) {
    if (typeof ymaps === 'undefined') {
        console.error('Yandex Maps API not loaded');
        return null;
    }
    
    const suggestView = new ymaps.SuggestView(inputElement, {
        results: options.results || 5,
        offset: options.offset || [0, 5],
        ...options
    });
    
    return suggestView;
}

export async function reverseGeocode(coords) {
    return new Promise((resolve, reject) => {
        if (typeof ymaps === 'undefined') {
            reject(new Error('Yandex Maps API не загружен'));
            return;
        }
        
        ymaps.geocode(coords, { results: 1 }).then(
            (result) => {
                const firstGeoObject = result.geoObjects.get(0);
                if (firstGeoObject) {
                    resolve({
                        address: firstGeoObject.getAddressLine(),
                        name: firstGeoObject.getThoroughfare() || firstGeoObject.getLocalities()[0]
                    });
                } else {
                    reject(new Error('Не удалось определить адрес'));
                }
            },
            (error) => reject(error)
        );
    });
}

export function calculateDistance(coords1, coords2) {
    if (typeof ymaps === 'undefined') {
        // Fallback: Haversine formula
        const R = 6371e3; // Earth radius in meters
        const φ1 = coords1[0] * Math.PI / 180;
        const φ2 = coords2[0] * Math.PI / 180;
        const Δφ = (coords2[0] - coords1[0]) * Math.PI / 180;
        const Δλ = (coords2[1] - coords1[1]) * Math.PI / 180;
        
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return Math.round(R * c); // meters
    }
    
    // Use Yandex Maps coordSystem
    return ymaps.coordSystem.geo.getDistance(coords1, coords2);
}
