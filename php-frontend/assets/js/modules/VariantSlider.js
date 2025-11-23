/**
 * Variant Slider
 * Manages alternative place suggestions and carousel navigation
 */

import { showQuickNotification, showLoading } from '../utils/notifications.js';

export class VariantSlider {
    constructor(routeBuilder) {
        this.routeBuilder = routeBuilder;
        this.currentVariantIndices = {};
    }
    
    async loadAlternatives(category, coords, excludeId = null) {
        try {
            const coordsString = coords.join(',');
            const response = await fetch(
                `/api.php?action=get_nearby_alternatives&category=${encodeURIComponent(category)}&coords=${coordsString}&exclude_id=${excludeId || ''}`
            );
            
            if (!response.ok) {
                throw new Error('Failed to load alternatives');
            }
            
            const data = await response.json();
            return data.alternatives || [];
            
        } catch (error) {
            console.error('Error loading alternatives:', error);
            return [];
        }
    }
    
    renderSlider(stageElement, alternatives, currentPlace) {
        if (!alternatives || alternatives.length === 0) {
            return; // No alternatives to show
        }
        
        const stageIndex = parseInt(stageElement.dataset.stage);
        this.currentVariantIndices[stageIndex] = 0;
        
        const allVariants = [
            { place: currentPlace, distance: 0, isCurrent: true },
            ...alternatives
        ];
        
        const sliderHTML = `
            <div class="stage-variants">
                <div class="variants-carousel">
                    ${allVariants.map((variant, idx) => `
                        <div class="variant-card ${idx === 0 ? 'active' : ''}" data-variant="${idx}">
                            <div class="variant-name">${variant.place.name}</div>
                            ${variant.place.address ? `<div class="variant-address">${variant.place.address}</div>` : ''}
                            ${variant.distance > 0 ? `<div class="variant-distance">📍 ${variant.distance} м</div>` : ''}
                            ${variant.isCurrent ? '<div class="variant-badge current">Текущий выбор</div>' : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="carousel-controls">
                    <button class="carousel-prev" ${allVariants.length <= 1 ? 'disabled' : ''}>←</button>
                    <span class="carousel-counter">1 / ${allVariants.length}</span>
                    <button class="carousel-next" ${allVariants.length <= 1 ? 'disabled' : ''}>→</button>
                </div>
            </div>
        `;
        
        const existingVariants = stageElement.querySelector('.stage-variants');
        if (existingVariants) {
            existingVariants.remove();
        }
        
        stageElement.insertAdjacentHTML('beforeend', sliderHTML);
        
        this.attachCarouselHandlers(stageElement, allVariants);
    }
    
    attachCarouselHandlers(stageElement, variants) {
        const stageIndex = parseInt(stageElement.dataset.stage);
        
        const prevBtn = stageElement.querySelector('.carousel-prev');
        const nextBtn = stageElement.querySelector('.carousel-next');
        const counter = stageElement.querySelector('.carousel-counter');
        const variantCards = stageElement.querySelectorAll('.variant-card');
        
        if (!prevBtn || !nextBtn || variants.length <= 1) return;
        
        prevBtn.addEventListener('click', () => {
            if (this.currentVariantIndices[stageIndex] > 0) {
                this.currentVariantIndices[stageIndex]--;
                this.updateCarousel(stageElement, variantCards, prevBtn, nextBtn, counter, variants);
            }
        });
        
        nextBtn.addEventListener('click', () => {
            if (this.currentVariantIndices[stageIndex] < variants.length - 1) {
                this.currentVariantIndices[stageIndex]++;
                this.updateCarousel(stageElement, variantCards, prevBtn, nextBtn, counter, variants);
            }
        });
    }
    
    updateCarousel(stageElement, variantCards, prevBtn, nextBtn, counter, variants) {
        const stageIndex = parseInt(stageElement.dataset.stage);
        const currentIndex = this.currentVariantIndices[stageIndex];
        
        // Update active card
        variantCards.forEach((card, idx) => {
            if (idx === currentIndex) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
        
        // Update buttons
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === variants.length - 1;
        
        // Update counter
        counter.textContent = `${currentIndex + 1} / ${variants.length}`;
        
        // Rebuild route with new place
        this.rebuildRouteWithVariant(stageIndex, variants[currentIndex]);
    }
    
    async rebuildRouteWithVariant(stageIndex, newVariant) {
        const stageCard = document.querySelector(`[data-stage="${stageIndex}"]`);
        
        if (!stageCard) return;
        
        // Show skeleton loader
        this.showSkeletonLoader(stageCard);
        
        try {
            // Update activity with new place
            const event = new CustomEvent('variantChanged', {
                detail: {
                    stageIndex: stageIndex,
                    newPlace: newVariant.place
                }
            });
            document.dispatchEvent(event);
            
            showQuickNotification(`✅ Место изменено на: ${newVariant.place.name}`);
            
        } catch (error) {
            console.error('Error rebuilding route:', error);
            showQuickNotification(`❌ Ошибка при перестроении маршрута`);
        } finally {
            this.hideSkeletonLoader(stageCard);
        }
    }
    
    showSkeletonLoader(element) {
        const loader = document.createElement('div');
        loader.className = 'skeleton-loader';
        loader.innerHTML = `
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        `;
        
        const content = element.querySelector('.stage-info');
        if (content) {
            content.style.opacity = '0.3';
            content.appendChild(loader);
        }
    }
    
    hideSkeletonLoader(element) {
        const loader = element.querySelector('.skeleton-loader');
        if (loader) {
            loader.remove();
        }
        
        const content = element.querySelector('.stage-info');
        if (content) {
            content.style.opacity = '1';
        }
    }
}
