// ย่อรูปภาพด้วย canvas ก่อนเก็บลง localStorage เพื่อไม่ให้พื้นที่จัดเก็บเต็ม

const MAX_SIDE = 480;
const QUALITY = 0.82;

/**
 * อ่านไฟล์รูป ย่อขนาด แล้วคืนค่าเป็น data URL
 * @param {File} file
 * @returns {Promise<string>}
 */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error("กรุณาเลือกไฟล์รูปภาพ"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ไฟล์รูปภาพเสียหาย"));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h && w > MAX_SIDE) {
          h = Math.round((h * MAX_SIDE) / w);
          w = MAX_SIDE;
        } else if (h > MAX_SIDE) {
          w = Math.round((w * MAX_SIDE) / h);
          h = MAX_SIDE;
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
