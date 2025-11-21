// AvilloOS Theme Switcher
'use client';

import { useState, useEffect } from 'react';

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <button
      className="px-4 py-2 bg-card border border-border rounded-xl text-foreground hover:scale-[1.03] transition-all"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      Toggle {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
