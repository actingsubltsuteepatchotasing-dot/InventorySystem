import "./globals.css";
import Providers from "@/components/Providers";

const TITLE = "Ultra ERP — ระบบควบคุมสินค้าคงคลัง";
const DESCRIPTION =
  "ระบบควบคุมสินค้าคงคลัง (Inventory Control) — รับ / เบิก / โอน / ปรับปรุงสินค้า พร้อมรายงานและกราฟสรุป";

/**
 * ที่อยู่เว็บสำหรับทำ URL แบบเต็มใน og:image และ og:url
 *
 * LINE, Facebook และ X ไม่ยอมรับ path แบบสัมพัทธ์ ต้องเป็น URL เต็มเท่านั้น
 * ถ้าไม่ตั้งค่าอะไรเลยตอน build บน Vercel จะได้โดเมนของ Vercel มาให้อัตโนมัติ
 * แต่ถ้าใช้โดเมนของตัวเอง ต้องตั้ง NEXT_PUBLIC_SITE_URL ไม่งั้นพรีวิวจะชี้ผิดโดเมน
 */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  // VERCEL_PROJECT_PRODUCTION_URL คือโดเมน production ที่คงที่
  // ส่วน VERCEL_URL เปลี่ยนทุก deploy จึงใช้เป็นตัวสำรองเท่านั้น
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return "https://" + vercel;

  return "http://localhost:3000";
}

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Ultra ERP",
  // iOS ไม่อ่าน manifest จึงต้องบอกผ่าน meta แยก
  appleWebApp: {
    capable: true,
    title: "Ultra ERP",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // การ์ดพรีวิวตอนแชร์ลิงก์ใน LINE / Facebook / X
  // LINE อ่าน og:* อย่างเดียว ไม่อ่าน twitter:* จึงต้องมี og ให้ครบ
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: "/",
    siteName: "Ultra ERP",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Ultra ERP — ระบบควบคุมสินค้าคงคลัง",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
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
        {/*
          ตั้งธีมก่อนเบราว์เซอร์วาดครั้งแรก ไม่งั้นจะเห็นสีเริ่มต้นแวบหนึ่ง
          ก่อนที่ React จะ mount แล้วค่อยเปลี่ยนเป็นสีที่ผู้ใช้เลือกไว้
          ห่อ try ไว้เพราะโหมดส่วนตัวบางเบราว์เซอร์อ่าน localStorage ไม่ได้
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('ultra-theme');" +
              "if(t==='blue'||t==='purple')document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
