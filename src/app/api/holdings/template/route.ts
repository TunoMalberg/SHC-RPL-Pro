import { NextResponse } from "next/server";
import { buildHoldingsTemplate } from "@/lib/holdings/excelTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buf = await buildHoldingsTemplate();
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="SHC_Bestandsportfolio_Vorlage.xlsx"',
      "Cache-Control": "private, max-age=3600",
    },
  });
}