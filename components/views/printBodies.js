"use client";

// เนื้อหาเอกสารที่ใช้พิมพ์ร่วมกันหลายหน้าจอ

import { PAY_METHODS, VAT_RATE } from "@/lib/constants";
import { bahtText, num, thDateTime } from "@/lib/format";
import {
  bodyRows,
  defaultForm,
  headCells,
  metaRows,
  totalRows,
} from "@/lib/printForms";
import { LogoFull } from "../Icons";
import { Barcode } from "../ui";

/**
 * ใบตรวจนับสินค้า — พิมพ์ยอดตามบัญชีมาให้ เว้นช่องสำหรับกรอกยอดนับจริง
 *
 * แยกบรรทัดตามช่องเก็บ เพราะคนเดินนับของนับทีละช่อง ไม่ได้นับรวมทั้งคลัง
 * สินค้าที่มีของในคลังแต่ยังไม่ได้ระบุที่เก็บจะขึ้นท้ายตารางไว้ให้ตามหา
 */
export function CountSheetBody({ db, inv, whId }) {
  const rows = [];

  inv.locsOf(whId).forEach((l) => {
    inv
      .placementsIn(l.id)
      .slice()
      .sort((a, b) => {
        const pa = inv.prod(a.productId);
        const pb = inv.prod(b.productId);
        return (pa ? pa.code : "").localeCompare(pb ? pb.code : "");
      })
      .forEach((pl) => {
        const p = inv.prod(pl.productId);
        if (p) rows.push({ loc: l, p, qty: pl.qty });
      });
  });

  db.products.forEach((p) => {
    const rest = inv.stockOf(p.id, whId) - inv.placedQty(p.id, whId);
    if (rest > 0) rows.push({ loc: null, p, qty: rest });
  });

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>ที่เก็บ</th>
            <th>รหัสสินค้า</th>
            <th>รายการสินค้า</th>
            <th>หน่วยนับ</th>
            <th style={{ textAlign: "right" }}>ยอดตามบัญชี</th>
            <th style={{ width: 70 }}>นับได้จริง</th>
            <th style={{ width: 70 }}>ผลต่าง</th>
            <th style={{ width: 110 }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.loc ? r.loc.id : "none") + "|" + r.p.id}>
              <td>{i + 1}</td>
              <td>{r.loc ? r.loc.code : "ยังไม่ระบุที่เก็บ"}</td>
              <td>{r.p.code}</td>
              <td>{r.p.name}</td>
              <td>{r.p.unit}</td>
              <td style={{ textAlign: "right" }}>{num(r.qty, 0)}</td>
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>รวม {rows.length} บรรทัด</td>
            <td style={{ textAlign: "right" }}>
              {num(rows.reduce((s, r) => s + r.qty, 0), 0)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
      <div className="pr-note">
        หมายเหตุ: กรอกยอดที่นับได้จริงลงในช่อง “นับได้จริง” แล้วนำผลต่างไปบันทึกในหน้าจอปรับปรุงสินค้า
        โดยเลือกที่เก็บให้ตรงกับบรรทัดที่นับ
      </div>
    </>
  );
}

/**
 * ใบเสร็จรับเงิน — จัดหน้าแบบใบเสร็จแคบ พิมพ์ได้ทั้งกระดาษความร้อนและ A4
 * ใช้ร่วมกันระหว่างการพิมพ์ตอนจบการขาย และการพิมพ์ซ้ำจากรายงาน
 */
export function ReceiptBody({ inv, sale, items }) {
  const wh = inv.wh(sale.whId);
  const binLabel = sale.locId ? inv.locName(sale.locId) : "";
  const pay = PAY_METHODS.find((m) => m.id === sale.payMethod);

  return (
    <div className="receipt">
      <div className="rc-head">
        <b>One for All Ultra</b>
        <span>ระบบควบคุมสินค้าคงคลัง</span>
        {wh ? (
          <span>
            {wh.name} · จังหวัด{wh.province}
          </span>
        ) : null}
        <span>โทร. 0-2433-2222</span>
      </div>

      <div className="rc-title">ใบเสร็จรับเงิน / RECEIPT</div>

      <div className="rc-meta">
        <div>
          <span>เลขที่</span>
          <b>{sale.docNo}</b>
        </div>
        <div>
          <span>วันที่</span>
          <b>{thDateTime(sale.ts)}</b>
        </div>
        <div>
          <span>ลูกค้า</span>
          {/* ขายให้ลูกค้าในทะเบียน ให้ใบเสร็จบอกรหัสด้วย ลูกค้าจะได้อ้างถึงตัวเองได้ถูก
              ตอนโทรมาสอบถามทีหลัง และฝ่ายบัญชีตามกลับไปหาทะเบียนได้ */}
          <b>
            {(sale.custCode ? sale.custCode + " · " : "") + (sale.customer || "ลูกค้าทั่วไป")}
          </b>
        </div>
        <div>
          <span>ผู้ขาย</span>
          <b>{sale.user || "-"}</b>
        </div>
        {binLabel ? (
          <div>
            <span>ที่เก็บ</span>
            <b>{binLabel}</b>
          </div>
        ) : null}
      </div>

      <table className="rc-items">
        <thead>
          <tr>
            <th>รายการ</th>
            <th style={{ textAlign: "right" }}>จำนวน</th>
            <th style={{ textAlign: "right" }}>ราคา</th>
            <th style={{ textAlign: "right" }}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const p = inv.prod(it.productId);
            return (
              <tr key={it.id}>
                <td>
                  {inv.prodName(it.productId)}
                  <br />
                  <span className="rc-code">{p ? p.code + " · " + p.unit : ""}</span>
                </td>
                <td style={{ textAlign: "right" }}>{num(it.qty, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(it.price, 2)}</td>
                <td style={{ textAlign: "right" }}>{num(it.amount, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="rc-sum">
        <div>
          <span>ยอดรวมสินค้า</span>
          <b>{num(sale.subtotal, 2)}</b>
        </div>
        {sale.discount > 0 ? (
          <div>
            <span>ส่วนลด</span>
            <b>-{num(sale.discount, 2)}</b>
          </div>
        ) : null}
        <div>
          <span>ภาษีมูลค่าเพิ่ม {Math.round(VAT_RATE * 100)}%</span>
          <b>{num(sale.vat, 2)}</b>
        </div>
        <div className="rc-total">
          <span>ยอดสุทธิ</span>
          <b>{num(sale.total, 2)}</b>
        </div>
        <div>
          <span>รับเงิน ({pay ? pay.name : sale.payMethod})</span>
          <b>{num(sale.paid, 2)}</b>
        </div>
        <div>
          <span>เงินทอน</span>
          <b>{num(sale.change, 2)}</b>
        </div>
      </div>

      <div className="rc-foot">
        <div>ขอบคุณที่ใช้บริการ</div>
        <div>เอกสารออกโดยระบบควบคุมสินค้าคงคลัง</div>
        <div className="rc-sign">
          <div className="line" />
          ผู้รับเงิน
        </div>
      </div>
    </div>
  );
}

/** ป้ายบาร์โค๊ดสำหรับติดสินค้า */
export function LabelSheetBody({ items }) {
  return (
    <div className="lbl-grid">
      {items.map((p, i) => (
        <div className="lbl-card" key={p.id + "-" + i}>
          <div style={{ fontSize: "9pt", fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: "8pt", color: "#555" }}>
            {p.code} · {p.unit}
          </div>
          <Barcode value={p.barcode} module={1.4} height={34} />
        </div>
      ))}
    </div>
  );
}

/**
 * ใบกำกับภาษีเต็มรูปแบบ / ใบส่งของ
 *
 * หัวกระดาษต้องเป็นชื่อกิจการผู้ออก ไม่ใช่ชื่อโปรแกรม จึงพิมพ์ด้วยโหมด bare
 * (กฎหมายบังคับว่าต้องมีชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ขายบนเอกสาร
 *  พร้อมข้อมูลเดียวกันของผู้ซื้อ เลขที่ วันที่ รายการ มูลค่า และภาษีที่แยกออกมา)
 *
 * ชื่อ/ที่อยู่ผู้ซื้ออ่านจากตัวใบ ไม่ได้อ่านสดจากทะเบียนลูกค้า
 * เพราะเอกสารภาษีต้องคงข้อความเดิม ณ วันที่ออก
 */
/**
 * เอกสารการค้าที่วาดตามฟอร์มที่ออกแบบไว้
 *
 * ตัววาดตัวเดียวใช้ทั้งตอนดูตัวอย่างในหน้าออกแบบฟอร์ม และตอนพิมพ์จริง
 * จึงไม่มีทางที่ตัวอย่างสวยแต่พิมพ์ออกมาคนละอย่าง
 *
 * ฟอร์มบอกว่าจะแสดงส่วนไหนบ้างและเอาคอลัมน์ไหน ตัววาดไม่ตัดสินใจเอง
 * ไม่ส่งฟอร์มมาก็ใช้ฟอร์มมาตรฐาน ของเดิมจึงพิมพ์ออกมาเหมือนเดิมทุกประการ
 *
 * @param {object} props.doc เอกสาร (ใบขาย / ใบซื้อ / ใบส่งคืน)
 * @param {object} props.form ฟอร์มที่เลือกไว้
 * @param {string} props.party คำเรียกคู่ค้าบนเอกสาร เช่น "ผู้ซื้อ"
 */
export function TradeDocBody({ inv, company, doc, items, form, party = "ผู้ซื้อ" }) {
  const f = form || defaultForm("INVOICE");
  const co = company || {};
  const cols = headCells(f);
  const rows = bodyRows(f, items, inv);

  // ฝั่งขายเก็บข้อมูลคู่ค้าไว้ในชื่อ cust* ฝั่งซื้อใช้ sup* — รับได้ทั้งสองแบบ
  const other = {
    name: doc.custName || doc.supName || "-",
    address: doc.custAddress || doc.supAddress || "",
    taxId: doc.custTaxId || doc.supTaxId || "",
    branch: doc.custBranch || doc.supBranch || "",
    code: doc.custCode || doc.supCode || "",
  };

  return (
    <div className="tinv">
      <div className="ti-head">
        <div className="ti-seller">
          {f.showCompany ? (
            <>
              {f.showLogo ? (
                <div className="ti-logo">
                  <LogoFull height={32} />
                </div>
              ) : null}
              <b>{co.name || "(ยังไม่ได้ตั้งค่าข้อมูลกิจการ)"}</b>
              <div>{co.address}</div>
              <div>
                เลขประจำตัวผู้เสียภาษี {co.taxId || "-"}
                {co.branch ? " · " + co.branch : ""}
              </div>
              {co.phone ? <div>โทร. {co.phone}</div> : null}
              {co.email ? <div>{co.email}</div> : null}
            </>
          ) : null}
        </div>
        <div className="ti-kind">
          <div className="ti-title">{f.title}</div>
          {f.copyLabel ? <div className="ti-orig">{f.copyLabel}</div> : null}
          {f.showBarcode ? <Barcode value={doc.docNo} module={1.5} height={34} /> : null}
        </div>
      </div>

      <div className="ti-parties">
        <div className="ti-box">
          <span className="ti-lbl">{party}</span>
          <b>{other.name}</b>
          <div>{other.address || "-"}</div>
          <div>
            เลขประจำตัวผู้เสียภาษี {other.taxId || "-"}
            {other.branch ? " · " + other.branch : ""}
          </div>
          {other.code ? <div>รหัส {other.code}</div> : null}
        </div>
        <div className="ti-box">
          {metaRows(doc).map(([k, v]) => (
            <div className="ti-kv" key={k}>
              <span>{k}</span>
              <b>{v || "-"}</b>
            </div>
          ))}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.id}
                style={{
                  width: c.width || undefined,
                  textAlign: c.align === "right" ? "right" : undefined,
                }}
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={cols[j].align === "right" ? { textAlign: "right" } : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ti-foot">
        <div className="ti-words">
          {f.showWords ? (
            <>
              <span className="ti-lbl">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</span>
              <b>{bahtText(doc.total)}</b>
            </>
          ) : null}
          {f.showNote && doc.note ? <div className="ti-note">หมายเหตุ: {doc.note}</div> : null}
        </div>

        {f.showTotals ? (
          <table className="ti-total">
            <tbody>
              {totalRows(doc).map(([k, v], i, all) => (
                <tr key={k} className={i === all.length - 1 ? "grand" : ""}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {f.signs && f.signs.length ? (
        <div className="pr-sign">
          {f.signs.map((sg, i) => (
            <div key={sg + i}>
              <div className="line" />
              {sg}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
