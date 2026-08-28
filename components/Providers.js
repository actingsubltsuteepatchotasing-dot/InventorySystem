"use client";

import { AuthProvider } from "@/lib/auth";
import { InventoryProvider } from "@/lib/store";
import { PrintProvider } from "./Print";
import { ToastProvider } from "./Toast";

export default function Providers({ children }) {
  return (
    <ToastProvider>
      <PrintProvider>
        <AuthProvider>
          <InventoryProvider>{children}</InventoryProvider>
        </AuthProvider>
      </PrintProvider>
    </ToastProvider>
  );
}
