"use client";

import { AuthProvider } from "@/lib/auth";
import { InventoryProvider } from "@/lib/store";
import { PrintProvider } from "./Print";
import { ToastProvider } from "./Toast";
import { PWAProvider } from "./PWA";
import { ThemeProvider } from "./Theme";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PWAProvider>
          <PrintProvider>
            <AuthProvider>
              <InventoryProvider>{children}</InventoryProvider>
            </AuthProvider>
          </PrintProvider>
        </PWAProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
