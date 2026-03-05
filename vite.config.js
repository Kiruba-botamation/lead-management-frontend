import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3001,
        proxy: {
            // Forward all /api requests to the backend (avoids CORS in dev)
            '/api': {
                target: 'http://localhost:8081',
                changeOrigin: true,
                secure: false,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        console.log(`[Proxy] ${req.method} ${req.url} -> http://localhost:8081${req.url}`);
                    });
                    proxy.on('error', (err) => {
                        console.error('[Proxy Error]', err.message);
                    });
                },
            },
        },
    },
})
