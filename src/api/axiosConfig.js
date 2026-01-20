import axios from 'axios';

// Build base URL from environment variables (Vite uses import.meta.env)
const API_HOST = import.meta.env.VITE_API_HOST || 'http://localhost';
const API_PORT = import.meta.env.VITE_API_PORT || '8083';
const BASE_URL = API_PORT ? `${API_HOST}:${API_PORT}` : API_HOST;

// Auth service URL (go through backend, not directly to external auth)
const AUTH_SERVICE_URL = import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:8083';

// Create axios instance
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // CRITICAL: Send cookies with every request
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - DON'T redirect here, let AuthContext handle it
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        // Just reject the error - AuthContext will handle 401s
        // No automatic redirect here to prevent loops
        console.log('API Error:', error.response?.status, error.message);
        return Promise.reject(error);
    }
);

export default api;
export { AUTH_SERVICE_URL, BASE_URL };
