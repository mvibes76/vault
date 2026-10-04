import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

const MAX_HTML_BYTES = 1_500_000;

// Lists files in a PUBLIC Google Drive folder
// Uses the embeddedfolderview page which works for any publicly-shared folder
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("id");

  if (!folderId) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{10,160}$/.test(folderId)) return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  try { await guardProxyRequest(request, "file"); }
  catch (error) { return securityErrorResponse(error, "Drive folder unavailable"); }

  try {
    const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0" },
      timeoutMs: 10000,
    });

    if (!res.ok) {
      throw new Error(`Folder not accessible (${res.status}). Make sure it is shared as Anyone with link can view.`);
    }

    const html = await readTextLimited(res, MAX_HTML_BYTES);

    // Files appear as entries with: flip-entry-info contains href="https://drive.google.com/file/d/FILE_ID/view"
    // and the name in flip-entry-title
    const files = [];

    // Pattern: <a ... href="https://drive.google.com/file/d/ID/view..." ...> ... <div class="flip-entry-title">NAME</div>
    const entryRegex = /href="https:\/\/drive\.google\.com\/(file\/d\/|drive\/folders\/)([^"/?]+)[^"]*"[\s\S]*?flip-entry-title">([^<]+)</g;
    let m;
    while ((m = entryRegex.exec(html)) !== null) {
      const isFolder = m[1].includes("folders");
      files.push({
        id: m[2],
        name: decodeEntities(m[3]),
        isFolder,
        url: isFolder
          ? `https://drive.google.com/drive/folders/${m[2]}`
          : `https://drive.google.com/file/d/${m[2]}/view`,
      });
    }

    // Fallback pattern if markup differs
    if (files.length === 0) {
      const altRegex = /data-id="([^"]+)"[\s\S]{0,500}?flip-entry-title">([^<]+)</g;
      while ((m = altRegex.exec(html)) !== null) {
        files.push({
          id: m[1],
          name: decodeEntities(m[2]),
          isFolder: false,
          url: `https://drive.google.com/file/d/${m[1]}/view`,
        });
      }
    }

    return NextResponse.json({ files });
  } catch (err) {
    return securityErrorResponse(err, "Drive folder unavailable");
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
