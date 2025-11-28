/**
 * Управление переключением вариантов мест в маршруте
 * Слайдер альтернатив и перестроение маршрута
 */
window.MapVariants = {
  mapCore: null,
  currentVariantIndices: {},

  init(mapCore) {
    this.mapCore = mapCore;
  },

  attachSliderHandlers() {
    document.querySelectorAll('.stage-card').forEach(stageCard => {
      const stageIndex = parseInt(stageCard.dataset.stage);
      this.currentVariantIndices[stageIndex] = 0;

      const prevBtn = stageCard.querySelector('.slider-btn.prev');
      const nextBtn = stageCard.querySelector('.slider-btn.next');
      const counter = stageCard.querySelector('.slider-counter');
      const variants = stageCard.querySelectorAll('.variant-option');

      if (!prevBtn || !nextBtn || variants.length <= 1) return;

      this.updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

      prevBtn.addEventListener('click', () => {
        if (this.currentVariantIndices[stageIndex] > 0) {
          this.currentVariantIndices[stageIndex]--;
          this.switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
        }
      });

      nextBtn.addEventListener('click', () => {
        if (this.currentVariantIndices[stageIndex] < variants.length - 1) {
          this.currentVariantIndices[stageIndex]++;
          this.switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);
        }
      });
    });
  },

  switchVariant(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
    const currentIndex = this.currentVariantIndices[stageIndex];

    // Скрываем все варианты с анимацией
    variants.forEach((v, idx) => {
      if (idx !== currentIndex) {
        v.classList.remove('active');
      }
    });

    // Показываем выбранный вариант
    variants[currentIndex].classList.add('active');

    this.updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter);

    // ПЕРЕСТРАИВАЕМ МАРШРУТ С НОВЫМ МЕСТОМ
    this.rebuildRouteWithNewVariant(stageIndex, currentIndex);
  },

  updateSliderState(stageIndex, stageCard, variants, prevBtn, nextBtn, counter) {
    const currentIndex = this.currentVariantIndices[stageIndex];

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === variants.length - 1;
    counter.textContent = `${currentIndex + 1} / ${variants.length}`;
  },

  async rebuildRouteWithNewVariant(stageIndex, variantIndex) {
    if (!this.mapCore.currentWalkData) return;

    console.log(`Переключение этапа ${stageIndex} на вариант ${variantIndex}`);

    // Получаем новое место из варианта
    const activity = this.mapCore.currentWalkData.activities[stageIndex];
    if (!activity || !activity.alternatives || !activity.alternatives[variantIndex - 1]) {
      return;
    }

    const newPlace = activity.alternatives[variantIndex - 1].place;

    // Обновляем выбранное место в данных
    activity.selected_place = newPlace;

    // Очищаем карту
    this.mapCore.clearMap();

    // Перестраиваем маршрут с обновленными данными
    const startPoint = {
      name: this.mapCore.currentWalkData.activities[0]?.selected_place?.name || "Старт",
      coords: this.mapCore.currentWalkData.activities[0]?.selected_place?.coords || [55.751574, 37.573856]
    };

    await window.displaySmartWalk(this.mapCore.currentWalkData, startPoint, null, false);

    // Показываем уведомление
    this.showQuickNotification(`✅ Место изменено на: ${newPlace.name}`);
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

// Добавляем CSS для анимации уведомлений
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
