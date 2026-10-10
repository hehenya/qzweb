// 主题三态:system(跟随 prefers-color-scheme)/ light / dark。
// adwaita-web 的样式表在 html 上识别 .theme-light / .theme-dark 手动覆盖类,
// 不加类时自动跟随系统,所以 system 态只需移除两个类。

const STORAGE_KEY = 'qzweb_theme';

export function getThemeMode() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyTheme(mode) {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (mode === 'light' || mode === 'dark') {
        root.classList.add(`theme-${mode}`);
    }
    localStorage.setItem(STORAGE_KEY, mode);
    return mode;
}

// 在 系统 → 亮色 → 暗色 之间循环,返回新模式
export function cycleThemeMode(current) {
    return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}
