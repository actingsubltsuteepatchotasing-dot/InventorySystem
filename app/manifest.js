// Web App Manifest — Next.js จะเสิร์ฟที่ /manifest.webmanifest
// และแทรก <link rel="manifest"> ให้เองอัตโนมัติ

export default function manifest() {
  return {
    name: "One for All Ultra — หนึ่งเดียวเพื่อทุกสิ่ง",
    // Android ตัดชื่อที่ยาวเกินราว 12 ตัวอักษรบนหน้าจอโฮม จึงใช้ตัวย่อ
    short_name: "OFAU",
    description:
      "One for All Ultra (OFAU) หนึ่งเดียวเพื่อทุกสิ่ง — สินค้าคงคลัง งานซื้อ งานขาย " +
      "การจัดส่ง งานลูกค้าสัมพันธ์ และรายงาน ครบในระบบเดียว",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // ไม่ล็อกแนวหน้าจอ เพราะใช้ทั้งบนมือถือ แท็บเล็ต และคอมพิวเตอร์
    orientation: "any",
    background_color: "#f4f7f5",
    theme_color: "#00693C",
    lang: "th",
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // maskable ให้ Android ครอบเป็นวงกลม/สี่เหลี่ยมมนได้โดยโลโก้ไม่โดนตัด
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
