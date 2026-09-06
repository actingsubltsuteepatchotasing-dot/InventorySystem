"use client";

// ตัวเลือกฟอร์มพิมพ์ ใช้ร่วมกันทุกหน้าจอที่พิมพ์เอกสารการค้า
//
// ซ่อนตัวเองเมื่อยังไม่มีใครออกแบบฟอร์มไว้เลย
//   หน้าจอส่วนใหญ่มีปุ่มแน่นอยู่แล้ว การโผล่ช่องที่มีตัวเลือกเดียวมีแต่ทำให้รก
//   พอผู้ใช้ไปสร้างฟอร์มที่หน้าออกแบบฟอร์ม ช่องนี้จะโผล่มาเองทุกหน้าที่พิมพ์ชนิดนั้น

import { useInv } from "@/lib/store";
import { formsOf } from "@/lib/printForms";

export default function FormPick({ kind, value, onChange, disabled }) {
  const inv = useInv();
  const list = formsOf(inv.db, kind);
  if (!list.length) return null;

  const group = inv.docGroup(kind);
  const bound = group && group.formId ? list.find((f) => f.id === group.formId) : null;
  const auto = bound || list.find((f) => f.isDefault);

  return (
    <select
      className="sel"
      style={{ width: 200, height: 32, padding: "0 8px", fontSize: 13 }}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title="ฟอร์มที่จะใช้พิมพ์เอกสารนี้"
    >
      <option value="">ฟอร์ม: {auto ? auto.name : "มาตรฐาน"} (อัตโนมัติ)</option>
      {list.map((f) => (
        <option key={f.id} value={f.id}>
          ฟอร์ม: {f.name}
        </option>
      ))}
    </select>
  );
}
