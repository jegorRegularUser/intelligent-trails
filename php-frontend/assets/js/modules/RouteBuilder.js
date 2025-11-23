/**
 * Route Builder
 * Builds and displays routes on Yandex Maps
 */

import { geocodeAddress } from '../utils/geocoder.js';
import { showNotification, showLoading } from '../utils/notifications.js';
import { validateActivities, validateTransportSelection } from '../utils/validators.js';

export class RouteBuilder {
    constructor(map) {
        this.map = map;
        this.currentRouteLines = [];
        this.routeMarkers = [];
    }
    
    setMap(map) {
        this.map = map;
    }
    
    async buildSmartWalk(startPoint, activities, endPoint = null, returnToStart = false) {
        if (!validateActivities(activities)) return;
        if (!validateTransportSelection(activities)) return;
        
        showLoading(true);
        
        try {
            // Geocode start point
            const startCoords = await geocodeAddress(startPoint);
            
            // Prepare payload for backend
            const payload = {
                start_point: startPoint,
                start_coords: startCoords,
                activities: activities,
                end_point: endPoint,
                return_to_start: returnToStart
            };
            
            // Call backend API
            const response = await fetch('/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'build_smart_walk',
                    data: payload
                })
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            // Display the walk on map
            await this.displaySmartWalk(result.walk_data, { name: startPoint, coords: startCoords }, endPoint, returnToStart);
            
            showNotification('✅ Маршрут построен!', 'success');
            
        } catch (error) {
            console.error('Route building error:', error);
            showNotification(`❌ Ошибка: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    async buildSimpleRoute(startPoint, endPoint, waypoints = [], transportMode = 'auto') {
        showLoading(true);
        
        try {
            const startCoords = await geocodeAddress(startPoint);
            const endCoords = await geocodeAddress(endPoint);
            
            const points = [startCoords];
            
            // Geocode waypoints
            for (const waypoint of waypoints) {
                try {
                    const coords = await geocodeAddress(waypoint);
                    points.push(coords);
                } catch (e) {
                    console.error('Failed to geocode waypoint:', waypoint, e);
                }
            }
            
            points.push(endCoords);
            
            // Build route via Yandex Maps
            await this.buildYandexRoute(points, transportMode);
            
            showNotification('✅ Маршрут построен!', 'success');
            
        } catch (error) {
            console.error('Simple route error:', error);
            showNotification(`❌ Ошибка: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    async buildYandexRoute(points, transportMode = 'auto') {
        return new Promise((resolve, reject) => {
            const modeMapping = {
                'auto': 'auto',
                'pedestrian': 'pedestrian',
                'masstransit': 'masstransit',
                'bicycle': 'bicycle'
            };
            
            const yandexMode = modeMapping[transportMode] || 'auto';
            
            ymaps.route(points, {
                routingMode: yandexMode,
                mapStateAutoApply: false
            }).then(
                (route) => {
                    this.currentRouteLines.push(route);
                    this.map.geoObjects.add(route);
                    
                    // Center map on route
                    this.map.setBounds(route.getBounds(), {
                        checkZoomRange: true,
                        zoomMargin: 50
                    });
                    
                    // Add markers
                    points.forEach((point, index) => {
                        const placemark = new ymaps.Placemark(
                            point,
                            {
                                balloonContent: index === 0 ? 'Старт' : 
                                               index === points.length - 1 ? 'Финиш' : 
                                               `Точка ${index}`
                            },
                            {
                                preset: index === 0 ? 'islands#greenDotIcon' : 
                                       index === points.length - 1 ? 'islands#redDotIcon' : 
                                       'islands#orangeDotIcon'
                            }
                        );
                        this.routeMarkers.push(placemark);
                        this.map.geoObjects.add(placemark);
                    });
                    
                    resolve(route);
                },
                (error) => {
                    reject(new Error(`Невозможно построить маршрут: ${error.message}`));
                }
            );
        });
    }
    
    async displaySmartWalk(walkData, startPoint, endPoint, returnToStart) {
        this.clearMap();
        
        if (!walkData.activities || walkData.activities.length === 0) {
            showNotification('Не удалось построить прогулку', 'error');
            return;
        }
        
        // Collect all points
        const allPoints = [startPoint.coords];
        const pointsInfo = [{
            name: startPoint.name,
            type: 'start',
            coords: startPoint.coords
        }];
        
        walkData.activities.forEach((activity, idx) => {
            if (activity.activity_type === 'place' && activity.selected_place) {
                allPoints.push(activity.selected_place.coords);
                pointsInfo.push({
                    name: activity.selected_place.name,
                    type: 'place',
                    coords: activity.selected_place.coords,
                    category: activity.category,
                    activityIndex: idx,
                    alternatives: activity.alternatives
                });
            }
        });
        
        if (returnToStart) {
            allPoints.push(startPoint.coords);
        } else if (endPoint) {
            const endCoords = await geocodeAddress(endPoint);
            allPoints.push(endCoords);
            pointsInfo.push({
                name: endPoint,
                type: 'end',
                coords: endCoords
            });
        }
        
        // Build route segments
        try {
            await this.buildMultiSegmentRoute(allPoints, walkData.activities);
            
            // Add markers
            pointsInfo.forEach((point) => {
                let iconPreset, iconColor;
                
                if (point.type === 'start') {
                    iconPreset = 'islands#greenDotIcon';
                    iconColor = '#10b981';
                } else if (point.type === 'end') {
                    iconPreset = 'islands#redDotIcon';
                    iconColor = '#ef4444';
                } else if (point.type === 'place') {
                    iconPreset = 'islands#blueDotIcon';
                    iconColor = '#667eea';
                } else {
                    return; // Skip intermediate walk points
                }
                
                const placemark = new ymaps.Placemark(
                    point.coords,
                    {
                        balloonContent: `<strong>${point.name}</strong>${point.category ? '<br>' + point.category : ''}`,
                        iconCaption: point.name
                    },
                    {
                        preset: iconPreset,
                        iconColor: iconColor
                    }
                );
                
                this.routeMarkers.push(placemark);
                this.map.geoObjects.add(placemark);
            });
            
            // Display walk info in side panel
            if (window.displayWalkInfo) {
                window.displayWalkInfo(walkData, pointsInfo);
            }
            
        } catch (error) {
            console.error('Error displaying smart walk:', error);
            showNotification(`❌ ${error.message}`, 'error');
        }
    }
    
    async buildMultiSegmentRoute(points, activities) {
        for (let i = 0; i < points.length - 1; i++) {
            const mode = activities[i]?.transport_mode || 'pedestrian';
            
            try {
                await this.buildSegment(points[i], points[i + 1], mode);
            } catch (error) {
                console.error(`Segment ${i} failed:`, error);
                throw new Error(`Не удалось построить маршрут между точками ${i} и ${i+1}`);
            }
        }
    }
    
    async buildSegment(from, to, mode) {
        return new Promise((resolve, reject) => {
            ymaps.route([from, to], {
                routingMode: mode,
                mapStateAutoApply: false
            }).then(
                (route) => {
                    this.currentRouteLines.push(route);
                    this.map.geoObjects.add(route);
                    
                    const activeRoute = route.getActiveRoute();
                    resolve({
                        route: route,
                        distance: activeRoute.properties.get('distance').value,
                        duration: activeRoute.properties.get('duration').value
                    });
                },
                (error) => reject(error)
            );
        });
    }
    
    clearMap() {
        this.currentRouteLines.forEach(line => this.map.geoObjects.remove(line));
        this.currentRouteLines = [];
        
        this.routeMarkers.forEach(marker => this.map.geoObjects.remove(marker));
        this.routeMarkers = [];
    }
}
