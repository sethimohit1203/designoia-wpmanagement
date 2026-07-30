import axios from 'axios';

// In local dev, Vite proxies '/api' to the backend (see vite.config.js).
// In production (Vercel), set VITE_API_URL to your deployed backend's base URL,
// e.g. https://your-backend.up.railway.app/api
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL, timeout: 180000 });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      sessionStorage.removeItem('token');
      // Full reload so App.jsx re-evaluates auth state and shows Login.
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
