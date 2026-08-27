"use client";

import { InventoryProvider } from "@/lib/store";
import { PrintProvider } from "./Print";
import { ToastProvider } from "./Toast";

export default function Providers({ children }) {
  return (
    <ToastProvider>
      <PrintProvider>
        <InventoryProvider>{children}</InventoryProvider>
      </PrintProvider>
    </ToastProvider>
  );
}
