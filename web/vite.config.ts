import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: 'src/routes',
      generatedRouteTree: 'src/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 3000,
    open: false,
    proxy: {
      // 백엔드(api)는 :8000에서 /api/v1 접두로 서빙한다. dev baseURL이 상대경로('')라
      // SDK 경로(/api/v1/...)를 그대로 프록시한다 — rewrite 없음(이중 /api 제거).
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
