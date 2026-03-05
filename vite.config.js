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
                // Rewrite cookie domain in backend responses so the browser
                // stores them under localhost and sends them on the next request
                cookieDomainRewrite: { '*': 'localhost' },
                configure: (proxy) => {
                    // Explicitly forward the Cookie header on every proxied request
                    proxy.on('proxyReq', (proxyReq, req) => {
                        if (req.headers.cookie) {
                            proxyReq.setHeader('Cookie', req.headers.cookie);
                        }
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
