import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get("id");

  if (!sheetId) {
    return NextResponse.json({ error: "Missing sheet id" }, { status: 400 });
  }

  try {
    // Strategy 1: gviz/tq returns JSON with sheet metadata including all tab names
    // The response wraps JSON in: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const gvizRes = await fetch(gvizUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!gvizRes.ok) {
      throw new Error(`Sheet not accessible (${gvizRes.status}). Make sure it is shared as Anyone with link can view.`);
    }

    const raw = await gvizRes.text();

    // Extract the JSON object from the wrapper
    const jsonStr = raw.replace(/^[^{]*/, "").replace(/\);?\s*$/, "");
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error("Could not parse sheet response. Make sure the sheet is shared publicly.");
    }

    // The parsed object has a "table" key but NOT a tab list.
    // However, gviz returns the current sheet's name in parsed.table.parsedNumHeaders etc.
    // Tab names live in a different place: we need to scrape the HTML or use another method.
    
    // Strategy 2: Fetch the htmlview which has tab names embedded in JS
    const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
    const htmlRes = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      
      // Pattern 1: "sheetnames":["Tab1","Tab2"]
      const snMatch = html.match(/"sheetnames":\[([^\]]+)\]/);
      if (snMatch) {
        const tabs = snMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        if (tabs.length > 0) return NextResponse.json({ tabs });
      }

      // Pattern 2: data-sheet-name="Tab Name"
      const dataNamesMatches = [...html.matchAll(/data-sheet-name="([^"]+)"/g)];
      if (dataNamesMatches.length > 0) {
        const tabs = [...new Set(dataNamesMatches.map((m) => decodeEntities(m[1])))].filter(Boolean);
        if (tabs.length > 0) return NextResponse.json({ tabs });
      }

      // Pattern 3: id="sheet-button-{name}"  (older format)
      const buttonMatches = [...html.matchAll(/id="sheet-button-([^"]+)"/g)];
      if (buttonMatches.length > 0) {
        const tabs = buttonMatches.map((m) => decodeEntities(decodeURIComponent(m[1]))).filter(Boolean);
        if (tabs.length > 0) return NextResponse.json({ tabs });
      }

      // Pattern 4: title attribute on tab buttons
      const titleMatches = [...html.matchAll(/class="[^"]*goog-tab[^"]*"[^>]*title="([^"]+)"/g)];
      if (titleMatches.length > 0) {
        const tabs = [...new Set(titleMatches.map((m) => decodeEntities(m[1])))].filter(Boolean);
        if (tabs.length > 0) return NextResponse.json({ tabs });
      }

      // Pattern 5: look for the JavaScript variable that holds sheet names
      const jsVarMatch = html.match(/\["([^"]+)"\s*,\s*(?:\d+)\s*,\s*(?:"[^"]*"|\d+)/g);
      if (jsVarMatch) {
        const tabs = jsVarMatch
          .map((m) => m.match(/\["([^"]+)"/)?.[1])
          .filter(Boolean)
          .filter((t) => !t.startsWith("http"));
        if (tabs.length > 0) return NextResponse.json({ tabs: [...new Set(tabs)] });
      }
    }

    // Strategy 3: Try fetching gviz/tq with sheet index 0, 1, 2... 
    // Each successful response with data = a real tab. Name comes from the URL query.
    // But we don't know the names this way.
    
    // Strategy 4: Use the Sheets API v4 without a key (works for public sheets via discovery)
    // /feeds/worksheets still works for some sheets despite being v3
    const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${sheetId}/public/basic?alt=json`;
    const feedRes = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (feedRes.ok) {
      const feedJson = await feedRes.json();
      const entries = feedJson?.feed?.entry || [];
      if (entries.length > 0) {
        const tabs = entries.map((e) => e.title.$t).filter(Boolean);
        return NextResponse.json({ tabs });
      }
    }

    // Nothing worked — return error asking user to add tab names manually
    throw new Error("NEEDS_MANUAL_TABS");

  } catch (err) {
    if (err.message === "NEEDS_MANUAL_TABS") {
      return NextResponse.json({ error: "NEEDS_MANUAL_TABS" }, { status: 200 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
