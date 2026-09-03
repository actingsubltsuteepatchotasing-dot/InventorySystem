import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "ระบบควบคุมสินค้าคงคลัง | การยางแห่งประเทศไทย",
  description:
    "ระบบควบคุมสินค้าคงคลัง (Inventory Control) — รับ / เบิก / โอน / ปรับปรุงสินค้า พร้อมรายงานและกราฟสรุป",
  applicationName: "คลังสินค้า กยท.",
  // iOS ไม่อ่าน manifest จึงต้องบอกผ่าน meta แยก
  appleWebApp: {
    capable: true,
    title: "คลังสินค้า กยท.",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00693C",
  // เผื่อพื้นที่ให้ notch/ขอบจอโค้งตอนเปิดแบบเต็มจอ
  viewportFit: "cover",
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
