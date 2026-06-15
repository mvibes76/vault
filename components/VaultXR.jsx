"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/lib/theme";

function labelForItem(item) {
  return item?.title || item?.name || item?.url || "Untitled";
}

function kindForItem(item) {
  const raw = String(item?.type || item?.source || "link").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  if (raw.includes("image") || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(url)) return "PHOTO";
  if (raw.includes("video") || ["youtube", "vimeo", "drive", "hls", "reddit"].includes(raw) || /\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/.test(url)) return "VIDEO";
  if (raw.includes("pdf") || /\.pdf(\?|#|$)/.test(url)) return "PDF";
  return "LINK";
}

function folderForItem(item) {
  return String(item?.folder || "No folder").trim() || "No folder";
}

function ratingForItem(item, userData) {
  const d = userData?.[item?.key] || {};
  return Number(d.rating || 0);
}

function shortText(text, max = 54) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function buildShelves(folders = [], items = []) {
  const safeFolders = Array.isArray(folders) ? folders : [];
  const roots = safeFolders
    .filter((f) => !String(f?.parent_folder || "").trim())
    .map((f) => ({
      id: `folder:${f.name}`,
      name: String(f.name || "Untitled").trim() || "Untitled",
      subtitle: String(f.kind || "folder").toUpperCase(),
      kind: f.kind || "folder",
      parent: "",
    }));

  const children = safeFolders
    .filter((f) => String(f?.parent_folder || "").trim())
    .map((f) => ({
      id: `gallery:${f.parent_folder}/${f.name}`,
      name: String(f.name || "Untitled").trim() || "Untitled",
      subtitle: `${String(f.parent_folder || "").trim()} / ${String(f.kind || "gallery").toUpperCase()}`,
      kind: f.kind || "gallery",
      parent: String(f.parent_folder || "").trim(),
    }));

  const fromItems = [...new Set(items.map(folderForItem).filter(Boolean))]
    .filter((name) => ![...roots, ...children].some((f) => f.name.toLowerCase() === String(name).toLowerCase()))
    .map((name) => ({ id: `loose:${name}`, name, subtitle: "FOLDER", kind: "folder", parent: "" }));

  const all = { id: "all", name: "Everything", subtitle: `${items.length} saved`, kind: "all", parent: "" };
  return [all, ...roots, ...children, ...fromItems].slice(0, 18);
}

function itemsForShelf(shelf, items = []) {
  if (!shelf || shelf.id === "all") return items.slice(0, 24);
  return items.filter((item) => folderForItem(item).toLowerCase() === shelf.name.toLowerCase()).slice(0, 24);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function makeTexture(gl, lines, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width || 1024;
  canvas.height = opts.height || 512;
  const ctx = canvas.getContext("2d");
  const bg = opts.bg || "#101014";
  const accent = opts.accent || "#fff";
  const muted = opts.muted || "rgba(255,255,255,.58)";

  const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grd.addColorStop(0, bg);
  grd.addColorStop(0.55, opts.mid || "#0b0b0f");
  grd.addColorStop(1, "#020203");
  ctx.fillStyle = grd;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, opts.radius || 54);
  ctx.fill();

  if (opts.glow) {
    const rg = ctx.createRadialGradient(canvas.width * 0.72, canvas.height * 0.2, 10, canvas.width * 0.72, canvas.height * 0.2, canvas.width * 0.8);
    rg.addColorStop(0, opts.glow);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, opts.radius || 54);
    ctx.fill();
  }

  ctx.strokeStyle = opts.selected ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.16)";
  ctx.lineWidth = opts.selected ? 8 : 4;
  roundRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, (opts.radius || 54) - 10);
  ctx.stroke();

  if (opts.badge) {
    ctx.fillStyle = "rgba(255,255,255,.11)";
    roundRect(ctx, 42, 38, Math.min(290, 80 + String(opts.badge).length * 17), 58, 29);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = "800 27px -apple-system, BlinkMacSystemFont, Inter, Arial";
    ctx.fillText(String(opts.badge).toUpperCase(), 70, 76);
  }

  ctx.fillStyle = "#fff";
  ctx.font = `900 ${opts.titleSize || 62}px -apple-system, BlinkMacSystemFont, Inter, Arial`;
  wrapText(ctx, String(lines[0] || ""), 44, opts.badge ? 172 : 96, canvas.width - 88, opts.titleSize || 62, opts.titleLines || 2);

  const sub = String(lines[1] || "");
  if (sub) {
    ctx.fillStyle = muted;
    ctx.font = `600 ${opts.subSize || 32}px -apple-system, BlinkMacSystemFont, Inter, Arial`;
    wrapText(ctx, sub, 44, canvas.height - 108, canvas.width - 88, opts.subSize || 34, 2);
  }

  if (opts.footer) {
    ctx.fillStyle = "rgba(255,255,255,.33)";
    ctx.font = "600 24px -apple-system, BlinkMacSystemFont, Inter, Arial";
    ctx.fillText(opts.footer, 44, canvas.height - 42);
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  return texture;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "XR shader compile failed");
  return shader;
}

function createProgram(gl) {
  const vs = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    uniform vec4 u_rect;
    uniform float u_curve;
    varying vec2 v_uv;
    void main() {
      vec2 p = vec2(u_rect.x + a_pos.x * u_rect.z, u_rect.y + a_pos.y * u_rect.w);
      float bow = (p.x * p.x) * u_curve;
      gl_Position = vec4(p.x, p.y - bow, 0.0, 1.0);
      v_uv = a_uv;
    }
  `;
  const fs = `
    precision mediump float;
    uniform sampler2D u_tex;
    uniform float u_alpha;
    varying vec2 v_uv;
    void main() {
      vec4 c = texture2D(u_tex, v_uv);
      gl_FragColor = vec4(c.rgb, c.a * u_alpha);
    }
  `;
  const vert = compileShader(gl, gl.VERTEX_SHADER, vs);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "XR shader link failed");
  return program;
}

export default function VaultXR({ items = [], folders = [], userData = {}, onClose, onOpen }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sessionRef = useRef(null);
  const glCleanupRef = useRef(null);

  const [status, setStatus] = useState("Ready");
  const [running, setRunning] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [mode, setMode] = useState("wall");

  const shelfRef = useRef(0);
  const itemRef = useRef(0);
  const modeRef = useRef("wall");

  const shelves = useMemo(() => buildShelves(folders, items), [folders, items]);
  const activeShelf = shelves[selectedShelf] || shelves[0] || { name: "Everything", id: "all" };
  const activeItems = useMemo(() => itemsForShelf(activeShelf, items), [activeShelf, items]);
  const activeItem = activeItems[selectedItem] || activeItems[0] || null;

  useEffect(() => { shelfRef.current = selectedShelf; }, [selectedShelf]);
  useEffect(() => { itemRef.current = selectedItem; }, [selectedItem]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAll();
      }
      if (e.key === "ArrowLeft") prevShelf();
      if (e.key === "ArrowRight") nextShelf();
      if (e.key === "ArrowUp") prevItem();
      if (e.key === "ArrowDown") nextItem();
      if (e.key === "Enter") openActiveItem();
      if (e.key.toLowerCase() === "m") toggleMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shelves, activeItems, activeItem]);

  useEffect(() => () => closeSessionOnly(), []);

  const closeSessionOnly = useCallback(() => {
    glCleanupRef.current?.();
    glCleanupRef.current = null;
    sessionRef.current?.end?.().catch?.(() => {});
    sessionRef.current = null;
    setRunning(false);
  }, []);

  const closeAll = useCallback(() => {
    closeSessionOnly();
    onClose?.();
  }, [closeSessionOnly, onClose]);

  const nextShelf = useCallback(() => {
    setSelectedShelf((current) => {
      const next = shelves.length ? (current + 1) % shelves.length : 0;
      shelfRef.current = next;
      itemRef.current = 0;
      setSelectedItem(0);
      return next;
    });
  }, [shelves.length]);

  const prevShelf = useCallback(() => {
    setSelectedShelf((current) => {
      const next = shelves.length ? (current - 1 + shelves.length) % shelves.length : 0;
      shelfRef.current = next;
      itemRef.current = 0;
      setSelectedItem(0);
      return next;
    });
  }, [shelves.length]);

  const nextItem = useCallback(() => {
    setSelectedItem((current) => {
      const next = activeItems.length ? (current + 1) % activeItems.length : 0;
      itemRef.current = next;
      return next;
    });
  }, [activeItems.length]);

  const prevItem = useCallback(() => {
    setSelectedItem((current) => {
      const next = activeItems.length ? (current - 1 + activeItems.length) % activeItems.length : 0;
      itemRef.current = next;
      return next;
    });
  }, [activeItems.length]);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === "wall" ? "cinema" : "wall";
      modeRef.current = next;
      return next;
    });
  }, []);

  const openActiveItem = useCallback(() => {
    const item = activeItems[itemRef.current] || activeItem;
    if (!item) return;
    closeSessionOnly();
    onOpen?.(item);
    onClose?.();
  }, [activeItems, activeItem, closeSessionOnly, onClose, onOpen]);

  const startVR = async () => {
    if (!navigator.xr) {
      setStatus("This browser does not expose WebXR.");
      return;
    }
    const ok = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
    if (!ok) {
      setStatus("Immersive VR is not supported here. Open this on Quest Browser or another WebXR browser.");
      return;
    }

    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: false, antialias: true, preserveDrawingBuffer: false });
    if (!gl) {
      setStatus("WebGL could not start.");
      return;
    }
    if (gl.makeXRCompatible) await gl.makeXRCompatible();

    let session;
    try {
      session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "dom-overlay"],
        domOverlay: { root: overlayRef.current },
      });
    } catch {
      session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
    }

    sessionRef.current = session;
    setRunning(true);
    setStatus("VR running. Select = next media. Squeeze = next shelf. Use overlay controls to open.");

    const baseLayer = new XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer });
    const refSpace = await session.requestReferenceSpace("local-floor").catch(() => session.requestReferenceSpace("viewer"));

    const program = createProgram(gl);
    const posLoc = gl.getAttribLocation(program, "a_pos");
    const uvLoc = gl.getAttribLocation(program, "a_uv");
    const rectLoc = gl.getUniformLocation(program, "u_rect");
    const alphaLoc = gl.getUniformLocation(program, "u_alpha");
    const curveLoc = gl.getUniformLocation(program, "u_curve");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 0, 1,
      1, 0, 1, 1,
      0, 1, 0, 0,
      0, 1, 0, 0,
      1, 0, 1, 1,
      1, 1, 1, 0,
    ]), gl.STATIC_DRAW);

    let textures = [];
    const rebuild = () => {
      textures.forEach((t) => t.tex && gl.deleteTexture(t.tex));
      textures = buildTextures(gl, shelves, items, userData, shelfRef.current, itemRef.current, modeRef.current);
    };
    rebuild();
    glCleanupRef.current = () => textures.forEach((t) => t.tex && gl.deleteTexture(t.tex));

    const handleSelect = () => { nextItem(); setTimeout(rebuild, 0); };
    const handleSqueeze = () => { nextShelf(); setTimeout(rebuild, 0); };
    session.addEventListener("select", handleSelect);
    session.addEventListener("squeeze", handleSqueeze);
    session.addEventListener("end", () => {
      glCleanupRef.current?.();
      glCleanupRef.current = null;
      setRunning(false);
      sessionRef.current = null;
      setStatus("VR session ended.");
    });

    function drawQuad(tex, rect, alpha = 1, curve = 0) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform4f(rectLoc, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform1f(alphaLoc, alpha);
      gl.uniform1f(curveLoc, curve);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function frame(_time, xrFrame) {
      const pose = xrFrame.getViewerPose(refSpace);
      session.requestAnimationFrame(frame);
      if (!pose) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
      gl.clearColor(0.003, 0.003, 0.005, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      for (const view of pose.views) {
        const viewport = baseLayer.getViewport(view);
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        drawScene(textures, drawQuad, modeRef.current);
      }
    }
    session.requestAnimationFrame(frame);
  };

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 30000, background: "radial-gradient(circle at 50% 12%, rgba(255,255,255,0.10), rgba(0,0,0,0.96) 42%, #000)", color: T.text1, overflow: "auto" }}>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", opacity: running ? 0 : 0.22, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, minHeight: "100dvh", display: "grid", gridTemplateRows: "auto 1fr", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: T.text4, textTransform: "uppercase", letterSpacing: 1.4 }}>WebXR Library</div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: -1 }}>Ambient Vault</div>
          </div>
          <button onClick={closeAll} style={xrButton(false)}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 300px) minmax(0, 1fr) minmax(260px, 360px)", gap: 14, alignItems: "stretch" }} className="xr-shell-grid">
          <section style={panelStyle}>
            <div style={sectionLabel}>Shelves</div>
            <div style={{ display: "grid", gap: 8, maxHeight: "calc(100dvh - 210px)", overflow: "auto", paddingRight: 4 }}>
              {shelves.map((shelf, idx) => {
                const count = itemsForShelf(shelf, items).length;
                const selected = idx === selectedShelf;
                return (
                  <button key={shelf.id} onClick={() => { setSelectedShelf(idx); setSelectedItem(0); shelfRef.current = idx; itemRef.current = 0; }} style={{ ...shelfButton, borderColor: selected ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.10)", background: selected ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.045)" }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", color: "#fff", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shelf.name}</span>
                      <span style={{ display: "block", color: T.text4, fontSize: 11, marginTop: 2 }}>{shelf.subtitle} · {count}</span>
                    </span>
                    <span style={{ color: selected ? "#fff" : T.text4, fontSize: 18 }}>›</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ ...panelStyle, minHeight: 520, display: "grid", gridTemplateRows: "auto 1fr auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={sectionLabel}>{mode === "wall" ? "Curved media wall" : "Cinema screen"}</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{activeShelf.name}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={toggleMode} style={xrSmallButton}>{mode === "wall" ? "Cinema" : "Wall"}</button>
                <button onClick={prevItem} style={xrSmallButton}>Prev</button>
                <button onClick={nextItem} style={xrSmallButton}>Next</button>
              </div>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,.12)", background: "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.025))", borderRadius: 28, overflow: "hidden", position: "relative", minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 80px rgba(255,255,255,.025)" }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 10%, rgba(255,255,255,.10), transparent 42%)" }} />
              {activeItem ? (
                <div style={{ position: "relative", zIndex: 1, width: "min(720px, 92%)", textAlign: "center", padding: 20 }}>
                  <div style={{ width: "min(380px, 72vw)", aspectRatio: "4 / 5", margin: "0 auto 18px", borderRadius: 26, border: "1px solid rgba(255,255,255,.18)", background: "linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,.035))", display: "grid", placeItems: "center", boxShadow: "0 30px 90px rgba(0,0,0,.5)" }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.text4, fontWeight: 900, letterSpacing: 1.2, marginBottom: 10 }}>{kindForItem(activeItem)}</div>
                      <div style={{ fontSize: 24, color: "#fff", fontWeight: 950, letterSpacing: -0.8, padding: "0 24px" }}>{shortText(labelForItem(activeItem), 62)}</div>
                      {!!ratingForItem(activeItem, userData) && <div style={{ marginTop: 12, color: "#fff", fontSize: 15 }}>★ {ratingForItem(activeItem, userData)}</div>}
                    </div>
                  </div>
                  <button onClick={openActiveItem} style={{ ...xrButton(true), width: "min(320px, 100%)" }}>Open in Vault</button>
                </div>
              ) : (
                <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 24 }}>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>No media in this shelf</div>
                  <div style={{ color: T.text4, fontSize: 13, marginTop: 6 }}>Choose another shelf or add media to this folder.</div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginTop: 12 }}>
              {activeItems.slice(0, 10).map((item, idx) => (
                <button key={item.key || idx} onClick={() => { setSelectedItem(idx); itemRef.current = idx; }} style={{ minHeight: 70, borderRadius: 14, border: idx === selectedItem ? "1px solid rgba(255,255,255,.65)" : "1px solid rgba(255,255,255,.10)", background: idx === selectedItem ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.045)", color: "#fff", textAlign: "left", padding: 10, cursor: "pointer" }}>
                  <div style={{ fontSize: 10, color: T.text4, fontWeight: 800 }}>{kindForItem(item)}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{shortText(labelForItem(item), 32)}</div>
                </button>
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionLabel}>Controls</div>
            <div style={{ display: "grid", gap: 8 }}>
              <button onClick={startVR} disabled={running} style={xrButton(!running)}>{running ? "VR session running" : "Enter VR"}</button>
              <button onClick={nextShelf} style={xrButton(false)}>Next shelf</button>
              <button onClick={nextItem} style={xrButton(false)}>Next media</button>
              <button onClick={openActiveItem} disabled={!activeItem} style={xrButton(Boolean(activeItem))}>Open selected</button>
            </div>
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.10)", paddingTop: 14, color: T.text3, fontSize: 13, lineHeight: 1.55 }}>
              <div style={{ color: "#fff", fontWeight: 850, marginBottom: 4 }}>Quest controls</div>
              <div>Select cycles media.</div>
              <div>Squeeze cycles shelves.</div>
              <div>Overlay buttons work when DOM Overlay is available.</div>
              <div style={{ marginTop: 10, color: T.text4 }}>{status}</div>
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 920px) {
          .xr-shell-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const panelStyle = {
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.055)",
  backdropFilter: "blur(22px)",
  borderRadius: 24,
  padding: 14,
  boxShadow: "0 30px 120px rgba(0,0,0,.35)",
};

const sectionLabel = { fontSize: 11, color: T.text4, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 900, marginBottom: 9 };
const shelfButton = { width: "100%", border: "1px solid rgba(255,255,255,.10)", borderRadius: 15, padding: "11px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", textAlign: "left" };
const xrSmallButton = { padding: "8px 11px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 12, fontWeight: 850, cursor: "pointer" };
function xrButton(primary) {
  return { padding: "12px 15px", borderRadius: 15, border: primary ? "1px solid rgba(255,255,255,.75)" : "1px solid rgba(255,255,255,.14)", background: primary ? "#fff" : "rgba(255,255,255,.075)", color: primary ? "#000" : "#fff", fontWeight: 900, cursor: "pointer", minHeight: 44 };
}

function buildTextures(gl, shelves, items, userData, selectedShelf, selectedItem, mode) {
  const list = [];
  const activeShelf = shelves[selectedShelf] || shelves[0] || { name: "Everything", id: "all" };
  const activeItems = itemsForShelf(activeShelf, items);
  const activeItem = activeItems[selectedItem] || activeItems[0];

  list.push({ role: "title", tex: makeTexture(gl, ["Ambient Vault", `${activeShelf.name} · ${activeItems.length} item${activeItems.length === 1 ? "" : "s"}`], { badge: "VR Library", bg: "#0b0c10", mid: "#11131a", glow: "rgba(255,255,255,.09)", titleSize: 68, titleLines: 1 }) });

  shelves.slice(0, 10).forEach((shelf, idx) => {
    const count = itemsForShelf(shelf, items).length;
    const selected = idx === selectedShelf;
    list.push({ role: "shelf", idx, selected, tex: makeTexture(gl, [shelf.name, `${shelf.subtitle} · ${count}`], { badge: selected ? "Selected" : shelf.kind || "Folder", bg: selected ? "#1a1a1c" : "#0e0e10", mid: selected ? "#181818" : "#09090b", glow: selected ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.035)", selected, titleSize: 42, subSize: 28 }) });
  });

  if (activeItem) {
    const rating = ratingForItem(activeItem, userData);
    list.push({ role: "screen", tex: makeTexture(gl, [labelForItem(activeItem), `${kindForItem(activeItem)}${rating ? ` · ★ ${rating}` : ""}`], { badge: mode === "cinema" ? "Cinema" : "Selected", bg: "#0b1017", mid: "#111827", glow: "rgba(190,220,255,.13)", selected: true, titleSize: 58, titleLines: 3, subSize: 34 }) });
  } else {
    list.push({ role: "screen", tex: makeTexture(gl, ["No media here", "Choose another shelf or add items to this folder."], { badge: "Empty", bg: "#0c0c0d", titleSize: 52 }) });
  }

  activeItems.slice(0, 12).forEach((item, idx) => {
    const rating = ratingForItem(item, userData);
    const selected = idx === selectedItem;
    list.push({ role: "item", idx, selected, tex: makeTexture(gl, [labelForItem(item), `${kindForItem(item)}${rating ? ` · ★ ${rating}` : ""}`], { badge: kindForItem(item), bg: selected ? "#141922" : "#0d0f13", glow: selected ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.03)", selected, titleSize: 38, subSize: 25 }) });
  });

  list.push({ role: "hint", tex: makeTexture(gl, ["Select = next media", "Squeeze = next shelf · Use overlay to open selected item."], { badge: "Controls", bg: "#0b0b0c", titleSize: 36, subSize: 28 }) });
  return list;
}

function drawScene(textures, drawQuad, mode) {
  const title = textures.find((t) => t.role === "title");
  if (title) drawQuad(title.tex, [-0.68, 0.72, 1.36, 0.18], 0.96, 0.015);

  const shelves = textures.filter((t) => t.role === "shelf");
  shelves.forEach((t, i) => {
    const x = -0.94;
    const y = 0.48 - i * 0.15;
    drawQuad(t.tex, [x, y, 0.34, 0.115], t.selected ? 1 : 0.78, 0.01);
  });

  const screen = textures.find((t) => t.role === "screen");
  if (screen) {
    if (mode === "cinema") drawQuad(screen.tex, [-0.42, 0.08, 0.84, 0.48], 0.98, 0.02);
    else drawQuad(screen.tex, [-0.32, 0.18, 0.64, 0.36], 0.96, 0.02);
  }

  const items = textures.filter((t) => t.role === "item");
  items.forEach((t, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = -0.46 + col * 0.30;
    const y = mode === "cinema" ? -0.48 - row * 0.16 : -0.17 - row * 0.17;
    drawQuad(t.tex, [x, y, 0.25, 0.13], t.selected ? 0.98 : 0.76, 0.018);
  });

  const hint = textures.find((t) => t.role === "hint");
  if (hint) drawQuad(hint.tex, [-0.46, -0.88, 0.92, 0.14], 0.72, 0.008);
}
