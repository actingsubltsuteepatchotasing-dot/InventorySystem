"use client";

// ธีมสีของโปรแกรม — เขียว / ฟ้า / ม่วง
//
// เก็บค่าไว้ใน localStorage ของเครื่องนั้น ไม่ได้เก็บบนฐานข้อมูล
// แต่ละคนจึงเลือกสีของตัวเองได้โดยไม่กระทบคนอื่น

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "green", name: "เขียว", color: "#00693c" },
  { id: "blue", name: "ฟ้า", color: "#0b5fa5" },
  { id: "purple", name: "ม่วง", color: "#6b3fa0" },
];

export const THEME_KEY = "ultra-theme";
export const DEFAULT_THEME = "green";

/** สีที่ใช้กับ meta theme-color (แถบบนของเบราว์เซอร์บนมือถือ) */
const META_COLOR = {
  green: "#00693C",
  blue: "#0B5FA5",
  purple: "#6B3FA0",
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  // อ่านค่าหลัง mount เท่านั้น อ่านตอน render จะพังตอน server render
  // ส่วนการกันจอกะพริบเป็นสีเขียวก่อน ใช้สคริปต์เล็ก ๆ ใน layout.js แทน
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved && THEMES.some((t) => t.id === saved)) setThemeState(saved);
    } catch (e) {
      // เบราว์เซอร์ปิด storage — ใช้ธีมเริ่มต้นไป
    }
  }, []);

  const setTheme = useCallback((id) => {
    if (!THEMES.some((t) => t.id === id)) return;
    setThemeState(id);
    try {
      window.localStorage.setItem(THEME_KEY, id);
    } catch (e) {
      // เก็บไม่ได้ก็ยังเปลี่ยนสีได้ แค่จำข้ามครั้งไม่ได้
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // ธีมเขียวคือค่าเริ่มต้นใน :root จึงไม่ต้องตั้ง attribute
    if (theme === DEFAULT_THEME) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", META_COLOR[theme] || META_COLOR.green);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme ต้องอยู่ภายใน ThemeProvider");
  return ctx;
}

/** ปุ่มวงกลมสามสีบนแถบบน */
export function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className="theme-pick" role="group" aria-label="โทนสีของโปรแกรม">
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          className="theme-dot"
          style={{ "--c": t.color }}
          aria-pressed={theme === t.id}
          aria-label={"ธีมสี" + t.name}
          title={"ธีมสี" + t.name}
          onClick={() => setTheme(t.id)}
        />
      ))}
    </div>
  );
}
