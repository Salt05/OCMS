import axios from 'axios';
import { router } from '@/router';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Only redirect if not already on login page to avoid infinite loops
      if (!window.location.pathname.includes('/login')) {
        router.push('/login');
      }
    }
    return Promise.reject(error);
  },
);

export { api };
