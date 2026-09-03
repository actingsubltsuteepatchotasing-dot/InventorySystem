"use client";

import { AuthProvider } from "@/lib/auth";
import { InventoryProvider } from "@/lib/store";
import { PrintProvider } from "./Print";
import { ToastProvider } from "./Toast";
import { PWAProvider } from "./PWA";

export default function Providers({ children }) {
  return (
    <ToastProvider>
      <PWAProvider>
        <PrintProvider>
          <AuthProvider>
            <InventoryProvider>{children}</InventoryProvider>
          </AuthProvider>
        </PrintProvider>
      </PWAProvider>
    </ToastProvider>
  );
}
