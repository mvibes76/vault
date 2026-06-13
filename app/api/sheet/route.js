import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get("id");
  const tab = searchParams.get("tab");

  if (!sheetId || !tab) {
    return NextResponse.json({ error: "Missing id or tab" }, { status: 400 });
  }

  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

    const res = await fetch(gvizUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      throw new Error(`Could not fetch tab "${tab}" (${res.status})`);
    }

    const csv = await res.text();

    // If Google returns an HTML error page instead of CSV, catch it
    if (csv.trim().startsWith("<!")) {
      throw new Error(`Tab "${tab}" not found or sheet not public.`);
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
