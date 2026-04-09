// src/utils/async.ts

/**
 * Останавливает выполнение асинхронной функции на заданное количество миллисекунд.
 * @param ms Время задержки в миллисекундах
 */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));