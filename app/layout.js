import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "ระบบควบคุมสินค้าคงคลัง | การยางแห่งประเทศไทย",
  description:
    "ระบบควบคุมสินค้าคงคลัง (Inventory Control) — รับ / เบิก / โอน / ปรับปรุงสินค้า พร้อมรายงานและกราฟสรุป",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00693C",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
