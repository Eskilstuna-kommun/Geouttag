import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
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
