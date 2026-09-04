"use client";

// แผนที่ปักหมุด — ลากเลื่อน ซูม และคลิกวางหมุดได้
//
// เขียนเองด้วย <img> ของ tile ตรง ๆ ไม่ได้ใช้ไลบรารีแผนที่
// (เหตุผลเดียวกับกราฟและบาร์โค๊ดในโปรเจกต์นี้ — ไม่เพิ่ม dependency)
//
// ต่างจากแผนที่ Google Maps Embed ที่ใช้แสดงผลอย่างเดียวตรงที่อันนั้นเป็น iframe
// ข้ามโดเมน จึงรู้ไม่ได้เลยว่าผู้ใช้คลิกตรงไหน ปักหมุดเองไม่ได้

import { useEffect, useRef, useState } from "react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TILE,
  latToY,
  lngToX,
  round6,
  tileURL,
  xToLng,
  yToLat,
} from "@/lib/geo";
import { IcPin } from "./Icons";

/** ลากได้ไม่เกินกี่พิกเซลจึงยังนับว่าเป็นการ "คลิก" ไม่ใช่ "ลาก" */
const CLICK_SLOP = 4;

export default function MapPicker({ lat, lng, zoom, onChange, onZoom, height = 380 }) {
  const boxRef = useRef(null);

  /** ขนาดพื้นที่แผนที่จริง วัดจาก DOM เพราะความกว้างยืดตามจอ */
  const [size, setSize] = useState({ w: 0, h: height });

  /** จุดกึ่งกลางของภาพที่เห็น — คนละเรื่องกับตำแหน่งหมุด เลื่อนดูรอบ ๆ ได้โดยหมุดไม่ขยับ */
  const [center, setCenter] = useState({ lat, lng });

  /*
   * สถานะการลากเก็บใน ref ไม่ใช่ state
   * ทุก pointermove ที่ทำให้ re-render จะกระตุกมาก และค่าเหล่านี้ไม่ต้องแสดงผล
   */
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  /*
   * จำหมุดที่ "เราเป็นคนขยับเอง" ไว้
   *
   * หมุดถูกย้ายจากข้างนอก (เลือกผลค้นหา / พิมพ์พิกัด) ต้องเลื่อนภาพไปหาให้
   * แต่ถ้าผู้ใช้คลิกวางหมุดที่มุมภาพเอง แล้วเราเลื่อนภาพตาม ภาพจะกระโดดทุกครั้งที่คลิก
   * ซึ่งน่ารำคาญมากตอนเล็งตำแหน่งละเอียด ๆ
   */
  const selfMove = useRef("");

  /** ขยับหมุดโดยไม่ให้ภาพเลื่อนตาม */
  function emit(next) {
    selfMove.current = next.lat + "," + next.lng;
    onChange(next);
  }

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();

    // จอย่อ/ขยาย หรือแผงข้างหุบ ขนาดเปลี่ยนแล้วต้องคำนวณช่องใหม่
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // หมุดถูกย้ายจากที่อื่น (เช่นเลือกผลการค้นหา) ให้เลื่อนภาพตามไปด้วย
  useEffect(() => {
    if (selfMove.current === lat + "," + lng) return;
    setCenter({ lat, lng });
  }, [lat, lng]);

  /* ------------------------------------------------------------ การลาก */

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cx: lngToX(center.lng, zoom),
      cy: latToY(center.lat, zoom),
      moved: 0,
    };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // เบราว์เซอร์ไม่รองรับก็ยังลากได้ แค่เลื่อนออกนอกกรอบแล้วอาจหลุด
    }
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;

    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));

    // คิดจากจุดเริ่มลากเสมอ ไม่บวกสะสมทีละก้าว ค่าจึงไม่เพี้ยนสะสม
    setCenter({
      lat: yToLat(d.cy - dy / TILE, zoom),
      lng: xToLng(d.cx - dx / TILE, zoom),
    });
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ปล่อยไม่ได้ก็ไม่เป็นไร การลากจบไปแล้ว
    }
    if (!d || d.moved > CLICK_SLOP) return;

    // ขยับไม่ถึงเกณฑ์ = ตั้งใจคลิกวางหมุด ไม่ใช่ลากเลื่อนภาพ
    placeAt(e.clientX, e.clientY);
  }

  /** วางหมุดที่จุดบนจอนี้ */
  function placeAt(clientX, clientY) {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left - size.w / 2;
    const py = clientY - r.top - size.h / 2;

    emit({
      lat: round6(yToLat(latToY(center.lat, zoom) + py / TILE, zoom)),
      lng: round6(xToLng(lngToX(center.lng, zoom) + px / TILE, zoom)),
    });
  }

  /* ---------------------------------------------------- คีย์บอร์ดและซูม */

  function onKeyDown(e) {
    const step = e.shiftKey ? 60 : 20;
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      // ลูกศรเลื่อน "หมุด" ไม่ใช่ภาพ เพราะคนกดลูกศรคือคนที่กำลังเล็งตำแหน่งอยู่
      emit({
        lat: round6(yToLat(latToY(lat, zoom) + dy / TILE, zoom)),
        lng: round6(xToLng(lngToX(lng, zoom) + dx / TILE, zoom)),
      });
      return;
    }

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      onZoom(Math.min(MAX_ZOOM, zoom + 1));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      onZoom(Math.max(MIN_ZOOM, zoom - 1));
    }
  }

  /* ----------------------------------------------------------- วาดภาพ */

  const cx = lngToX(center.lng, zoom);
  const cy = latToY(center.lat, zoom);

  const tiles = [];
  if (size.w > 0) {
    const halfW = size.w / 2 / TILE;
    const halfH = size.h / 2 / TILE;
    const x0 = Math.floor(cx - halfW);
    const x1 = Math.ceil(cx + halfW);
    const y0 = Math.floor(cy - halfH);
    const y1 = Math.ceil(cy + halfH);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const url = tileURL(tx, ty, zoom);
        if (!url) continue;
        tiles.push({
          key: zoom + "/" + tx + "/" + ty,
          url,
          left: Math.round((tx - cx) * TILE + size.w / 2),
          top: Math.round((ty - cy) * TILE + size.h / 2),
        });
      }
    }
  }

  const pinLeft = (lngToX(lng, zoom) - cx) * TILE + size.w / 2;
  const pinTop = (latToY(lat, zoom) - cy) * TILE + size.h / 2;
  const pinVisible =
    pinLeft >= -40 && pinLeft <= size.w + 40 && pinTop >= -60 && pinTop <= size.h + 40;

  return (
    <div
      className={"mapick" + (dragging ? " dragging" : "")}
      style={{ height }}
      ref={boxRef}
      role="application"
      aria-label="แผนที่ปักหมุด — คลิกเพื่อวางหมุด ลากเพื่อเลื่อนภาพ ลูกศรเลื่อนหมุด"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={t.key}
          className="mapick-tile"
          src={t.url}
          alt=""
          width={TILE}
          height={TILE}
          draggable={false}
          loading="lazy"
          style={{ left: t.left, top: t.top }}
        />
      ))}

      {pinVisible ? (
        <span className="mapick-pin" style={{ left: pinLeft, top: pinTop }}>
          <IcPin size={30} stroke={2} />
        </span>
      ) : null}

      {/* ปุ่มซูมอยู่บนแผนที่ ต้องกันไม่ให้การกดปุ่มกลายเป็นการเริ่มลากภาพไปด้วย */}
      <div className="mapick-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-g btn-icon"
          onClick={() => onZoom(Math.min(MAX_ZOOM, zoom + 1))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="ซูมเข้า"
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-g btn-icon"
          onClick={() => onZoom(Math.max(MIN_ZOOM, zoom - 1))}
          disabled={zoom <= MIN_ZOOM}
          aria-label="ซูมออก"
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-g btn-icon"
          onClick={() => setCenter({ lat, lng })}
          title="เลื่อนภาพกลับไปที่หมุด"
          aria-label="เลื่อนภาพกลับไปที่หมุด"
        >
          <IcPin size={15} />
        </button>
      </div>

      {/* เงื่อนไขการใช้ภาพแผนที่ของ OpenStreetMap บังคับให้แสดงที่มา */}
      <a
        className="mapick-credit"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
      >
        © ผู้ร่วมสร้าง OpenStreetMap
      </a>

      {!pinVisible ? (
        <button
          type="button"
          className="mapick-away"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCenter({ lat, lng })}
        >
          หมุดอยู่นอกกรอบภาพ — กดเพื่อกลับไปหา
        </button>
      ) : null}
    </div>
  );
}
