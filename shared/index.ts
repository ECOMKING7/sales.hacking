// Shared types and constants used by both backend and frontend.

export const API_BASE_URL = '/api';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}
