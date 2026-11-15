import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` : l'application fonctionne sous n'importe quel sous-dossier
// (GitHub Pages : https://<compte>.github.io/<depot>/) grâce au HashRouter.
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Date de construction dans la page : un onglet ouvert compare la sienne à celle du site (lib/appUpdate.ts).
    { name: 'build-time', transformIndexHtml: (html) => html.replace('</head>', `  <meta name="app-build" content="${BUILD_TIME}" />
  </head>`) },
  ],
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  build: { outDir: 'dist', sourcemap: false },
  server: { host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
