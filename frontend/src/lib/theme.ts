/* ═══════════════════════════════════════════════════════════════
   Tema boshqaruvi

   Standart — YORUG'. OS qorong'i rejimda tursa ham platforma yorug'
   ochiladi; qorong'ini foydalanuvchi o'zi tanlaydi va tanlovi saqlanadi.

   Ishlash tartibi:
     index.html dagi kichik skript birinchi bo'yoqdan OLDIN
     <html data-theme="..."> ni qo'yadi → tema sakrab o'zgarmaydi.
     Bu fayl esa keyinchalik almashtirish uchun.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'ap-theme';
export const DEFAULT_THEME: Theme = 'light';

/** localStorage o'chirilgan bo'lsa ham yiqilmaydi. */
function safeRead(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function safeWrite(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* incognito / bloklangan — xotirada qoladi, sahifa yangilansa yo'qoladi */
  }
}

/** <html> ga yozadi. color-scheme — scrollbar va native inputlar uchun. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', t);
  root.style.colorScheme = t;
}

/* ── kichik store: bir nechta tugma bo'lsa ham sinxron qoladi ── */

let current: Theme = typeof document === 'undefined' ? DEFAULT_THEME : safeRead();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): Theme {
  return current;
}

export function setTheme(t: Theme): void {
  if (t === current) return;
  current = t;
  safeWrite(t);
  applyTheme(t);
  listeners.forEach((fn) => fn());
}

/** React hook: [tema, almashtirish, o'rnatish] */
export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_THEME);
  const toggle = useCallback(() => {
    setTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, []);
  return { theme, toggle, set: setTheme };
}

/**
 * index.html skripti ishlamay qolgan holat uchun zaxira.
 * main.tsx da render'dan oldin chaqiriladi.
 */
export function initTheme(): void {
  current = safeRead();
  applyTheme(current);
}
