import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'html-rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/manual' || req.url === '/manual/') {
            req.url = '/manual.html';
          } else if (req.url === '/scanner' || req.url === '/scanner/') {
            req.url = '/scanner.html';
          }
          next();
        });
      }
    }
  ],
  server: {
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        scanner: resolve(__dirname, 'scanner.html'),
        manual: resolve(__dirname, 'manual.html')
      }
    }
  }
});
