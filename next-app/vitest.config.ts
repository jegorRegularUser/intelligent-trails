import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()], // Этот плагин читает tsconfig.json и настраивает алиас @/
  test: {
    environment: 'node', // Так как мы тестируем серверные функции (без отрисовки UI), нам нужен только Node.js
    testTimeout: 20000, // Overpass API иногда отвечает долго, дадим ему 20 секунд на тест
    // Живые сетевые тесты (*.integration.test.*) по умолчанию выключены:
    // `npm test` должен быть детерминированным и не бить в Overpass/ORS/Nominatim.
    // Запуск вручную: npx vitest run --include "**/*.integration.test.*"
    exclude: ['**/node_modules/**', '**/*.integration.test.*'],
  },
});
