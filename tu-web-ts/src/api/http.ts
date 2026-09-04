export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

function currentUserId(): string {
  try {
    const raw = localStorage.getItem('tu.auth.user');
    if (!raw) return 'dev-local-user';
    const value = JSON.parse(raw) as { id?: unknown };
    return typeof value.id === 'string' && value.id.trim() ? value.id : 'dev-local-user';
  } catch {
    return 'dev-local-user';
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': currentUserId(),
      ...(init?.headers || {}),
    },
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`);
  }

  if (!payload) {
    return undefined as T;
  }

  if (payload.code !== 0) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload.data;
}
