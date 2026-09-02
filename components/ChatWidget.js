"use client";

// ผู้ช่วย AI — ปุ่มลอยมุมขวาล่าง กดแล้วเปิดแผงแชท ใช้ได้ทุกหน้าจอ
//
// AI ตอบอย่างเดียว ไม่แก้ข้อมูลใด ๆ
// ข้อมูลที่ส่งไปเป็น "สรุป" ที่สร้างจาก db ในหน่วยความจำ ไม่ใช่รายการดิบทั้งหมด

import { useCallback, useEffect, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { askChat, chatStatus } from "@/lib/chatClient";
import { summarize } from "@/lib/inventorySummary";
import { uid } from "@/lib/format";
import { IcChat, IcClose, IcSend, IcSparkle, IcTrash } from "./Icons";

const SUGGESTIONS = [
  "สินค้าไหนใกล้หมดบ้าง",
  "ยอดขายเดือนนี้เป็นอย่างไร",
  "โอนสินค้าระหว่างคลังทำยังไง",
  "คลังไหนมีของมากที่สุด",
];

/** จำนวนข้อความล่าสุดที่ส่งเป็นบริบทให้ AI */
const HISTORY_LIMIT = 8;

export default function ChatWidget() {
  const { db, ready } = useInv();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(null);
  // null = ยังไม่ได้เช็ค, true/false = ผลการเช็คตอนเปิดแผง
  const [aiReady, setAiReady] = useState(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const fabRef = useRef(null);
  const abortRef = useRef(null);

  /* ---------------------------------------------------------- effects */

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, err]);

  // Escape ปิดแผง
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // เช็คว่าผู้ช่วยพร้อมใช้หรือยังตอนเปิดแผง เพื่อบอกผู้ใช้ทันที
  // ไม่ต้องรอให้พิมพ์คำถามแล้วค่อยรู้ว่ายังไม่ได้ตั้งค่า
  // (GET ไม่เรียก Gemini จึงไม่เสียโควตา แม้ StrictMode จะยิงซ้ำในโหมด dev)
  useEffect(() => {
    if (!open || aiReady !== null) return;
    let alive = true;
    chatStatus()
      .then((st) => {
        if (alive) setAiReady(st.configured && st.allowed);
      })
      .catch(() => {
        // เช็คไม่ได้ก็ปล่อยให้ใช้งานต่อ เดี๋ยวตอนส่งจริงจะรู้เอง
        if (alive) setAiReady(true);
      });
    return () => {
      alive = false;
    };
  }, [open, aiReady]);

  // โฟกัสช่องพิมพ์เมื่อเปิด และยกเลิกคำขอค้างเมื่อปิด
  useEffect(() => {
    if (open) {
      if (inputRef.current) inputRef.current.focus();
      return;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setPending(false);
  }, [open]);

  // ยกเลิกคำขอค้างเมื่อ component ถูกถอด
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  /* ------------------------------------------------------------ ส่ง */

  const send = useCallback(
    async (question) => {
      const text = String(question || "").trim();
      if (!text || pending) return;

      setErr(null);
      const mine = { id: uid(), role: "user", text };
      const next = [...messages, mine];
      setMessages(next);
      setInput("");
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // สร้างสรุปตอนกดส่งเท่านั้น ไม่ต้องคำนวณทิ้งทุกครั้งที่ db เปลี่ยน
        const summary = summarize(db);

        const res = await askChat({
          messages: next.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, text: m.text })),
          summary,
          signal: controller.signal,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "model",
            text: res.truncated
              ? res.text + "\n\n(คำตอบยาวเกินกำหนดจึงถูกตัด ลองถามให้เจาะจงขึ้น)"
              : res.text,
          },
        ]);
      } catch (e) {
        // ผู้ใช้ปิดแผงเอง ไม่ต้องแจ้งอะไร
        if (e && e.name === "AbortError") return;
        setErr({ message: e.message, retry: text });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setPending(false);
      }
    },
    [db, messages, pending]
  );

  function onKeyDown(e) {
    // isComposing สำคัญมากกับการพิมพ์ภาษาไทย — กัน Enter ส่งขณะกำลังประกอบสระ/วรรณยุกต์
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function autoGrow(e) {
    setInput(e.target.value);
    e.target.style.height = "auto"; // ต้องรีเซ็ตก่อนอ่าน scrollHeight ไม่งั้นไม่ยอมหด
    e.target.style.height = Math.min(120, e.target.scrollHeight) + "px";
  }

  function clearChat() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setErr(null);
    setPending(false);
    if (inputRef.current) inputRef.current.focus();
  }

  /* ------------------------------------------------------------- UI */

  if (!ready) return null;

  if (!open) {
    return (
      <button
        ref={fabRef}
        className="chat-fab no-print"
        onClick={() => setOpen(true)}
        aria-label="เปิดผู้ช่วย AI"
        aria-expanded="false"
        aria-controls="chat-panel"
        title="ผู้ช่วย AI"
      >
        <IcChat size={24} stroke={1.9} />
      </button>
    );
  }

  return (
    <div className="chat-panel no-print" id="chat-panel" role="dialog" aria-label="ผู้ช่วย AI">
      <div className="chat-head">
        <span className="chat-title">
          <IcSparkle size={17} stroke={1.8} />
          ผู้ช่วย AI
        </span>
        {messages.length ? (
          <button
            className="btn btn-g btn-icon"
            onClick={clearChat}
            title="ล้างบทสนทนา"
            aria-label="ล้างบทสนทนา"
          >
            <IcTrash size={14} />
          </button>
        ) : null}
        <button
          className="btn btn-g btn-icon"
          onClick={() => {
            setOpen(false);
            if (fabRef.current) fabRef.current.focus();
          }}
          title="ปิด"
          aria-label="ปิดผู้ช่วย AI"
        >
          <IcClose size={16} />
        </button>
      </div>

      <div className="chat-body" ref={bodyRef} role="log" aria-live="polite" aria-busy={pending}>
        {aiReady === false ? (
          <div className="chat-setup">
            <b>ผู้ช่วย AI ยังไม่พร้อมใช้งาน</b>
            <p>
              ผู้ดูแลระบบต้องเพิ่ม <code>GEMINI_API_KEY</code> ที่ Vercel &gt; Settings &gt;
              Environment Variables แล้ว Redeploy หนึ่งครั้ง
            </p>
            <p className="muted">
              ระบบส่วนอื่นใช้งานได้ตามปกติ — หน้าจอรับ/เบิก/โอน/ขาย และรายงานทั้งหมด
              ไม่ได้พึ่งผู้ช่วย AI
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-intro">
            <p>
              สวัสดีครับ ผมเป็นผู้ช่วยประจำระบบคลังสินค้า ถามได้ทั้ง<b>วิธีใช้งานระบบ</b>
              และ<b>ข้อมูลในคลังตอนนี้</b>
            </p>
            <p className="muted">ผมตอบได้อย่างเดียว ไม่สามารถแก้ไขข้อมูลหรือบันทึกรายการให้ได้</p>
            <div className="chat-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={"chat-msg " + m.role}>
              {m.text}
            </div>
          ))
        )}

        {pending ? (
          <div className="chat-typing" aria-label="กำลังคิด">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {err ? (
          <div className="chat-err" role="alert">
            <div>{err.message}</div>
            <button
              className="btn btn-o btn-sm"
              onClick={() => {
                const q = err.retry;
                setErr(null);
                // ถอดคำถามเดิมออกก่อน แล้วส่งใหม่ ไม่ให้ซ้ำในประวัติ
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  return last && last.role === "user" && last.text === q ? prev.slice(0, -1) : prev;
                });
                setTimeout(() => send(q), 0);
              }}
            >
              ลองใหม่
            </button>
          </div>
        ) : null}
      </div>

      {aiReady === false ? null : (
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={inputRef}
          className="txa"
          rows={1}
          maxLength={1000}
          value={input}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
          placeholder="พิมพ์คำถาม แล้วกด Enter"
          disabled={pending}
          aria-label="คำถามถึงผู้ช่วย AI"
        />
        <button
          className="btn btn-p btn-icon"
          type="submit"
          disabled={pending || !input.trim()}
          title="ส่ง"
          aria-label="ส่งคำถาม"
        >
          <IcSend size={16} />
        </button>
      </form>
      )}
    </div>
  );
}
