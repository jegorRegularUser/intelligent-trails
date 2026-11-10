// src/lib/geo/instance.ts
// Общий экземпляр CloudProvider на процесс Node. TTL/LRU-кэши адаптеров
// (route/places 10 мин, reverse 60/5 мин, suggest 10 мин) живут в памяти
// инстанса — пересоздавать провайдер на каждый вызов экшена значит их
// выбрасывать: первый же повторный запрос (Пересобрать/Заменить/подсказки)
// уходит в сеть заново. Синглтон делает кэш сквозным внутри процесса.
import { CloudProvider } from './cloud/cloud-provider';

let instance: CloudProvider | null = null;

export function getCloudProvider(): CloudProvider {
  if (!instance) {
    // Пустая строка = «ключа нет» — роутинг честно деградирует в NO_ROUTE.
    instance = new CloudProvider({
      orsApiKey: process.env.OPENROUTESERVICE_API_KEY ?? '',
    });
  }
  return instance;
}
