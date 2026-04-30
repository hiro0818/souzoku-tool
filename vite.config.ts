import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 配信用にベースパスを設定
// https://hiro0818.github.io/souzoku-tool/ で配信されるため /souzoku-tool/
export default defineConfig({
  base: '/souzoku-tool/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
