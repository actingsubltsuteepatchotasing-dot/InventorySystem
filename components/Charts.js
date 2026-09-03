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
