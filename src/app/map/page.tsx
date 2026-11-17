import { redirect } from "next/navigation";

// Блокер B1 (docs/ux-human-wave.md M2): /map больше не отдельный экран —
// главный сценарий живёт на /. Шареные ссылки эксперта (/map?r=...) и
// dev-переключатель (?sketch=1) обязаны продолжать открываться: редирект
// сохраняет ВСЕ query-параметры. Смоук: /map?r=2.<lz> → /?r=2.<lz> →
// эксперт-сайдбар с линией на Яндексе.
export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    }
  }
  const queryString = query.toString();
  redirect(queryString ? `/?${queryString}` : '/');
}
