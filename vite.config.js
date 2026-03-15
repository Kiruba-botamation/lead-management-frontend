import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    
    const serverPort = parseInt(env.VITE_DEV_SERVER_PORT || '3001')
    const serverHost = env.VITE_DEV_SERVER_HOST || 'localhost'
    const apiTarget = env.VITE_API_TARGET || 'http://localhost:8081'
    const cookieDomain = env.VITE_COOKIE_DOMAIN || 'localhost'

    return {
        plugins: [react()],
        server: {
            host: serverHost,
            port: serverPort,
            proxy: {
                // Forward all /api requests to the backend (avoids CORS in dev)
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                    secure: false,
                    // Rewrite cookie domain in backend responses so the browser
                    // stores them under localhost and sends them on the next request
                    cookieDomainRewrite: { '*': cookieDomain },
                    configure: (proxy) => {
                        // Explicitly forward the Cookie header on every proxied request
                        proxy.on('proxyReq', (proxyReq, req) => {
                            if (req.headers.cookie) {
                                proxyReq.setHeader('Cookie', req.headers.cookie);
                            }
                            console.log(`[Proxy] ${req.method} ${req.url} -> ${apiTarget}${req.url}`);
                        });
                        proxy.on('error', (err) => {
                            console.error('[Proxy Error]', err.message);
                        });
                    },
                },
            },
        },
    }
})
