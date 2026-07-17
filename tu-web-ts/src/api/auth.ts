import { request } from './http';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  createdAt?: string | null;
}

export const DEV_LOCAL_USER: AuthUser = {
  id: 'dev-local-user',
  username: 'dev',
  email: 'dev@local',
  displayName: '本地开发用户',
};

export interface AuthResponse {
  user: AuthUser;
  tokenType: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  account: string;
  password: string;
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
