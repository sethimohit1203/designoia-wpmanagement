import axios from 'axios';

// In local dev, Vite proxies '/api' to the backend (see vite.config.js).
// In production (Vercel), set VITE_API_URL to your deployed backend's base URL,
// e.g. https://your-backend.up.railway.app/api
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL, timeout: 180000 });

export default api;
