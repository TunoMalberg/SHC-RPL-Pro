/**
 * PowerPoint-Export — Gemeinsame Bausteine: Farben, Schriften, Zahlenformat, Kopf-/Fußzeilen.
 * (aus powerpoint.ts ausgelagert, Paket 4)
 */

import { formatAT } from "../../format";
import type PptxGenJS from "pptxgenjs";

export type Pptx = PptxGenJS;

export type Slide = PptxGenJS.Slide;

/* Schelhammer Capital Corporate Design Colors */
export const COLORS = {
  primary: "20201E",       // Mattschwarz
  secondary: "4D4A47",     // Naturgrau
  accent: "D31220",        // Feuerrot
  success: "5A8A50",       // Gras (darker)
  danger: "D31220",        // Feuerrot
  light: "F5F3F0",         // Warm light bg
  white: "FFFFFF",         // Reinweiß
  text: "20201E",          // Mattschwarz
  muted: "4D4A47",         // Naturgrau
  gras: "8FB687",          // Gras (Cash)
  eis: "87BBE6",           // Eis (Bonds)
  feuerrot: "D31220",      // Feuerrot (Equities)
  feuerrot80: "DA4D3E",    // 80% Feuerrot
  feuerrot60: "E37E67",    // 60% Feuerrot
  feuerrot40: "EDAC98",    // 40% Feuerrot
  feuerrot20: "F7D8CD",    // 20% Feuerrot
  oliv: "969476",
  lavendel: "8A83BE",
  heu: "D0D2AD",
  orange: "FAC075",
};

export const FONT_HEADING = "Sitka Heading";

export const FONT_BODY = "Skeena";

export function fmt(n: number, decimals = 0): string {
  return formatAT(n, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtEur(n: number): string {
  return `€ ${fmt(n)}`;
}

export function fmtPct(n: number, decimals = 1): string {
  return `${fmt(n, decimals)}%`;
}

export function addSlideFooter(slide: Slide) {
  slide.addText("Vertraulichkeitsstufe: Klasse 1", {
    x: 0.3,
    y: 5.15,
    w: 5,
    h: 0.25,
    fontSize: 7,
    fontFace: FONT_BODY,
    color: "9CA3AF",
  });
}

export function addRedTriangle(slide: Slide, pptx: Pptx, x: number, y: number, size: number) {
  slide.addShape(pptx.ShapeType.rtTriangle, {
    x,
    y,
    w: size,
    h: size,
    fill: { color: COLORS.accent },
    rotate: 0,
  });
}

export function addSectionSlide(pptx: Pptx, title: string, subtitle: string) {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  /* Red triangle design element */
  addRedTriangle(slide, pptx, 7.8, 3.8, 2.2);

  slide.addText(title, {
    x: 0.8,
    y: 2,
    w: 8.4,
    h: 1,
    fontSize: 32,
    fontFace: FONT_HEADING,
    color: COLORS.white,
    bold: true,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 3.1,
    w: 1.5,
    h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide.addText(subtitle, {
    x: 0.8,
    y: 3.4,
    w: 8.4,
    h: 0.6,
    fontSize: 16,
    fontFace: FONT_BODY,
    color: COLORS.feuerrot40,
  });
}

export function addSlideHeader(slide: Slide, title: string, pptx?: Pptx) {
  /* SHC-style header: thin red top line + title */
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 10,
    h: 0.06,
    fill: { color: COLORS.accent },
  });

  slide.addText(title, {
    x: 0.5,
    y: 0.2,
    w: 8.5,
    h: 0.6,
    fontSize: 22,
    fontFace: FONT_HEADING,
    color: COLORS.primary,
    bold: true,
  });

  /* Subtle separator line */
  slide.addShape("rect", {
    x: 0.5,
    y: 0.85,
    w: 9,
    h: 0.01,
    fill: { color: "E5E2DF" },
  });

  if (pptx) {
    addSlideFooter(slide);
  }
}
