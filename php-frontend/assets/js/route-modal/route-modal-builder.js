window.RouteModalBuilder = {
    init(modalInstance) {
        this.modal = modalInstance;
        this.bindEvents();
        console.log('[RouteModalBuilder] Initialized - NEW API');
    },

    bindEvents() {
        const buildBtn = document.getElementById('buildRoute');
        if (buildBtn) {
            const newBtn = buildBtn.cloneNode(true);
            buildBtn.parentNode.replaceChild(newBtn, buildBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleBuildClick();
            });
        } else {
            console.error('[RouteModalBuilder] Build button not found');
        }
    },

    async handleBuildClick() {
        console.log('[RouteModalBuilder] Starting route build...');
        
        const data = this.collectData();
        
        if (!data) {
            return;
        }

        console.log('[RouteModalBuilder] Collected data:', data);

        this.modal.showLoading(true, 'Ищем места рядом с вами...');

        try {
            const placesData = await this.searchPlaces(data);
            
            if (!placesData || Object.keys(placesData.places_by_category).length === 0) {
                this.modal.showNotification('Места не найдены. Попробуйте изменить категории или радиус поиска.', 'error');
                return;
            }

            this.handleSuccess(data.start_point, placesData, data.return_to_start);

        } catch (error) {
            console.error('[RouteModalBuilder] Error:', error);
            this.modal.showNotification('Ошибка: ' + error.message, 'error');
        } finally {
            this.modal.showLoading(false);
        }
    },

    collectData() {
        if (this.modal.currentRouteType === 'smart') {
            return this.collectSmartData();
        } else {
            return this.collectSimpleData();
        }
    },

    collectSmartData() {
        const startCoords = this.getCoordsFromInput('smartStartPoint');
        
        if (!startCoords) {
            this.modal.showNotification('Укажите начальную точку', 'error');
            return null;
        }

        console.log('[RouteModalBuilder] Start point:', startCoords);

        const categories = [];

        this.modal.activities.forEach((act) => {
            if (act.type === 'place' && act.category) {
                categories.push(act.category);
                console.log('[RouteModalBuilder] Added category:', act.category);
            }
        });

        if (categories.length === 0) {
            this.modal.showNotification('Добавьте хотя бы одно место', 'error');
            return null;
        }

        const routeEndType = document.querySelector('input[name="routeEnd"]:checked')?.value;
        const return_to_start = routeEndType === 'return';

        console.log('[RouteModalBuilder] Return to start:', return_to_start);

        return {
            start_point: startCoords,
            categories: categories,
            return_to_start: return_to_start,
            radius_m: 5000
        };
    },

    collectSimpleData() {
        this.modal.showNotification('Простой режим пока не поддерживается', 'error');
        return null;
    },

    getCoordsFromInput(id) {
        const input = document.getElementById(id);
        if (input && input.dataset.coords) {
            const coords = input.dataset.coords.split(',').map(Number);
            return coords;
        }
        return null;
    },

    async searchPlaces(data) {
        console.log('[RouteModalBuilder] Sending search request...');
        
        const API_URL = 'https://intelligent-trails.onrender.com/api/search/places';

        const requestBody = {
            center_coords: data.start_point,
            categories: data.categories,
            radius_m: data.radius_m
        };

        console.log('[RouteModalBuilder] Request:', JSON.stringify(requestBody, null, 2));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('[RouteModalBuilder] Server response:', result);
        
        if (!result.success) {
            throw new Error(result.error || 'Search failed');
        }
        
        return result;
    },

    handleSuccess(startPoint, placesData, returnToStart) {
        console.log('[RouteModalBuilder] Places found successfully');
        
        this.modal.close();

        if (window.StateManager) {
            window.StateManager.setState({
                places_by_category: placesData.places_by_category,
                start_point: startPoint,
                return_to_start: returnToStart
            });
        }

        if (window.MapRouteBuilder) {
            window.MapRouteBuilder.buildRoute(startPoint, placesData.places_by_category, returnToStart);
        } else {
            console.error('[RouteModalBuilder] MapRouteBuilder not found');
        }

        const totalPlaces = placesData.total_count;
        this.modal.showNotification(
            `Найдено ${totalPlaces} мест. Строим маршрут...`,
            'success'
        );
    }
};

window.RouteBuilder = window.RouteModalBuilder;

