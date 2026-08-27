// ส่งออกตารางเป็นไฟล์ CSV (มี BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง)

export function downloadCSV(headers, rows, filename) {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [headers.map(q).join(",")].concat(rows.map((r) => r.map(q).join(",")));
  const csv = "﻿" + lines.join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** ส่งออกข้อมูลทั้งชุดเป็นไฟล์สำรอง JSON */
export function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
