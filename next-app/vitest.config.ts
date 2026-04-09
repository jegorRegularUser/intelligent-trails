import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()], // Этот плагин читает tsconfig.json и настраивает алиас @/
  test: {
    environment: 'node', // Так как мы тестируем серверные функции (без отрисовки UI), нам нужен только Node.js
    testTimeout: 20000, // Overpass API иногда отвечает долго, дадим ему 20 секунд на тест
  },
});