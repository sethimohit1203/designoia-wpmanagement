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

// ⚠️ Reload-on-401 is disabled while dashboard auth is off (see server.js) — with
// no login gate, forcing a reload on 401 just causes a refresh loop (e.g. while
// DNS is still migrating and some requests transiently hit a stale old backend
// that still enforces auth). Restore this whenever auth enforcement comes back.
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default api;
