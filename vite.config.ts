import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` : l'application fonctionne sous n'importe quel sous-dossier
// (GitHub Pages : https://<compte>.github.io/<depot>/) grâce au HashRouter.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: { host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
