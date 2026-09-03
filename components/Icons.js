// ไอคอน inline SVG ทั้งหมด (ไม่พึ่งไลบรารีภายนอก)

function Ico({ size = 18, stroke = 2, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IcDash = (p) => (
  <Ico {...p}><path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z" /></Ico>
);
export const IcIn = (p) => (
  <Ico {...p}><path d="M12 3v13M6 11l6 6 6-6M4 21h16" /></Ico>
);
export const IcOut = (p) => (
  <Ico {...p}><path d="M12 21V8M6 13l6-6 6 6M4 3h16" /></Ico>
);
export const IcMove = (p) => (
  <Ico {...p}><path d="M4 8h13l-3-3M20 16H7l3 3" /></Ico>
);
export const IcAdjust = (p) => (
  <Ico {...p}><path d="M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3M20 18h-6" /></Ico>
);
export const IcBox = (p) => (
  <Ico {...p}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></Ico>
);
export const IcMap = (p) => (
  <Ico {...p}><path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3z" /><path d="M9 3v15M15 6v15" /></Ico>
);
export const IcReport = (p) => (
  <Ico {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </Ico>
);
export const IcChart = (p) => (
  <Ico {...p}><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></Ico>
);
export const IcPin = (p) => (
  <Ico {...p}>
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </Ico>
);
export const IcPlus = (p) => <Ico stroke={2.4} {...p}><path d="M12 5v14M5 12h14" /></Ico>;
export const IcClose = (p) => <Ico stroke={2.2} {...p}><path d="M18 6L6 18M6 6l12 12" /></Ico>;
export const IcTrash = (p) => (
  <Ico stroke={2.2} {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Ico>
);
export const IcCheck = (p) => <Ico stroke={3} {...p}><path d="M20 6L9 17l-5-5" /></Ico>;
export const IcMenu = (p) => <Ico {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Ico>;
export const IcData = (p) => (
  <Ico {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </Ico>
);
export const IcCart = (p) => (
  <Ico {...p}>
    <circle cx="9" cy="20" r="1.6" />
    <circle cx="18" cy="20" r="1.6" />
    <path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
  </Ico>
);
export const IcGrid = (p) => (
  <Ico {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Ico>
);
export const IcChat = (p) => (
  <Ico {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-2.9-.4L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
  </Ico>
);
export const IcSend = (p) => (
  <Ico {...p}><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" /></Ico>
);
export const IcSparkle = (p) => (
  <Ico {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </Ico>
);
export const IcDownload = (p) => (
  <Ico {...p}>
    <path d="M12 3v12M7 11l5 5 5-5" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5" />
  </Ico>
);
export const IcPrint = (p) => (
  <Ico {...p}>
    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 14h12v8H6z" />
  </Ico>
);

/** ตราสัญลักษณ์โปรแกรม (ใบไม้ในวงกลม) */
export function Logo({ size = 36, ring = "var(--brand)", leaf = "var(--accent)", vein = "var(--brand-d)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={ring} />
      <path d="M32 13c-9 6-14 13-14 21a14 14 0 0 0 28 0c0-8-5-15-14-21z" fill={leaf} />
      <path d="M32 18v30M32 30l7-6M32 38l-7-6" stroke={vein} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
