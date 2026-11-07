import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchWeatherContext,
  mapToHints,
  resetWeatherCache,
  RAIN_MM_H,
  RAIN_FORECAST_MM_H,
  HEAT_TEMP_C,
  type WeatherContext,
} from '@/lib/weather';

/** Ответ Open-Meteo в форме, достаточной для парсера. */
function openMeteoPayload(overrides: {
  tempC?: number;
  precip?: number;
  isDay?: number;
  hourlyPrecip?: number[];
  utcOffsetSeconds?: number;
} = {}): unknown {
  const now = new Date();
  const hours = [-1, 0, 1, 2, 3].map((h) => new Date(now.getTime() + h * 3_600_000));
  return {
    utc_offset_seconds: overrides.utcOffsetSeconds ?? 0,
    current: {
      temperature_2m: overrides.tempC ?? 15,
      precipitation: overrides.precip ?? 0,
      weather_code: 0,
      is_day: overrides.isDay ?? 1,
    },
    hourly: {
      time: hours.map((d) => d.toISOString().slice(0, 16)),
      precipitation: overrides.hourlyPrecip ?? [0, 0, 0, 0, 0],
    },
  };
}

function stubFetch(payload: unknown, calls: string[] = []): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return { ok: true, json: async () => payload } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetWeatherCache();
});

describe('fetchWeatherContext — разбор ответа', () => {
  it('парсит температуру, дождь и тьму', async () => {
    const f = stubFetch(openMeteoPayload({ tempC: 28.4, precip: 0.3, isDay: 0 }));
    const w = await fetchWeatherContext(55.75, 37.62, { fetchImpl: f });
    expect(w).not.toBeNull();
    expect(w!.tempC).toBeCloseTo(28.4);
    expect(w!.isRaining).toBe(true);
    expect(w!.isDark).toBe(true);
  });

  it(`порог дождя: ${RAIN_MM_H} мм/ч — дождь, ниже — морось`, async () => {
    // разные ячейки кэша — иначе второй вызов вернёт закэшированный первый
    const raining = await fetchWeatherContext(55.75, 37.62, {
      fetchImpl: stubFetch(openMeteoPayload({ precip: 0.1 })),
    });
    const drizzle = await fetchWeatherContext(55.72, 37.65, {
      fetchImpl: stubFetch(openMeteoPayload({ precip: 0.05 })),
    });
    expect(raining!.isRaining).toBe(true);
    expect(drizzle!.isRaining).toBe(false);
  });

  it(`precipNext2h смотрит два ближайших часовых значения (порог ${RAIN_FORECAST_MM_H} мм)`, async () => {
    const soon = await fetchWeatherContext(55.75, 37.62, {
      fetchImpl: stubFetch(openMeteoPayload({ hourlyPrecip: [0, 0, 0.3, 0, 0] })),
    });
    expect(soon!.precipNext2h).toBe(true);

    const dry = await fetchWeatherContext(55.72, 37.65, {
      fetchImpl: stubFetch(openMeteoPayload({ hourlyPrecip: [0.9, 0, 0, 0, 0] })),
    });
    expect(dry!.precipNext2h).toBe(false); // дождь позади, впереди чисто
  });

  it('деградация: сеть упала / не-2xx / кривой JSON / пустые поля → null, без throw', async () => {
    const networkFail = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await fetchWeatherContext(55.75, 37.62, { fetchImpl: networkFail })).toBeNull();

    const notOk = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    expect(await fetchWeatherContext(55.75, 37.62, { fetchImpl: notOk })).toBeNull();

    const badJson = (async () => ({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    })) as unknown as typeof fetch;
    expect(await fetchWeatherContext(55.75, 37.62, { fetchImpl: badJson })).toBeNull();

    const empty = stubFetch({});
    expect(await fetchWeatherContext(55.75, 37.62, { fetchImpl: empty })).toBeNull();

    expect(await fetchWeatherContext(Number.NaN, 37.62, { fetchImpl: stubFetch(openMeteoPayload()) })).toBeNull();
  });
});

describe('fetchWeatherContext — кэш', () => {
  it('повторный вызов по тем же координатам не бьёт в API (TTL 30 мин)', async () => {
    let clock = 1_000;
    const calls: string[] = [];
    const f = stubFetch(openMeteoPayload(), calls);
    const opts = { fetchImpl: f, now: () => clock };

    await fetchWeatherContext(55.75, 37.62, opts);
    await fetchWeatherContext(55.75, 37.62, opts);
    expect(calls).toHaveLength(1);

    clock += 30 * 60 * 1000 + 1; // TTL истёк
    await fetchWeatherContext(55.75, 37.62, opts);
    expect(calls).toHaveLength(2);
  });

  it('ключ кэша — координаты до 0.1°: соседние точки делят ячейку', async () => {
    const calls: string[] = [];
    const opts = { fetchImpl: stubFetch(openMeteoPayload(), calls) };
    await fetchWeatherContext(55.74, 37.61, opts);
    await fetchWeatherContext(55.744, 37.619, opts); // та же ячейка 55.7/37.6
    await fetchWeatherContext(55.76, 37.62, opts);   // уже другая ячейка 55.8
    expect(calls).toHaveLength(2);
  });

  it('отказ кэшируется коротко (2 мин), чтобы не долбить мёртвый API', async () => {
    let clock = 1_000;
    const calls: string[] = [];
    const f = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      throw new Error('down');
    }) as unknown as typeof fetch;
    const opts = { fetchImpl: f, now: () => clock };

    expect(await fetchWeatherContext(55.75, 37.62, opts)).toBeNull();
    expect(await fetchWeatherContext(55.75, 37.62, opts)).toBeNull();
    expect(calls).toHaveLength(1);

    clock += 2 * 60 * 1000 + 1;
    expect(await fetchWeatherContext(55.75, 37.62, opts)).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

describe('mapToHints', () => {
  const ctx = (o: Partial<WeatherContext> = {}): WeatherContext => ({
    tempC: 15, isRaining: false, precipNext2h: false, isDark: false, ...o,
  });

  it(`preferIndoor при дожде или дожде в ближайшие 2 часа`, () => {
    expect(mapToHints(ctx({ isRaining: true })).preferIndoor).toBe(true);
    expect(mapToHints(ctx({ precipNext2h: true })).preferIndoor).toBe(true);
    expect(mapToHints(ctx()).preferIndoor).toBe(false);
  });

  it(`preferShade только в ясную жару выше ${HEAT_TEMP_C} °C днём`, () => {
    expect(mapToHints(ctx({ tempC: 30 })).preferShade).toBe(true);
    expect(mapToHints(ctx({ tempC: 27 })).preferShade).toBe(false);
    expect(mapToHints(ctx({ tempC: 30, isDark: true })).preferShade).toBe(false);
    expect(mapToHints(ctx({ tempC: 30, isRaining: true })).preferShade).toBe(false);
  });

  it('preferLighted в темноте', () => {
    expect(mapToHints(ctx({ isDark: true })).preferLighted).toBe(true);
    expect(mapToHints(ctx()).preferLighted).toBe(false);
  });
});
