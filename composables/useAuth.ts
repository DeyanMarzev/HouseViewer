import { useState } from '#imports';

type AuthUser = { email: string };

type LoginPayload = { email: string; password: string };

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

export function useAuth() {
  const state = useState<AuthState>('auth', () => ({ user: null, token: null }));

  const login = async (payload: LoginPayload) => {
    const res = await $fetch<{ user: AuthUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: payload
    });
    state.value = { user: res.user, token: res.token };
    return res.user;
  };

  const logout = () => {
    state.value = { user: null, token: null };
  };

  return {
    user: computed(() => state.value.user),
    token: computed(() => state.value.token),
    login,
    logout
  };
}
