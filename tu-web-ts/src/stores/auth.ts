import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  login,
  register,
  DEV_LOCAL_USER,
  type AuthResponse,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload,
} from '@/api/auth';

const STORAGE_KEY = 'tu.auth.user';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistUser(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(readStoredUser());
  const loading = ref(false);

  const isLoggedIn = computed(() => Boolean(user.value));
  const displayName = computed(() => {
    if (!user.value) return '';
    return user.value.displayName || user.value.username || user.value.email;
  });

  function applyAuthResponse(response: AuthResponse) {
    user.value = response.user;
    persistUser(response.user);
  }

  async function registerUser(payload: RegisterPayload) {
    loading.value = true;
    try {
      const response = await register(payload);
      applyAuthResponse(response);
      return response.user;
    } finally {
      loading.value = false;
    }
  }

  async function loginUser(payload: LoginPayload) {
    loading.value = true;
    try {
      const response = await login(payload);
      applyAuthResponse(response);
      return response.user;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    user.value = null;
    persistUser(null);
  }

  /** Dev-only: seed a local user so per-user UI prefs can persist without login. */
  function ensureDevAuthUser() {
    if (!import.meta.env.DEV) return;
    if (user.value) return;
    user.value = DEV_LOCAL_USER;
    persistUser(DEV_LOCAL_USER);
  }

  return {
    user,
    loading,
    isLoggedIn,
    displayName,
    registerUser,
    loginUser,
    logout,
    ensureDevAuthUser,
  };
});
