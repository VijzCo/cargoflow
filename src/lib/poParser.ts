/**
 * CargoFlow PO Parser  —  validated against real-world legacy files
 * ------------------------------------------------------------------
 * Handles BOTH:
 *   (1) Clean CargoFlow template (sheet "PO", fixed columns)
 *   (2) Legacy free-form letterhead layout (Xiamen SYC style)
 *
 * Browser-compatible: uses xlsx (SheetJS), no Node-only APIs.
 * Drop into Next.js: `import { parsePOFile } from "@/lib/poParser";`
 *
 * Verified against:
 *   - PO-DFSASDRW04 (draw cord, 16 items, Trims, S/M/L/XL/XXL sizes)
 *   - PO-DFSKEIN01 (fabric, 12 items, Fabric, Excel-serial dates)
 */

import * as XLSX from "xlsx";

// ---------- Types ----------

export type Category =
  | "Fabric"
  | "Trims"
  | "Accessories"
  | "Packaging"
  | "Garments"
  | "Others";

export interface POItem {
  supplier: string;
  poNumbers: string[];          // multi-PO list, e.g. ["DFSASDRW04", "1314223", "1314003"]
  orderNo?: string;
  style: string;
  color: string;
  size: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  category: Category;
  description?: string;
  deliveryDate?: string;        // ISO yyyy-mm-dd
  salesChannel?: string;
  remarks?: string;
  // Optional fabric details (only meaningful for Fabric items, but the parser
  // populates them whenever the columns are present, regardless of category).
  composition?: string;
  reference?: string;
  shade?: string;
  uniqueKey: string;            // poNumbers[0] + style + color + size, uppercased
  rawRowIndex: number;
}

export interface ParseError {
  row: number;
  field: string;
  message: string;
}

export interface ParseResult {
  layout: "template" | "legacy" | "unknown";
  supplier?: string;
  items: POItem[];
  errors: ParseError[];
  warnings: string[];
}

// ---------- Category keyword map (admin-editable in app) ----------

export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Fabric: [
    "fabric", "cotton", "poly", "polyester", "spandex", "jersey", "knit",
    "woven", "interlock", "fleece", "yarn", "gsm", "dty", "viscose",
    "linen", "rayon", "denim", "twill", "satin", "chiffon",
  ],
  Trims: [
    "cord", "draw cord", "drawcord", "button", "zipper", "zip", "label",
    "tag", "thread", "elastic", "hook", "snap", "rivet", "velcro",
    "binding", "piping", "ribbon",
  ],
  Accessories: [
    "hanger", "hangtag", "pin", "clip", "lace", "badge", "patch",
    "embroidery", "applique", "bow",
  ],
  Packaging: [
    "polybag", "poly bag", "carton", "box", "sticker", "tape", "tissue",
    "barcode", "shipping bag", "mailer",
  ],
  Garments: [
    "shirt", "t-shirt", "tee", "pant", "dress", "hoodie", "jacket",
    "legging", "short", "top", "skirt", "jumpsuit", "blouse", "coat",
    "sweater", "cardigan",
  ],
  Others: [],
};

export function detectCategory(text: string): Category {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "Others";
  for (const cat of Object.keys(CATEGORY_KEYWORDS) as Category[]) {
    if (cat === "Others") continue;
    for (const kw of CATEGORY_KEYWORDS[cat]) {
      if (t.includes(kw)) return cat;
    }
  }
  return "Others";
}

// ---------- Helpers ----------

function excelSerialToISO(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200000) return undefined;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function toISODate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return excelSerialToISO(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

function splitPONumbers(raw: string): string[] {
  const cleaned = raw.replace(/^\s*PO#?\s*-?\s*/i, "").trim();
  return cleaned
    .split(/[\/,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function makeUniqueKey(poNumbers: string[], style: string, color: string, size: string): string {
  const po = (poNumbers[0] || "NOPO").toUpperCase();
  return [po, style, color, size]
    .map((s) => (s || "").toUpperCase().replace(/\s+/g, " ").trim())
    .join("|");
}

// ---------- Supplier / letterhead detection ----------

function findCellByLabel(rows: unknown[][], pattern: RegExp, maxRows = 25): string | undefined {
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "");
      if (pattern.test(v)) {
        for (let k = c + 1; k < row.length; k++) {
          const next = String(row[k] ?? "").trim();
          if (next) return next;
        }
      }
    }
  }
  return undefined;
}

function findCellRawByLabel(rows: unknown[][], pattern: RegExp, maxRows = 25): unknown {
  // Returns the RAW value (preserving numbers for date parsing) of the cell
  // following a matching label cell.
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "");
      if (pattern.test(v)) {
        for (let k = c + 1; k < row.length; k++) {
          if (row[k] != null && String(row[k]).trim() !== "") return row[k];
        }
      }
    }
  }
  return undefined;
}

function findSupplier(rows: unknown[][]): string | undefined {
  // Strategy A: scan top 15 rows for a company-name-like cell.
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (/\bCO\.?,?\s*LTD\.?|\bCORP(ORATION)?\.?\b|\bINC\.?\b|\bLLC\.?\b|\bGMBH\b/i.test(v)
          && v.length > 6
          && !/^billing/i.test(v)) {
        return v;
      }
    }
  }
  // Strategy B: "TO :" label, supplier on same row or next non-empty row.
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (/^TO\s*:?$/i.test(v)) {
        for (let k = c + 1; k < row.length; k++) {
          const next = String(row[k] ?? "").trim();
          if (next) return next;
        }
        if (r + 1 < rows.length) {
          for (const nxt of (rows[r + 1] || [])) {
            const s = String(nxt ?? "").trim();
            if (s) return s;
          }
        }
      }
    }
  }
  return undefined;
}

// ---------- Template parser ----------

const TEMPLATE_HEADERS = [
  "Supplier", "PO Number", "Order No", "Style", "Color", "Size",
  "Quantity", "Unit", "Unit Price", "Category", "Description",
  "Delivery Date", "Sales Channel", "Remarks",
  // Optional fabric columns — header detection still triggers on the original 14
  // (we only need 6 hits to identify a template), so these are additive and
  // backwards-compatible with older sheets that don't have them.
  "Composition", "Fabric Composition",
  "Reference", "Ref", "Fabric Reference",
  "Shade", "Approved Shade",
];

function isTemplateSheet(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    const hits = TEMPLATE_HEADERS.filter((h) => row.includes(h)).length;
    if (hits >= 6) return true;
  }
  return false;
}

// Return the column index for the first matching alias (or -1).
function findCol(headers: string[], ...aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

function parseTemplate(rows: unknown[][]): ParseResult {
  const result: ParseResult = { layout: "template", items: [], errors: [], warnings: [] };

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    if (TEMPLATE_HEADERS.filter((h) => row.includes(h)).length >= 6) {
      headerRowIdx = i; break;
    }
  }
  if (headerRowIdx === -1) {
    result.errors.push({ row: 0, field: "headers", message: "Could not find header row." });
    return result;
  }

  const headers = (rows[headerRowIdx] || []).map((c) => String(c ?? "").trim());
  const idx = (name: string) => headers.indexOf(name);
  const cols = {
    supplier: idx("Supplier"), po: idx("PO Number"), order: idx("Order No"),
    style: idx("Style"), color: idx("Color"), size: idx("Size"),
    qty: idx("Quantity"), unit: idx("Unit"), price: idx("Unit Price"),
    cat: idx("Category"), desc: idx("Description"),
    date: idx("Delivery Date"), channel: idx("Sales Channel"), remarks: idx("Remarks"),
    composition: findCol(headers, "Composition", "Fabric Composition"),
    reference:   findCol(headers, "Reference", "Ref", "Fabric Reference"),
    shade:       findCol(headers, "Shade", "Approved Shade"),
  };

  const seen = new Map<string, number>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i] : undefined);
    const supplier = String(cell(cols.supplier) ?? "").trim();
    const poRaw = String(cell(cols.po) ?? "").trim();
    const style = String(cell(cols.style) ?? "").trim();
    const color = String(cell(cols.color) ?? "").trim();
    const size = String(cell(cols.size) ?? "").trim();
    const qtyRaw = cell(cols.qty);
    if (!supplier && !poRaw && !style && !color && qtyRaw == null) continue;

    const rowNum = r + 1;
    const missing: string[] = [];
    if (!supplier) missing.push("Supplier");
    if (!poRaw) missing.push("PO Number");
    if (!style) missing.push("Style");
    if (!color) missing.push("Color");
    if (!size) missing.push("Size");
    if (qtyRaw == null || qtyRaw === "") missing.push("Quantity");
    if (missing.length) {
      result.errors.push({ row: rowNum, field: missing.join(", "), message: `Missing required field${missing.length > 1 ? "s" : ""}.` });
      continue;
    }

    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ row: rowNum, field: "Quantity", message: `Invalid quantity: ${qtyRaw}` });
      continue;
    }

    const poNumbers = splitPONumbers(poRaw);
    const description = String(cell(cols.desc) ?? "").trim();
    const categoryRaw = String(cell(cols.cat) ?? "").trim();
    const category = (categoryRaw && categoryRaw in CATEGORY_KEYWORDS)
      ? (categoryRaw as Category)
      : detectCategory(`${style} ${description}`);

    const deliveryDate = toISODate(cell(cols.date));
    if (cell(cols.date) && !deliveryDate) {
      result.warnings.push(`Row ${rowNum}: could not parse delivery date '${cell(cols.date)}'.`);
    }

    const item: POItem = {
      supplier, poNumbers,
      orderNo: String(cell(cols.order) ?? "").trim() || undefined,
      style, color, size, quantity: qty,
      unit: String(cell(cols.unit) ?? "PCS").trim() || "PCS",
      unitPrice: cell(cols.price) != null && cell(cols.price) !== "" ? Number(cell(cols.price)) : undefined,
      category,
      description: description || undefined,
      deliveryDate,
      salesChannel: String(cell(cols.channel) ?? "").trim() || undefined,
      remarks: String(cell(cols.remarks) ?? "").trim() || undefined,
      composition: String(cell(cols.composition) ?? "").trim() || undefined,
      reference:   String(cell(cols.reference) ?? "").trim() || undefined,
      shade:       String(cell(cols.shade) ?? "").trim() || undefined,
      uniqueKey: makeUniqueKey(poNumbers, style, color, size),
      rawRowIndex: rowNum,
    };

    const prev = seen.get(item.uniqueKey);
    if (prev) {
      result.errors.push({ row: rowNum, field: "unique key", message: `Duplicate of row ${prev}: same PO+Style+Color+Size.` });
    } else {
      seen.set(item.uniqueKey, rowNum);
    }
    result.items.push(item);
  }

  return result;
}

// ---------- Legacy free-form parser ----------

function parseLegacy(rows: unknown[][]): ParseResult {
  const result: ParseResult = { layout: "legacy", items: [], errors: [], warnings: [] };

  const supplier = findSupplier(rows);
  result.supplier = supplier;
  if (!supplier) result.warnings.push("Supplier not auto-detected — merchant must set during preview");

  const filePO = findCellByLabel(rows, /PO\s*NO/i);
  const orderNo = findCellByLabel(rows, /ORDER\s*NO/i);
  const purchaseDateRaw = findCellRawByLabel(rows, /DATE\s*OF\s*PURCHASE/i);
  const deliveryDateTopRaw = findCellRawByLabel(rows, /DATE\s*OF\s*DELIVERY/i);

  // File-level description blob for category detection
  const fileBlob = rows.slice(0, 25)
    .flat()
    .map((c) => (c == null ? "" : String(c)))
    .join(" ");

  // CR — detect file-level fabric composition from descriptive lines.
  // Composition lines typically contain a percentage and a fabric word
  // (e.g. "94% polyester 6% spandex 130GSM"). Apply file-wide; individual
  // rows can override via the Composition column if present.
  function detectFileComposition(): string | undefined {
    const FABRIC_WORDS = /(cotton|polyester|spandex|elastane|nylon|viscose|rayon|linen|silk|wool|acrylic|poly|tencel|modal|lyocell|bamboo|hemp|cashmere|polyamide)/i;
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const cells = (rows[r] || []).map((c) => (c == null ? "" : String(c)).trim()).filter(Boolean);
      for (const cell of cells) {
        // Must contain a percentage AND a fabric word
        if (/\d+\s*%/.test(cell) && FABRIC_WORDS.test(cell)) {
          // Sanity check — not too long, not too short
          if (cell.length > 8 && cell.length < 200) {
            // Trim trailing "TOTAL WIDTH" / "WOVEN FABRIC" etc. — keep just
            // composition + GSM if present.
            const trimmed = cell
              .split(/\bTOTAL\s+WIDTH\b|\bWOVEN\s+FABRIC\b|\bKNIT\s+FABRIC\b/i)[0]
              .replace(/[,\s]+$/, "")
              .trim();
            return trimmed.length > 0 ? trimmed : cell;
          }
        }
      }
    }
    return undefined;
  }
  const fileComposition = detectFileComposition();

  // Detect file-level approved shade from a labeled cell ("approved shade: …")
  function detectFileShade(): string | undefined {
    const v = findCellByLabel(rows, /APPROVED\s*SHADE/i);
    return v ? String(v).trim() || undefined : undefined;
  }
  const fileShade = detectFileShade();

  // Find the data header row
  let headerRowIdx = -1;
  let headerCells: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const lower = (rows[r] || []).map((c) => String(c ?? "").toLowerCase());
    if (lower.some((c) => c.includes("description")) && lower.some((c) => c.includes("quantity"))) {
      headerRowIdx = r;
      headerCells = lower;
      break;
    }
  }
  if (headerRowIdx === -1) {
    result.errors.push({ row: 0, field: "layout", message: "Could not find data header row." });
    return result;
  }

  const findCol = (...keywords: string[]): number => {
    for (let i = 0; i < headerCells.length; i++) {
      for (const kw of keywords) {
        if (headerCells[i].includes(kw)) return i;
      }
    }
    return -1;
  };

  let cDesc = findCol("description");
  let cSize = findCol("size");
  let cColor = findCol("color");
  const cPO = findCol("po#", "po #");
  const cDelivery = findCol("delivery date", "delivery");
  const cQty = findCol("quantity");
  const cUnit = findCol("unit");
  const cPrice = findCol("price");
  // CR — fabric details columns (optional, only used for Fabric items)
  const cFabricRef = findCol("fabric reference", "fabric ref", "ref#", "reference");
  const cComposition = findCol("composition", "fabric composition");
  const cShade = findCol("approved shade", "shade");

  // Combined "Size / Color" header — both lookups land on the same cell.
  if (cSize === cColor && cSize !== -1) {
    cColor = cDesc !== -1 ? cDesc : Math.max(0, cSize - 2);
  }

  const hasPOColumn = cPO >= 0;
  const hasDeliveryColumn = cDelivery >= 0;

  let currentStyle: string | undefined;
  const filePOs = filePO ? [filePO] : [];
  let currentPOs: string[] = [...filePOs];

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const cells = (rows[r] || []).map((c) => (c == null ? "" : String(c)));
    const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;
    const joined = nonEmpty.join(" ").trim();

    if (/^TOTAL\b/i.test(joined) || /^REMARKS\b/i.test(joined) || /ISSUED BY/i.test(joined)) break;

    if (!hasPOColumn && /^PO\s*#/i.test(joined)) {
      const pos = splitPONumbers(joined);
      currentPOs = [...filePOs, ...pos.filter((p) => !filePOs.includes(p))];
      continue;
    }

    const styleMatch = joined.match(/^STYLE\s*#\s*(.+)$/i);
    if (styleMatch) {
      currentStyle = styleMatch[1].trim();
      continue;
    }

    const firstCell = cells.find((c) => c.trim() !== "") || "";
    const looksSection = /^\d{1,3}$/.test(firstCell.trim());
    const qtyCellVal = cQty >= 0 && cQty < cells.length ? cells[cQty].trim() : "";
    const rowHasQty = cQty >= 0
      ? /^\d+(\.\d+)?$/.test(qtyCellVal)
      : nonEmpty.some((c, i) => i > 0 && /^\d+(\.\d+)?$/.test(c));

    if (looksSection && !rowHasQty && nonEmpty.length >= 2) {
      currentStyle = nonEmpty.slice(1).join(" ").trim();
      continue;
    }
    if (!rowHasQty && /need|note|fastness|please/i.test(joined)) continue;
    if (!rowHasQty) continue;

    let qty: number;
    let color: string;
    let size = "All Size";
    let unit = "PCS";
    let priceVal: number | undefined;
    let rowPOs: string[] = [...filePOs];
    let rowDate: string | undefined;

    if (cQty >= 0) {
      // Header-mapped extraction
      qty = Number(qtyCellVal);
      if (!Number.isFinite(qty)) continue;
      if (cUnit >= 0 && cUnit < cells.length && cells[cUnit].trim()) {
        unit = cells[cUnit].trim().toUpperCase();
      }
      if (cPrice >= 0 && cPrice < cells.length && cells[cPrice].trim()) {
        const pv = Number(cells[cPrice].trim());
        if (Number.isFinite(pv)) priceVal = pv;
      }
      // Color: prefer Color column; for layouts where "Description/Color" is one
      // column, try Description col, then Description col + 1.
      if (cColor >= 0 && cColor < cells.length && cells[cColor].trim()) {
        color = cells[cColor].trim();
      } else if (cDesc >= 0 && cDesc + 1 < cells.length && cells[cDesc + 1].trim()) {
        color = cells[cDesc + 1].trim();
      } else if (cDesc >= 0 && cDesc < cells.length) {
        color = cells[cDesc].trim();
      } else {
        color = "Unspecified";
      }
      // Skip flag-style cells like "PRINT" or "FABRIC"
      if (/^(PRINT|FABRIC|TRIM|STYLE|COLOR)$/i.test(color)) {
        for (let k = cDesc + 2; k < cells.length; k++) {
          const v = cells[k].trim();
          if (v && !/^\d/.test(v) && !/^(PRINT|FABRIC)$/i.test(v)) { color = v; break; }
        }
      }
      if (cSize >= 0 && cSize < cells.length && cells[cSize].trim()) size = cells[cSize].trim();

      if (hasPOColumn && cPO < cells.length && cells[cPO].trim()) {
        const inline = splitPONumbers(cells[cPO]);
        rowPOs = [...filePOs, ...inline.filter((p) => !filePOs.includes(p))];
      } else if (currentPOs.length) {
        rowPOs = [...currentPOs];
      }

      if (hasDeliveryColumn && cDelivery < (rows[r] || []).length) {
        rowDate = toISODate((rows[r] as unknown[])[cDelivery]);
      }
      if (!rowDate) rowDate = toISODate(deliveryDateTopRaw) || toISODate(purchaseDateRaw);

    } else {
      // Positional heuristic (no clean qty header)
      let qtyIdx = -1;
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i].trim();
        if (!v) continue;
        if (/^\d+(\.\d+)?$/.test(v)) {
          // Skip values that look like PO numbers (7+ digit integers)
          if (v.length >= 7 && !v.includes(".")) continue;
          qtyIdx = i; qty = Number(v); break;
        }
      }
      if (qtyIdx === -1) continue;
      qty = Number(cells[qtyIdx]);

      const textBefore: string[] = [];
      for (let i = 0; i < qtyIdx; i++) {
        const v = cells[i].trim();
        if (!v) continue;
        if (textBefore.length === 0 && /^\d{1,3}$/.test(v)) continue;
        textBefore.push(v);
      }
      if (textBefore.length < 1) continue;
      color = textBefore[0];
      size = textBefore[1] || "All Size";
      for (let i = qtyIdx + 1; i < cells.length; i++) {
        const v = cells[i].trim();
        if (!v) continue;
        if (/^[A-Za-z]+$/.test(v)) {
          unit = v.toUpperCase();
          for (let j = i + 1; j < cells.length; j++) {
            const w = cells[j].trim();
            if (!w) continue;
            if (/^\d+(\.\d+)?$/.test(w)) { priceVal = Number(w); break; }
          }
          break;
        }
      }
      rowPOs = currentPOs.length ? [...currentPOs] : [...filePOs];
      rowDate = toISODate(deliveryDateTopRaw) || toISODate(purchaseDateRaw);
    }

    if (!currentStyle) {
      result.warnings.push(`Row ${r + 1}: data row found before any STYLE# — merchant must assign style during preview.`);
      currentStyle = "(unassigned)";
    }
    if (rowPOs.length === 0) {
      result.errors.push({ row: r + 1, field: "PO Number", message: "No PO context found. Merchant must add PO during preview." });
    }

    // CR — fabric details: per-row column > file-level fallback
    const rowFabricRef = cFabricRef >= 0 && cFabricRef < cells.length
      ? cells[cFabricRef].trim() || undefined
      : undefined;
    const rowComposition = cComposition >= 0 && cComposition < cells.length
      ? cells[cComposition].trim() || undefined
      : undefined;
    const rowShade = cShade >= 0 && cShade < cells.length
      ? cells[cShade].trim() || undefined
      : undefined;

    const item: POItem = {
      supplier: supplier || "",
      poNumbers: rowPOs,
      orderNo: orderNo || undefined,
      style: currentStyle,
      color,
      size,
      quantity: qty!,
      unit,
      unitPrice: priceVal,
      category: detectCategory(`${currentStyle} ${color} ${fileBlob}`),
      description: currentStyle,
      deliveryDate: rowDate,
      salesChannel: undefined,
      remarks: undefined,
      composition: rowComposition || fileComposition,
      reference: rowFabricRef,
      shade: rowShade || fileShade,
      uniqueKey: makeUniqueKey(rowPOs, currentStyle, color, size),
      rawRowIndex: r + 1,
    };
    result.items.push(item);
  }

  // Dedup as warnings
  const seen = new Map<string, number>();
  for (const it of result.items) {
    const prev = seen.get(it.uniqueKey);
    if (prev) {
      result.warnings.push(`Row ${it.rawRowIndex}: duplicate of row ${prev} (same PO+Style+Color+Size) — will be merged.`);
    } else {
      seen.set(it.uniqueKey, it.rawRowIndex);
    }
  }

  return result;
}

// ---------- Public entry point ----------

export function parsePOFile(buffer: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetNames = wb.SheetNames;
  const preferred = sheetNames.find((n) => n.trim().toUpperCase() === "PO");
  const tryOrder = preferred
    ? [preferred, ...sheetNames.filter((n) => n !== preferred)]
    : sheetNames;

  for (const name of tryOrder) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: true, defval: null,
    }) as unknown[][];
    if (rows.length === 0) continue;

    if (isTemplateSheet(rows)) return parseTemplate(rows);

    const topText = rows.slice(0, 25)
      .flat()
      .map((c) => String(c ?? "").toLowerCase())
      .join(" ");
    if (topText.includes("po  no") || topText.includes("po no") || topText.includes("date of delivery")) {
      return parseLegacy(rows);
    }
  }

  return {
    layout: "unknown",
    items: [],
    errors: [{ row: 0, field: "layout", message: "File format not recognized. Use the CargoFlow template or a supported legacy layout." }],
    warnings: [],
  };
}
