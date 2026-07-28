"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Toggle dark mode — lưu localStorage, áp class `dark` lên <html>. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("admin_theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("admin_theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent"
      title={dark ? "Chuyển sáng" : "Chuyển tối"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
