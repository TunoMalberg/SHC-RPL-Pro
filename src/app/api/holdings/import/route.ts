import { NextRequest, NextResponse } from "next/server";
import { parseHoldingsBuffer } from "@/lib/holdings/excelParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Keine Datei übermittelt." }, { status: 400 });
    }
    const fileName = (file as File).name ?? "import.xlsx";
    const size = (file as Blob).size;
    if (size > MAX_BYTES) {
      return NextResponse.json({ error: `Datei zu groß (max. ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 413 });
    }
    const arrayBuf = await (file as Blob).arrayBuffer();
    const result = await parseHoldingsBuffer(arrayBuf, fileName);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Import fehlgeschlagen: ${msg}` }, { status: 422 });
  }
}