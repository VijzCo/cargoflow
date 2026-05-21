"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PackingListFullDetail } from "@/lib/utils/packing-list-actions";

// =============================================================================
// PDF colors (subdued, professional — works in B&W print too)
// =============================================================================

const NAVY: [number, number, number] = [30, 58, 95];        // #1E3A5F
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_200: [number, number, number] = [226, 232, 240];
const WHITE: [number, number, number] = [255, 255, 255];

// =============================================================================
// Helpers
// =============================================================================

function setColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }).toUpperCase();
  } catch {
    return iso;
  }
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// =============================================================================
// Main entry: generate PDF and trigger download
// =============================================================================

export function downloadPackingListPDF(detail: PackingListFullDetail, filename?: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const { packingList: pl, items, branding, vessel, supplier } = detail;

  // ---------- Header: company / supplier letterhead ----------
  // Big company name on the right
  setColor(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  // Supplier on left (the one shipping)
  doc.text(supplier.name.toUpperCase(), marginX, 18, { maxWidth: contentWidth * 0.55 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, SLATE_500);
  let cursorY = 22.5;
  if (supplier.address) {
    doc.text(supplier.address, marginX, cursorY, { maxWidth: contentWidth * 0.55 });
    cursorY += 4;
  }
  if (supplier.country) {
    doc.text(supplier.country, marginX, cursorY);
    cursorY += 4;
  }
  if (supplier.phone || supplier.email) {
    const contact = [supplier.phone, supplier.email].filter(Boolean).join("  ·  ");
    doc.text(contact, marginX, cursorY);
    cursorY += 4;
  }

  // Right side: branded label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  setColor(doc, NAVY);
  doc.text("PACKING LIST", pageWidth - marginX, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, SLATE_500);
  doc.text(branding.companyName, pageWidth - marginX, 28, { align: "right" });

  // Divider
  doc.setDrawColor(SLATE_200[0], SLATE_200[1], SLATE_200[2]);
  doc.setLineWidth(0.4);
  doc.line(marginX, 38, pageWidth - marginX, 38);

  // ---------- Meta block ----------
  let metaY = 44;
  const labelWidth = 30;
  const valueX1 = marginX + labelWidth;
  const valueX2Label = marginX + contentWidth / 2;
  const valueX2 = valueX2Label + labelWidth;

  const drawMeta = (label: string, value: string, x: number, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, SLATE_500);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(doc, SLATE_700);
    doc.text(value, x + labelWidth, y, { maxWidth: contentWidth / 2 - labelWidth });
  };

  drawMeta("PL Number", pl.packingListNumber, marginX, metaY);
  drawMeta("Vessel", vessel.vesselId + (vessel.vesselName ? `  /  ${vessel.vesselName}` : ""), valueX2Label, metaY);

  metaY += 5;
  drawMeta("Container", pl.containerNumber, marginX, metaY);
  drawMeta("Destination", vessel.destination, valueX2Label, metaY);

  metaY += 5;
  drawMeta("ETD", formatDate(vessel.etd), marginX, metaY);
  drawMeta("ETA", formatDate(vessel.eta), valueX2Label, metaY);

  if (pl.salesChannel) {
    metaY += 5;
    drawMeta("Sales Channel", pl.salesChannel, marginX, metaY);
  }

  // ---------- Items table ----------
  const tableStartY = metaY + 8;

  // Group items by PO for visual grouping
  type Row = (string | number)[];
  const body: Row[] = [];
  let currentPO = "";
  for (const item of items) {
    if (item.poNumber !== currentPO) {
      // PO group separator row
      currentPO = item.poNumber;
      body.push([{
        content: `PO ${item.poNumber}`,
        colSpan: 8,
        styles: {
          fillColor: SLATE_200,
          textColor: NAVY,
          fontStyle: "bold",
          fontSize: 8,
        },
      } as unknown as string]);
    }
    body.push([
      item.style,
      item.color,
      item.size,
      formatNumber(item.quantity),
      item.unit,
      item.packageCount > 0 ? formatNumber(item.packageCount) : "—",
      item.cbm > 0 ? formatNumber(item.cbm, 2) : "—",
      item.grossWeight > 0 ? formatNumber(item.grossWeight, 1) : "—",
    ]);
  }

  // Totals row
  body.push([{
    content: "TOTAL",
    colSpan: 3,
    styles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", halign: "right" },
  } as unknown as string,
  {
    content: formatNumber(pl.totalQuantity),
    styles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", halign: "right" },
  } as unknown as string,
  {
    content: "",
    styles: { fillColor: NAVY, textColor: WHITE },
  } as unknown as string,
  {
    content: formatNumber(pl.totalCartons),
    styles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", halign: "right" },
  } as unknown as string,
  {
    content: formatNumber(pl.totalCbm, 2),
    styles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", halign: "right" },
  } as unknown as string,
  {
    content: formatNumber(pl.totalGrossWeight, 1),
    styles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", halign: "right" },
  } as unknown as string]);

  autoTable(doc, {
    startY: tableStartY,
    head: [["Style", "Color", "Size", "Qty", "Unit", "Pkgs", "CBM", "Gross (kg)"]],
    body,
    theme: "grid",
    margin: { left: marginX, right: marginX },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2,
      textColor: SLATE_700,
      lineColor: SLATE_200,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 24 },
      2: { cellWidth: 18 },
      3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 12 },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 20, halign: "right" },
    },
  });

  // ---------- Weight breakdown box ----------
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Two-column summary
  setColor(doc, SLATE_700);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  const summaryItems: { label: string; value: string }[] = [
    { label: "Total Items", value: formatNumber(items.length) },
    { label: "Total Quantity", value: formatNumber(pl.totalQuantity) },
    { label: "Total Packages", value: formatNumber(pl.totalCartons) },
    { label: "Total CBM", value: `${formatNumber(pl.totalCbm, 2)} CBM` },
    { label: "Gross Weight", value: `${formatNumber(pl.totalGrossWeight, 1)} KG` },
    { label: "Net Weight", value: `${formatNumber(pl.totalNetWeight, 1)} KG` },
  ];

  let sumY = finalY;
  const colW = contentWidth / 3;
  for (let i = 0; i < summaryItems.length; i++) {
    const col = i % 3;
    if (col === 0 && i > 0) sumY += 9;
    const x = marginX + col * colW;
    const it = summaryItems[i]!;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(doc, SLATE_500);
    doc.text(it.label.toUpperCase(), x, sumY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setColor(doc, NAVY);
    doc.text(it.value, x, sumY + 5);
  }

  // ---------- Signature block ----------
  const sigY = pageHeight - 30;
  setColor(doc, SLATE_500);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  // Two signature lines
  const sigWidth = (contentWidth - 20) / 2;
  doc.setDrawColor(SLATE_500[0], SLATE_500[1], SLATE_500[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX, sigY, marginX + sigWidth, sigY);
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY);

  doc.text("ISSUED BY", marginX, sigY + 4);
  doc.text("APPROVED BY", pageWidth - marginX - sigWidth, sigY + 4);

  // ---------- Footer ----------
  doc.setFontSize(7);
  setColor(doc, SLATE_500);
  doc.text(
    `Generated by ${branding.systemTitle} · ${formatDate(pl.generatedAt ?? new Date().toISOString())}`,
    pageWidth / 2, pageHeight - 8, { align: "center" },
  );
  doc.text(`Page 1`, pageWidth - marginX, pageHeight - 8, { align: "right" });

  // ---------- Save ----------
  const safeName = (filename ?? pl.packingListNumber).replace(/[\/\\:*?"<>|]/g, "_");
  doc.save(`${safeName}.pdf`);
}
