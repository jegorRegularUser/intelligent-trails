"use server";

export interface YandexSuggestResult {
  title: string;
  subtitle: string;
}

export async function getAddressSuggestions(query: string): Promise<YandexSuggestResult[]> {
  if (!query.trim()) return [];

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY || process.env.YANDEX_SUGGEST_API_KEY;

  if (!apiKey) {
    console.error("Не задан ключ API Яндекс Подсказок");
    return [];
  }

  try {
    // Правильный URL для HTTP API Подсказок Яндекса (v1)
    const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${apiKey}&text=${encodeURIComponent(query)}&results=10`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Ошибка API Подсказок");

    const data = await response.json();
    
    if (!data.results) return [];

    // Возвращаем только чистый текст
    return data.results.map((item: any) => ({
      title: item.title?.text || "",
      subtitle: item.subtitle?.text || "",
    }));
  } catch (error) {
    console.error("Ошибка при получении подсказок:", error);
    return [];
  }
}