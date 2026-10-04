export const THEME_STORAGE_KEY = "evolvnex-theme";
export const DEFAULT_THEME = "dark" as const;

export type ThemeName = "dark" | "light";

export function isThemeName(value: unknown): value is ThemeName {
  return value === "dark" || value === "light";
}

export function readStoredTheme(): ThemeName {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(theme: ThemeName) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function applyThemeClass(theme: ThemeName) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export const THEME_INIT_SCRIPT = `(function(){try{var stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var theme=stored==="light"?"light":"dark";var root=document.documentElement;root.classList.remove("dark","light");root.classList.add(theme);root.style.colorScheme=theme;}catch(e){document.documentElement.classList.add("dark");}})();`;
