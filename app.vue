<template>
  <div class="app-root">
    <NuxtPage />
  </div>
</template>

<style>
:root {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color-scheme: dark;
  --bg-page: #0b1221;
  --panel-bg: #0f172a;
  --panel-bg-alt: #111827;
  --panel-bg-strong: #0b1221;
  --panel-bg-glass: rgba(15, 23, 42, 0.7);
  --panel-bg-glass-strong: rgba(15, 23, 42, 0.96);
  --panel-bg-elevated: rgba(17, 24, 39, 0.8);
  --panel-bg-hover: rgba(15, 23, 42, 0.6);
  --border: #1f2937;
  --border-strong: #334155;
  --border-soft: rgba(51, 65, 85, 0.8);
  --text-primary: #e5e7eb;
  --text-muted: #94a3b8;
  --text-soft: #cbd5f5;
  --text-inverse: #0b1221;
  --accent-1: #22d3ee;
  --accent-2: #34d399;
  --accent-strong: #38bdf8;
  --accent-gradient: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  --accent-shadow: 0 8px 20px rgba(56, 189, 248, 0.2);
  --link: #34d399;
  --notice-border: rgba(56, 189, 248, 0.35);
  --notice-bg: rgba(59, 130, 246, 0.08);
  --notice-error-border: rgba(248, 113, 113, 0.45);
  --notice-error-bg: rgba(239, 68, 68, 0.15);
  --notice-error-text: #fecaca;
  --danger: #f87171;
  --danger-border: #ef4444;
  --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-bg-hover: rgba(239, 68, 68, 0.2);
  --overlay-bg: rgba(15, 23, 42, 0.7);
  --overlay-error-bg: rgba(248, 113, 113, 0.8);
  --context-bg: rgba(15, 23, 42, 0.96);
  --context-hover: rgba(51, 65, 85, 0.7);
  --marker-bg: rgba(16, 185, 129, 0.85);
  --marker-active-bg: rgba(56, 189, 248, 0.9);
  --marker-text: #0f172a;
  --viewer-bg: radial-gradient(circle at 20% 20%, rgba(52, 211, 153, 0.05), transparent 30%),
    radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.05), transparent 25%), #0b1221;
  --elements-selected-bg: #bae6fd;
  --elements-selected-text: #0b1221;
  --resizer-gradient: linear-gradient(180deg, rgba(34, 211, 238, 0.15), rgba(15, 23, 42, 0.8));
  --resizer-gradient-hover: linear-gradient(180deg, rgba(52, 211, 153, 0.3), rgba(14, 165, 233, 0.3));
  --shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 10px 30px rgba(52, 211, 153, 0.3);
  --shadow-context: 0 12px 30px rgba(0, 0, 0, 0.45);
  --shadow-marker: 0 10px 25px rgba(0, 0, 0, 0.35);
  --swatch-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

:root[data-theme='light'] {
  color-scheme: light;
  --bg-page: #f8fafc;
  --panel-bg: #ffffff;
  --panel-bg-alt: #f1f5f9;
  --panel-bg-strong: #e2e8f0;
  --panel-bg-glass: rgba(255, 255, 255, 0.7);
  --panel-bg-glass-strong: rgba(255, 255, 255, 0.96);
  --panel-bg-elevated: rgba(226, 232, 240, 0.8);
  --panel-bg-hover: rgba(226, 232, 240, 0.75);
  --border: #cbd5e1;
  --border-strong: #94a3b8;
  --border-soft: rgba(148, 163, 184, 0.8);
  --text-primary: #0f172a;
  --text-muted: #475569;
  --text-soft: #1e293b;
  --text-inverse: #0b1221;
  --accent-1: #22d3ee;
  --accent-2: #34d399;
  --accent-strong: #38bdf8;
  --link: #0f766e;
  --notice-border: rgba(14, 116, 144, 0.35);
  --notice-bg: rgba(14, 116, 144, 0.08);
  --notice-error-border: rgba(239, 68, 68, 0.45);
  --notice-error-bg: rgba(248, 113, 113, 0.18);
  --notice-error-text: #7f1d1d;
  --danger: #dc2626;
  --danger-border: #ef4444;
  --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-bg-hover: rgba(239, 68, 68, 0.2);
  --overlay-bg: rgba(248, 250, 252, 0.8);
  --overlay-error-bg: rgba(248, 113, 113, 0.85);
  --context-bg: rgba(255, 255, 255, 0.96);
  --context-hover: rgba(226, 232, 240, 0.9);
  --marker-bg: rgba(16, 185, 129, 0.85);
  --marker-active-bg: rgba(14, 165, 233, 0.9);
  --marker-text: #0f172a;
  --viewer-bg: radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.12), transparent 30%),
    radial-gradient(circle at 80% 0%, rgba(16, 185, 129, 0.1), transparent 25%), #f8fafc;
  --elements-selected-bg: #bae6fd;
  --elements-selected-text: #0b1221;
  --resizer-gradient: linear-gradient(180deg, rgba(14, 165, 233, 0.25), rgba(226, 232, 240, 0.95));
  --resizer-gradient-hover: linear-gradient(180deg, rgba(34, 197, 94, 0.25), rgba(14, 165, 233, 0.25));
  --shadow-lg: 0 20px 60px rgba(15, 23, 42, 0.15);
  --shadow-md: 0 10px 30px rgba(14, 116, 144, 0.2);
  --shadow-context: 0 12px 30px rgba(15, 23, 42, 0.12);
  --shadow-marker: 0 10px 25px rgba(15, 23, 42, 0.2);
  --swatch-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

body {
  margin: 0;
  background: var(--bg-page);
  color: var(--text-primary);
}

.app-root {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
}

button {
  cursor: pointer;
}
</style>
