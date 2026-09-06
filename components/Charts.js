"use client";

// กราฟ inline SVG เขียนเอง — ไม่ใช้ Chart.js หรือไลบรารีกราฟใด ๆ

import { ellipsis, num } from "@/lib/format";

/** กราฟแท่งกลุ่ม — เปรียบเทียบหลายชุดข้อมูลต่อหนึ่งช่วงเวลา */
export function BarChart({ series, labels, height = 260 }) {
  const W = 760;
  const PL = 62, PR = 14, PT = 14, PB = 34;
  const iw = W - PL - PR;
  const ih = height - PT - PB;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const step = iw / Math.max(1, labels.length);
  const gw = step * 0.68;
  const bw = gw / series.length;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = PT + ih - (ih * i) / 4;
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#DDE5E0" strokeWidth="1" />
            <text x={PL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8A978F">
              {num(Math.round((max * i) / 4), 0)}
            </text>
          </g>
        );
      })}

      {labels.map((lb, i) => {
        const cx = PL + step * i + step / 2;
        return (
          <g key={i}>
            {series.map((s, si) => {
              const v = s.data[i] || 0;
              const h = (v / max) * ih;
              const x = cx - gw / 2 + bw * si;
              return (
                <rect
                  key={si}
                  x={x}
                  y={PT + ih - h}
                  width={Math.max(1, bw - 2)}
                  height={Math.max(0, h)}
                  fill={s.color}
                  rx="2.5"
                >
                  <title>{`${lb} · ${s.name}: ${num(v, 0)}`}</title>
                </rect>
              );
            })}
            <text x={cx} y={height - 12} textAnchor="middle" fontSize="11" fill="#5C6B62">
              {lb}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** กราฟเส้นพร้อมพื้นที่ใต้กราฟ — แนวโน้มยอดคงเหลือ */
export function LineChart({ data, labels, color = "var(--brand)", height = 250 }) {
  const W = 760;
  const PL = 66, PR = 14, PT = 14, PB = 34;
  const iw = W - PL - PR;
  const ih = height - PT - PB;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const span = Math.max(1, max - min);

  const px = (i) => PL + (labels.length < 2 ? iw / 2 : (iw * i) / (labels.length - 1));
  const py = (v) => PT + ih - ((v - min) / span) * ih;
  const pts = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = PT + ih - (ih * i) / 4;
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#DDE5E0" />
            <text x={PL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8A978F">
              {num(Math.round(min + (span * i) / 4), 0)}
            </text>
          </g>
        );
      })}

      {data.length > 0 ? (
        <>
          <polygon
            points={`${PL},${PT + ih} ${pts} ${px(data.length - 1).toFixed(1)},${PT + ih}`}
            fill={color}
            opacity="0.13"
          />
          <polyline
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}

      {data.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r="4" fill="#fff" stroke={color} strokeWidth="2.4">
          <title>{`${labels[i]}: ${num(v, 0)}`}</title>
        </circle>
      ))}

      {labels.map((lb, i) => (
        <text key={i} x={px(i)} y={height - 12} textAnchor="middle" fontSize="11" fill="#5C6B62">
          {lb}
        </text>
      ))}
    </svg>
  );
}

/** กราฟแท่งแนวนอน — จัดอันดับ */
export function HBarChart({ items }) {
  const W = 760;
  const rowH = 30;
  const H = Math.max(90, items.length * rowH + 20);
  const PL = 165, PR = 70;
  const iw = W - PL - PR;
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {items.map((it, i) => {
        const y = 10 + i * rowH;
        const w = (it.value / max) * iw;
        return (
          <g key={i}>
            <text x={PL - 10} y={y + 15} textAnchor="end" fontSize="12" fill="#16211B">
              {ellipsis(it.label, 22)}
            </text>
            <rect x={PL} y={y + 4} width={iw} height="16" fill="#EAF5EF" rx="4" />
            <rect x={PL} y={y + 4} width={Math.max(2, w)} height="16" fill={it.color || "var(--brand)"} rx="4">
              <title>{`${it.label}: ${num(it.value, 0)}`}</title>
            </rect>
            <text x={PL + iw + 8} y={y + 16} fontSize="11.5" fill="#5C6B62">
              {num(it.value, 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * กราฟโดนัท — ใช้ดูสัดส่วนว่าอะไรกินส่วนแบ่งเท่าไร
 *
 * เหมาะกับ "ส่วนแบ่งของทั้งหมด" ไม่เหมาะกับการเทียบค่าที่ใกล้เคียงกัน
 * เพราะตาคนเทียบมุมของวงกลมได้แย่กว่าเทียบความยาวของแท่งมาก
 * จึงเขียนตัวเลขและเปอร์เซ็นต์กำกับไว้ทุกชิ้น ไม่ให้ต้องกะเอาจากมุม
 *
 * เกิน 8 ชิ้นจะยุบส่วนที่เหลือเป็น "อื่น ๆ" ชิ้นเดียว
 * เพราะชิ้นบาง ๆ สิบกว่าชิ้นอ่านไม่ออกและสีจะซ้ำกันจนแยกไม่ได้
 */
export function DonutChart({ items, max = 8 }) {
  const clean = (items || []).filter((i) => Number(i.value) > 0);
  const sorted = clean.slice().sort((a, b) => b.value - a.value);

  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (rest.length) {
    shown.push({
      label: "อื่น ๆ (" + rest.length + " รายการ)",
      value: rest.reduce((s, x) => s + x.value, 0),
      color: "#9AA5A0",
    });
  }

  const total = shown.reduce((s, x) => s + x.value, 0);
  if (!total) return null;

  const W = 760;
  const H = 300;
  const cx = 150;
  const cy = H / 2;
  const R = 108;
  const r = 62;

  // วาดทีละชิ้นด้วย path arc — ไม่ใช้ stroke-dasharray เพราะคุมช่องว่างระหว่างชิ้นยาก
  let at = -Math.PI / 2; // เริ่มที่ตำแหน่งสิบสองนาฬิกา ตาคนเริ่มอ่านตรงนั้น
  const arcs = shown.map((it) => {
    const frac = it.value / total;
    const a0 = at;
    const a1 = at + frac * Math.PI * 2;
    at = a1;

    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const [x0, y0] = p(a0, R);
    const [x1, y1] = p(a1, R);
    const [x2, y2] = p(a1, r);
    const [x3, y3] = p(a0, r);

    // ชิ้นเดียวเต็มวง วาดเป็น arc ไม่ได้ (จุดเริ่มกับจุดจบทับกัน) ใช้วงแหวนแทน
    const d =
      frac >= 0.9999
        ? "M " + (cx - R) + " " + cy +
          " a " + R + " " + R + " 0 1 0 " + R * 2 + " 0 a " + R + " " + R + " 0 1 0 " + -R * 2 + " 0 " +
          "M " + (cx - r) + " " + cy +
          " a " + r + " " + r + " 0 1 1 " + r * 2 + " 0 a " + r + " " + r + " 0 1 1 " + -r * 2 + " 0"
        : "M " + x0 + " " + y0 +
          " A " + R + " " + R + " 0 " + big + " 1 " + x1 + " " + y1 +
          " L " + x2 + " " + y2 +
          " A " + r + " " + r + " 0 " + big + " 0 " + x3 + " " + y3 + " Z";

    return { ...it, d, frac };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color || "var(--brand)"} fillRule="evenodd">
          <title>{`${a.label}: ${num(a.value, 0)} (${num(a.frac * 100, 1)}%)`}</title>
        </path>
      ))}

      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" fill="#5C6B62">
        รวม
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="17" fontWeight="700" fill="#16211B">
        {num(total, 0)}
      </text>

      {/* คำอธิบายอยู่ข้าง ๆ พร้อมตัวเลข ไม่ให้ต้องกะสัดส่วนจากมุมเอง */}
      {arcs.map((a, i) => {
        const y = 34 + i * 28;
        return (
          <g key={"l" + i}>
            <rect x={310} y={y - 11} width={13} height={13} rx={3} fill={a.color || "var(--brand)"} />
            <text x={332} y={y} fontSize="12.5" fill="#16211B">
              {ellipsis(a.label, 30)}
            </text>
            <text x={W - 10} y={y} textAnchor="end" fontSize="12.5" fill="#5C6B62">
              {num(a.value, 0)} · {num(a.frac * 100, 1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** คำอธิบายสีของกราฟ */
export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i}>
          <i style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}
