window.MapVariants = {
  mapCore: null,
  currentVariantIndices: {},

  init(mapCore) {
    this.mapCore = mapCore;
  },

  attachSliderHandlers() {
    const stageCards = document.querySelectorAll('.stage-card');
    
    stageCards.forEach(stageCard => {
      const stageIndex = parseInt(stageCard.dataset.stage);
      
      if (!this.currentVariantIndices[stageIndex]) {
        this.currentVariantIndices[stageIndex] = 0;
      }

      const prevBtn = stageCard.querySelector('.slider-btn.prev');
      const nextBtn = stageCard.querySelector('.slider-btn.next');
      const counter = stageCard.querySelector('.slider-counter');
      const variants = stageCard.querySelectorAll('.variant-option');

      if (!prevBtn || !nextBtn || variants.length <= 1) return;

      console.log(`[VARIANTS] Attaching handlers for stage ${stageIndex}, ${variants.length} variants`);

      this.updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

      prevBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[VARIANTS] Prev clicked for stage ${stageIndex}`);
        if (this.currentVariantIndices[stageIndex] > 0) {
          this.currentVariantIndices[stageIndex]--;
          this.switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
        }
      };

      nextBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[VARIANTS] Next clicked for stage ${stageIndex}`);
        if (this.currentVariantIndices[stageIndex] < variants.length - 1) {
          this.currentVariantIndices[stageIndex]++;
          this.switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
        }
      };
    });
  },

  switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
    const currentIndex = this.currentVariantIndices[stageIndex];

    console.log(`[VARIANTS] Switching stage ${stageIndex} to variant ${currentIndex}`);

    variants.forEach((v, idx) => {
      if (idx === currentIndex) {
        v.classList.add('active');
        v.style.display = 'block';
      } else {
        v.classList.remove('active');
        v.style.display = 'none';
      }
    });

    this.updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

    this.rebuildRouteWithNewVariant(stageIndex, currentIndex);
  },

  updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
    const currentIndex = this.currentVariantIndices[stageIndex];

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === variants.length - 1;
    counter.textContent = `${currentIndex + 1} / ${variants.length}`;
    
    console.log(`[VARIANTS] Updated counter: ${currentIndex + 1} / ${variants.length}`);
  },

  async rebuildRouteWithNewVariant(stageIndex, variantIndex) {
    if (!this.mapCore.currentWalkData) {
      console.warn('[VARIANTS] No walk data');
      return;
    }

    console.log(`[VARIANTS] Rebuilding route: stage ${stageIndex}, variant ${variantIndex}`);

    const activity = this.mapCore.currentWalkData.activities[stageIndex];
    if (!activity || activity.activity_type !== 'place') {
      console.warn('[VARIANTS] Activity not a place');
      return;
    }

    if (variantIndex === 0) {
      console.log('[VARIANTS] Variant 0 is original, no rebuild needed');
      this.showQuickNotification(`Выбрано: ${activity.selected_place.name}`);
      return;
    }

    if (!activity.alternatives || !activity.alternatives[variantIndex - 1]) {
      console.warn('[VARIANTS] Alternative not found');
      return;
    }

    const newPlace = activity.alternatives[variantIndex - 1].place;
    console.log(`[VARIANTS] New place: ${newPlace.name}`);

    const oldPlace = activity.selected_place;
    
    activity.selected_place = newPlace;
    
    const tempAlternatives = [...activity.alternatives];
    tempAlternatives[variantIndex - 1].place = oldPlace;
    activity.alternatives = tempAlternatives;

    this.showQuickNotification(`🔄 Перестраиваем маршрут...`);

    try {
      const response = await fetch('api.php?action=rebuild_route_segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_index: stageIndex,
          new_place: newPlace,
          prev_place_coords: stageIndex > 0 ? 
            (this.mapCore.currentWalkData.activities[stageIndex - 1].selected_place?.coords || this.mapCore.currentWalkData.start_point?.coords) : 
            this.mapCore.currentWalkData.start_point?.coords,
          next_place_coords: stageIndex < this.mapCore.currentWalkData.activities.length - 1 ?
            (this.mapCore.currentWalkData.activities[stageIndex + 1].selected_place?.coords || null) :
            null,
          transport_mode: activity.transport_mode
        })
      });

      const result = await response.json();

      if (result.success && result.data.geometry) {
        activity.geometry = result.data.geometry;
        activity.distance_meters = result.data.distance_meters;
        activity.duration_seconds = result.data.duration_seconds;

        this.mapCore.clearMap();

        const startPoint = this.mapCore.currentWalkData.start_point || {
          name: "Начало",
          coords: this.mapCore.currentWalkData.activities[0].selected_place?.coords || [55.751574, 37.573856]
        };

        await window.displaySmartWalk(
          this.mapCore.currentWalkData, 
          startPoint, 
          this.mapCore.currentWalkData.end_point || null, 
          this.mapCore.currentWalkData.return_to_start || false
        );

        this.showQuickNotification(`✅ Место изменено: ${newPlace.name}`);
      } else {
        console.warn('[VARIANTS] Failed to rebuild route, using old geometry');
        
        this.mapCore.clearMap();

        const startPoint = this.mapCore.currentWalkData.start_point || {
          name: "Начало",
          coords: this.mapCore.currentWalkData.activities[0].selected_place?.coords || [55.751574, 37.573856]
        };

        await window.displaySmartWalk(
          this.mapCore.currentWalkData, 
          startPoint, 
          this.mapCore.currentWalkData.end_point || null, 
          this.mapCore.currentWalkData.return_to_start || false
        );

        this.showQuickNotification(`✅ Место изменено: ${newPlace.name}`);
      }
    } catch (error) {
      console.error('[VARIANTS] Error rebuilding:', error);
      
      this.mapCore.clearMap();

      const startPoint = this.mapCore.currentWalkData.start_point || {
        name: "Начало",
        coords: this.mapCore.currentWalkData.activities[0].selected_place?.coords || [55.751574, 37.573856]
      };

      await window.displaySmartWalk(
        this.mapCore.currentWalkData, 
        startPoint, 
        this.mapCore.currentWalkData.end_point || null, 
        this.mapCore.currentWalkData.return_to_start || false
      );

      this.showQuickNotification(`✅ Место изменено: ${newPlace.name}`);
    }
  },

  showQuickNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'quick-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 25px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      font-weight: 600;
      animation: slideInUp 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutDown 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
};

if (!document.getElementById('variants-notification-styles')) {
  const notificationStyles = document.createElement('style');
  notificationStyles.id = 'variants-notification-styles';
  notificationStyles.textContent = `
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes slideOutDown {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(20px);
      }
    }
  `;
  document.head.appendChild(notificationStyles);
}
