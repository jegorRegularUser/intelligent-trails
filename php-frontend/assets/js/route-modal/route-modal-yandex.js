/**
 * Интеграция с Yandex Maps API: автоподсказки и геокодирование
 */
window.RouteModalYandex = {
  modalInstance: null,

  init(modal) {
    this.modalInstance = modal;
    this.setupAllSuggests();
  },

  setupAllSuggests() {
    this.setupSuggest("smartStartPoint");
    this.setupSuggest("smartEndPoint");
    this.setupSuggest("simpleStartPoint");
    this.setupSuggest("simpleEndPoint");
    this.setupSuggest("specificPlaceInput");
  },

  setupSuggest(inputId) {
    const input = document.getElementById(inputId);
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(input, { results: 5 });
    }
  },

  setupSuggestForElement(element) {
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(element, { results: 5 });
    }
  },

  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(address, { results: 1 }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            const coords = firstGeoObject.geometry.getCoordinates();
            resolve(coords);
          } else {
            reject(new Error("Адрес не найден"));
          }
        },
        (error) => reject(error)
      );
    });
  }
};
