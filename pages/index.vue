<script setup lang="ts">
import HouseViewer from '~/components/HouseViewer.vue';
import { useAuth } from '~/composables/useAuth';

const editorEmail = 'marzev@gmail.com';
const email = ref(editorEmail);
const password = ref('1234');
const loading = ref(false);
const error = ref('');
const { user, logout, login } = useAuth();
const userRole = computed(() =>
  user.value?.email?.toLowerCase() === editorEmail.toLowerCase() ? 'Editor' : 'Viewer'
);
const theme = useState<'dark' | 'light'>('theme', () => 'dark');

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { statusMessage?: string } }).data;
    if (data?.statusMessage) return data.statusMessage;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

useHead(() => ({
  htmlAttrs: {
    'data-theme': theme.value
  }
}));

onMounted(() => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    theme.value = saved;
    return;
  }
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    theme.value = 'light';
  }
});

watch(theme, (value) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('theme', value);
});

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  try {
    await login({ email: email.value, password: password.value });
  } catch (err: unknown) {
    error.value = getErrorMessage(err, 'Login failed');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="page">
    <section v-if="!user" class="auth-card">
      <h1>Sign in</h1>
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" />
      </div>
      <div class="field">
        <label>Password</label>
        <input v-model="password" type="password" />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button :disabled="loading" @click="handleLogin" class="primary">
        {{ loading ? 'Signing in…' : 'Enter' }}
      </button>
    </section>

    <section v-else class="viewer-wrap">
      <header class="topbar">
        <div class="topbar-left">
          <div>
            <p class="muted">Signed in as</p>
            <p class="strong">{{ userRole }}</p>
            <p class="muted">{{ user.email }}</p>
          </div>
          <button type="button" class="ghost theme-toggle" @click="toggleTheme">
            {{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}
          </button>
        </div>
        <button type="button" @click="logout" class="ghost">Sign out</button>
      </header>
      <HouseViewer />
    </section>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-card {
  width: min(480px, 92vw);
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-card h1 {
  margin: 0 0 8px 0;
  font-size: 1.6rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.95rem;
}

.field input {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-bg-alt);
  color: var(--text-primary);
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
}

.primary {
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: var(--accent-gradient);
  color: var(--text-inverse);
  font-weight: 700;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.viewer-wrap {
  width: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.strong {
  margin: 2px 0 0 0;
  font-weight: 700;
}

.ghost {
  border: 1px solid var(--border);
  background: var(--panel-bg-alt);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.theme-toggle {
  font-weight: 600;
  white-space: nowrap;
}
</style>
