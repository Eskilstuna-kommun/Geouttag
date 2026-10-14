import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    // Resolve .env files relative to this plugin, not the shell's working directory.
    envDir: import.meta.dirname,
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      cors: {
        origin: 'http://localhost:9966'
      },
      proxy: {
        '/portal/sharing/rest/oauth2/token': {
          target: 'https://geo.eskilstuna.se',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: isProduction ? 'build' : '../origo/plugins/geouttag',
      emptyOutDir: isProduction,
      sourcemap: !isProduction,
      minify: isProduction,

      lib: {
        entry: resolve(import.meta.dirname, 'geouttag.js'),
        name: 'Geouttag',
        fileName: () => (isProduction ? 'geouttag.min.js' : 'geouttag.js'),
        formats: ['iife']
      },

      rollupOptions: {
        external: ['Origo']
      }
    }
  };
});
