"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/lib/theme";
import { getThumbCandidates } from "@/lib/sources";
import { normalizeCoverUrl, proxiedMediaUrl } from "@/lib/utils";

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

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== "undefined") return new URL(url, window.location.origin).toString();
  return url;
}
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function modelMatrix(x, y, z, w, h) {
  const out = new Float32Array(16);
  out[0] = w; out[5] = h; out[10] = 1; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
function rayPlaneHit(ray, quad) {
  if (!ray || !quad) return false;
  const dz = ray.dir[2];
  if (Math.abs(dz) < 0.0001) return false;
  const t = (quad.z - ray.origin[2]) / dz;
  if (t <= 0) return false;
  const x = ray.origin[0] + ray.dir[0] * t;
  const y = ray.origin[1] + ray.dir[1] * t;
  return x >= quad.x - quad.w / 2 && x <= quad.x + quad.w / 2 && y >= quad.y - quad.h / 2 && y <= quad.y + quad.h / 2;
}


function isProbablyImageUrl(url) {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(String(url || ""));
}

function xrImageCandidates(item) {
  const out = [];
  if (item?.thumbnail) out.push(proxiedMediaUrl(normalizeCoverUrl(item.thumbnail)));
  if (isProbablyImageUrl(item?.url)) out.push(proxiedMediaUrl(normalizeCoverUrl(item.url)));
  for (const candidate of getThumbCandidates(item?.url || "")) out.push(candidate);
  return [...new Set(out.filter(Boolean))];
}

function XRPreviewImage({ item, large = false }) {
  const [idx, setIdx] = useState(0);
  const [dead, setDead] = useState(false);
  const candidates = xrImageCandidates(item);
  const src = candidates[idx];
  if (!src || dead) {
    return (
      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.03))" }}>
        <div style={{ textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: large ? 34 : 18, fontWeight: 950, color: "#fff" }}>{kindForItem(item)}</div>
          <div style={{ marginTop: 8, color: T.text4, fontSize: large ? 13 : 10, fontWeight: 800 }}>No preview image</div>
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => {
        const next = idx + 1;
        if (next < candidates.length) setIdx(next);
        else setDead(true);
      }}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${item?.cover_position_x || 50}% ${item?.cover_position_y || 50}%`, display: "block" }}
    />
  );
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

  if (opts.imageUrl) {
    const imgBox = opts.imageBox || { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const redrawImage = (img) => {
      try {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const scale = Math.max(imgBox.w / iw, imgBox.h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = imgBox.x + (imgBox.w - dw) / 2;
        const dy = imgBox.y + (imgBox.h - dh) / 2;
        ctx.save();
        roundRect(ctx, imgBox.x, imgBox.y, imgBox.w, imgBox.h, opts.radius || 54);
        ctx.clip();
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
        const fade = ctx.createLinearGradient(0, canvas.height * 0.45, 0, canvas.height);
        fade.addColorStop(0, "rgba(0,0,0,0)");
        fade.addColorStop(1, "rgba(0,0,0,.72)");
        ctx.fillStyle = fade;
        roundRect(ctx, 0, 0, canvas.width, canvas.height, opts.radius || 54);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${opts.titleSize || 62}px -apple-system, BlinkMacSystemFont, Inter, Arial`;
        wrapText(ctx, String(lines[0] || ""), 44, opts.badge ? 172 : canvas.height - 148, canvas.width - 88, opts.titleSize || 62, opts.titleLines || 2);
        const sub = String(lines[1] || "");
        if (sub) {
          ctx.fillStyle = muted;
          ctx.font = `600 ${opts.subSize || 32}px -apple-system, BlinkMacSystemFont, Inter, Arial`;
          wrapText(ctx, sub, 44, canvas.height - 72, canvas.width - 88, opts.subSize || 34, 1);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      } catch {}
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => redrawImage(img);
    img.onerror = () => {};
    img.src = absoluteUrl(opts.imageUrl);
  }

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
    attribute vec3 a_pos;
    attribute vec2 a_uv;
    uniform mat4 u_mvp;
    varying vec2 v_uv;
    void main() {
      gl_Position = u_mvp * vec4(a_pos, 1.0);
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
  const [escHint, setEscHint] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [wallDistance, setWallDistance] = useState(() => { try { return Number(localStorage.getItem("vv_xr_wall_distance") || 4.2); } catch { return 4.2; } });
  const wallDistanceRef = useRef(4.2);
  const [calibration, setCalibration] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vv_xr_calibration") || "{}") || {}; } catch { return {}; }
  });

  const shelfRef = useRef(0);
  const lastEscRef = useRef(0);
  const escTimerRef = useRef(null);
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
    try { localStorage.setItem("vv_xr_calibration", JSON.stringify(calibration || {})); } catch {}
  }, [calibration]);
  useEffect(() => {
    wallDistanceRef.current = clamp(wallDistance, 2.6, 7);
    try { localStorage.setItem("vv_xr_wall_distance", String(wallDistanceRef.current)); } catch {}
  }, [wallDistance]);

  function requestEscapeClose() {
    const now = Date.now();
    if (now - lastEscRef.current < 950) {
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
      escTimerRef.current = null;
      lastEscRef.current = 0;
      setEscHint(false);
      closeAll();
      return;
    }
    lastEscRef.current = now;
    setEscHint(true);
    setStatus("Press Esc again to exit VR preview.");
    if (escTimerRef.current) clearTimeout(escTimerRef.current);
    escTimerRef.current = setTimeout(() => {
      setEscHint(false);
      lastEscRef.current = 0;
    }, 1300);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestEscapeClose();
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

  useEffect(() => () => {
    if (escTimerRef.current) clearTimeout(escTimerRef.current);
    closeSessionOnly();
  }, []);

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
    setStatus("VR running. Point at overlay cards when available. Trigger opens selected. Squeeze cycles shelves.");

    const baseLayer = new XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer });
    const refSpace = await session.requestReferenceSpace("local-floor").catch(() => session.requestReferenceSpace("viewer"));

    const program = createProgram(gl);
    const posLoc = gl.getAttribLocation(program, "a_pos");
    const uvLoc = gl.getAttribLocation(program, "a_uv");
    const mvpLoc = gl.getUniformLocation(program, "u_mvp");
    const alphaLoc = gl.getUniformLocation(program, "u_alpha");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5, 0, 0, 1,
       0.5, -0.5, 0, 1, 1,
      -0.5,  0.5, 0, 0, 0,
      -0.5,  0.5, 0, 0, 0,
       0.5, -0.5, 0, 1, 1,
       0.5,  0.5, 0, 1, 0,
    ]), gl.STATIC_DRAW);

    let textures = [];
    let layout = [];
    const latestRay = { current: null };
    const hitTarget = { current: null };
    const rebuild = () => {
      textures.forEach((t) => t.tex && gl.deleteTexture(t.tex));
      textures = buildTextures(gl, shelves, items, userData, shelfRef.current, itemRef.current, modeRef.current);
    };
    rebuild();
    glCleanupRef.current = () => textures.forEach((t) => t.tex && gl.deleteTexture(t.tex));

    const handleSelect = () => {
      const target = hitTarget.current;
      if (target?.role === "shelf") { setSelectedShelf(target.idx); shelfRef.current = target.idx; setSelectedItem(0); itemRef.current = 0; setTimeout(rebuild, 0); return; }
      if (target?.role === "item") { setSelectedItem(target.idx); itemRef.current = target.idx; setTimeout(rebuild, 0); return; }
      if (target?.role === "screen") { openActiveItem(); return; }
      openActiveItem();
    };
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

    function drawQuad(tex, quad, view) {
      const model = modelMatrix(quad.x, quad.y, quad.z, quad.w, quad.h);
      const mvp = mat4Multiply(view.projectionMatrix, mat4Multiply(view.transform.inverse.matrix, model));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniformMatrix4fv(mvpLoc, false, mvp);
      gl.uniform1f(alphaLoc, quad.alpha ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function getInputRay(xrFrame) {
      for (const source of session.inputSources) {
        if (!source.targetRaySpace) continue;
        const rayPose = xrFrame.getPose(source.targetRaySpace, refSpace);
        if (!rayPose) continue;
        const m = rayPose.transform.matrix;
        return { origin: [m[12], m[13], m[14]], dir: [-m[8], -m[9], -m[10]] };
      }
      return null;
    }

    function frame(_time, xrFrame) {
      const pose = xrFrame.getViewerPose(refSpace);
      session.requestAnimationFrame(frame);
      if (!pose) return;
      latestRay.current = getInputRay(xrFrame);
      layout = buildWorldLayout(textures, modeRef.current, wallDistanceRef.current, hitTarget.current);
      hitTarget.current = layout.find((q) => q.hit && rayPlaneHit(latestRay.current, q)) || null;
      if (hitTarget.current) layout = buildWorldLayout(textures, modeRef.current, wallDistanceRef.current, hitTarget.current);
      gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
      gl.clearColor(0.003, 0.003, 0.005, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 20, 12);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      for (const view of pose.views) {
        const viewport = baseLayer.getViewport(view);
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        for (const quad of layout) drawQuad(quad.tex, quad, view);
      }
    }
    session.requestAnimationFrame(frame);
  };

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 30000, background: "radial-gradient(circle at 50% 12%, rgba(255,255,255,0.10), rgba(0,0,0,0.96) 42%, #000)", color: T.text1, overflow: "auto" }}>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", opacity: running ? 0 : 0.22, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, minHeight: "100dvh", display: "grid", gridTemplateRows: "auto 1fr", padding: 18, opacity: running ? 0.08 : 1, pointerEvents: running ? "none" : "auto", transition: "opacity .2s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: T.text4, textTransform: "uppercase", letterSpacing: 1.4 }}>WebXR Library</div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: -1 }}>Ambient Vault</div>
            <div style={{ fontSize: 12, color: T.text4, marginTop: 4 }}>Desktop preview is safe to test without a headset. Press Esc twice to exit.</div>
          </div>
          <button onClick={closeAll} style={xrButton(false)}>Close</button>
        </div>
        {escHint && (
          <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 5, padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", background: "rgba(20,20,24,.84)", backdropFilter: "blur(16px)", color: "#fff", fontSize: 12, fontWeight: 800, boxShadow: "0 18px 60px rgba(0,0,0,.45)" }}>
            Press Esc again to exit
          </div>
        )}

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

            <div style={{ border: "1px solid rgba(255,255,255,.12)", background: "radial-gradient(circle at 50% 5%, rgba(255,255,255,.12), rgba(255,255,255,.03) 42%, rgba(0,0,0,.22))", borderRadius: 28, overflow: "hidden", position: "relative", minHeight: 390, display: "grid", placeItems: "center", boxShadow: "inset 0 0 80px rgba(255,255,255,.025)", padding: mode === "wall" ? 18 : 24 }}>
              <div style={{ position: "absolute", top: 18, left: "50%", width: "68%", height: 1, transform: "translateX(-50%)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.32), transparent)" }} />
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,.28) 100%)" }} />

              {activeItems.length ? mode === "wall" ? (
                <div style={{ position: "relative", zIndex: 1, width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 12, alignItems: "stretch", transform: "perspective(900px) rotateX(1deg)", transformOrigin: "center" }}>
                  {activeItems.slice(0, 18).map((item, idx) => {
                    const selected = idx === selectedItem;
                    return (
                      <button key={item.key || idx} onClick={() => { setSelectedItem(idx); itemRef.current = idx; }} onDoubleClick={() => { itemRef.current = idx; openActiveItem(); }} style={{ minHeight: 152, borderRadius: 18, overflow: "hidden", border: selected ? "2px solid rgba(255,255,255,.78)" : "1px solid rgba(255,255,255,.12)", background: selected ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.045)", color: "#fff", textAlign: "left", padding: 0, cursor: "pointer", boxShadow: selected ? "0 20px 70px rgba(255,255,255,.14)" : "0 14px 50px rgba(0,0,0,.28)", transform: selected ? "translateY(-4px) scale(1.015)" : "translateY(0)", transition: "transform .16s ease, border-color .16s ease" }}>
                        <div style={{ height: 108, background: "#050506" }}><XRPreviewImage item={item} /></div>
                        <div style={{ padding: "9px 10px 10px" }}>
                          <div style={{ fontSize: 9, color: T.text4, fontWeight: 900, letterSpacing: .7 }}>{kindForItem(item)}</div>
                          <div style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.15, marginTop: 4 }}>{shortText(labelForItem(item), 35)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ position: "relative", zIndex: 1, width: "min(760px, 94%)", display: "grid", gridTemplateColumns: "minmax(180px, 300px) minmax(0, 1fr)", gap: 18, alignItems: "center" }} className="xr-cinema-grid">
                  <div style={{ aspectRatio: "4 / 5", borderRadius: 28, overflow: "hidden", border: "1px solid rgba(255,255,255,.2)", boxShadow: "0 35px 110px rgba(0,0,0,.58)", background: "#050506" }}><XRPreviewImage item={activeItem} large /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: T.text4, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>{kindForItem(activeItem)}</div>
                    <div style={{ color: "#fff", fontSize: 31, lineHeight: 1, letterSpacing: -1.2, fontWeight: 950, marginTop: 8 }}>{shortText(labelForItem(activeItem), 80)}</div>
                    {!!ratingForItem(activeItem, userData) && <div style={{ marginTop: 12, color: "#fff", fontSize: 15 }}>★ {ratingForItem(activeItem, userData)}</div>}
                    <button onClick={openActiveItem} style={{ ...xrButton(true), marginTop: 18, minWidth: 190 }}>Open in Vault</button>
                  </div>
                </div>
              ) : (
                <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 24 }}>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>No media in this shelf</div>
                  <div style={{ color: T.text4, fontSize: 13, marginTop: 6 }}>Choose another shelf or add media to this folder.</div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 8, marginTop: 12 }}>
              {activeItems.slice(0, 10).map((item, idx) => (
                <button key={item.key || idx} onClick={() => { setSelectedItem(idx); itemRef.current = idx; }} style={{ minHeight: 72, borderRadius: 14, border: idx === selectedItem ? "1px solid rgba(255,255,255,.65)" : "1px solid rgba(255,255,255,.10)", background: idx === selectedItem ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.045)", color: "#fff", textAlign: "left", padding: 0, overflow: "hidden", cursor: "pointer", display: "grid", gridTemplateColumns: "42px 1fr" }}>
                  <div style={{ height: "100%", background: "#050506" }}><XRPreviewImage item={item} /></div>
                  <div style={{ padding: 8, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: T.text4, fontWeight: 800 }}>{kindForItem(item)}</div>
                    <div style={{ fontSize: 11, fontWeight: 850, marginTop: 4, lineHeight: 1.2, overflow: "hidden" }}>{shortText(labelForItem(item), 28)}</div>
                  </div>
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
              <button onClick={() => setCalibrationOpen((v) => !v)} style={xrButton(false)}>Controller calibration</button>
              <label style={{ display: "grid", gap: 6, color: T.text3, fontSize: 11, fontWeight: 850, padding: "8px 2px" }}>Wall distance: {wallDistance.toFixed(1)}m
                <input type="range" min="2.8" max="6.5" step="0.1" value={wallDistance} onChange={(e) => setWallDistance(Number(e.target.value))} />
              </label>
            </div>
            {calibrationOpen && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)", display: "grid", gap: 10 }}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>Aim calibration</div>
                {[['x','Horizontal'], ['y','Vertical'], ['scale','Pointer scale']].map(([key,label]) => (
                  <label key={key} style={{ display: "grid", gap: 5, color: T.text3, fontSize: 11, fontWeight: 800 }}>
                    {label}: {Number(calibration?.[key] ?? (key === 'scale' ? 100 : 0))}
                    <input type="range" min={key === 'scale' ? 70 : -50} max={key === 'scale' ? 140 : 50} value={calibration?.[key] ?? (key === 'scale' ? 100 : 0)} onChange={(e) => setCalibration((c) => ({ ...c, [key]: Number(e.target.value) }))} />
                  </label>
                ))}
                <button onClick={() => setCalibration({ x: 0, y: 0, scale: 100 })} style={xrSmallButton}>Reset calibration</button>
              </div>
            )}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.10)", paddingTop: 14, color: T.text3, fontSize: 13, lineHeight: 1.55 }}>
              <div style={{ color: "#fff", fontWeight: 850, marginBottom: 4 }}>Quest controls</div>
              <div>Trigger points/selects shelf cards, media cards, or opens the screen.</div>
              <div>Squeeze cycles shelves.</div>
              <div>The media wall is room-locked, not head-locked.</div>
              <div>Desktop preview: arrows move, Enter opens, M toggles, Esc twice exits.</div>
              <div style={{ marginTop: 10, color: T.text4 }}>{status}</div>
            </div>
          </section>
        </div>
      </div>

      {running && (
        <div style={{ position: "fixed", left: 18, bottom: 18, zIndex: 6, padding: "10px 13px", borderRadius: 999, background: "rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", fontSize: 12, fontWeight: 850 }}>
          Quest: point + trigger · squeeze shelves · Esc twice exits preview
        </div>
      )}

      <style jsx>{`
        @media (max-width: 920px) {
          .xr-shell-grid { grid-template-columns: 1fr !important; }
          .xr-cinema-grid { grid-template-columns: 1fr !important; }
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
    list.push({ role: "screen", hit: true, tex: makeTexture(gl, [labelForItem(activeItem), `${kindForItem(activeItem)}${rating ? ` · ★ ${rating}` : ""}`], { imageUrl: xrImageCandidates(activeItem)[0], badge: mode === "cinema" ? "Cinema" : "Selected", bg: "#0b1017", mid: "#111827", glow: "rgba(190,220,255,.13)", selected: true, titleSize: 58, titleLines: 3, subSize: 34 }) });
  } else {
    list.push({ role: "screen", tex: makeTexture(gl, ["No media here", "Choose another shelf or add items to this folder."], { badge: "Empty", bg: "#0c0c0d", titleSize: 52 }) });
  }

  activeItems.slice(0, 12).forEach((item, idx) => {
    const rating = ratingForItem(item, userData);
    const selected = idx === selectedItem;
    list.push({ role: "item", idx, selected, hit: true, tex: makeTexture(gl, [labelForItem(item), `${kindForItem(item)}${rating ? ` · ★ ${rating}` : ""}`], { imageUrl: xrImageCandidates(item)[0], badge: kindForItem(item), bg: selected ? "#141922" : "#0d0f13", glow: selected ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.03)", selected, titleSize: 38, subSize: 25 }) });
  });

  list.push({ role: "hint", tex: makeTexture(gl, ["Select = next media", "Squeeze = next shelf · Use overlay to open selected item."], { badge: "Controls", bg: "#0b0b0c", titleSize: 36, subSize: 28 }) });
  return list;
}

function buildWorldLayout(textures, mode, distance = 4.2, hitTarget = null) {
  const d = -clamp(distance, 2.6, 7);
  const quads = [];
  const title = textures.find((t) => t.role === "title");
  if (title) quads.push({ ...title, x: 0, y: 1.95, z: d, w: 3.9, h: 0.55, alpha: 0.98 });

  const shelves = textures.filter((t) => t.role === "shelf");
  shelves.forEach((t, i) => {
    const q = { ...t, x: -2.45, y: 1.25 - i * 0.38, z: d + 0.12, w: 1.05, h: 0.30, alpha: t.selected ? 1 : 0.84, hit: true };
    if (hitTarget?.role === "shelf" && hitTarget.idx === t.idx) q.alpha = 1;
    quads.push(q);
  });

  const screen = textures.find((t) => t.role === "screen");
  if (screen) {
    quads.push({ ...screen, x: mode === "cinema" ? 0.25 : 0.35, y: mode === "cinema" ? 0.65 : 1.02, z: d, w: mode === "cinema" ? 2.7 : 1.7, h: mode === "cinema" ? 1.55 : 0.95, alpha: 0.98, hit: true });
  }

  const media = textures.filter((t) => t.role === "item");
  const cols = mode === "cinema" ? 4 : 5;
  media.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const center = cols === 5 ? -0.7 : -0.45;
    const x = center + col * 0.58;
    const y = mode === "cinema" ? -0.62 - row * 0.36 : 0.12 - row * 0.40;
    const z = d - Math.abs(x) * 0.06;
    const hovered = hitTarget?.role === "item" && hitTarget.idx === t.idx;
    quads.push({ ...t, x, y, z, w: t.selected || hovered ? 0.52 : 0.48, h: t.selected || hovered ? 0.30 : 0.27, alpha: t.selected || hovered ? 1 : 0.82, hit: true });
  });

  const hint = textures.find((t) => t.role === "hint");
  if (hint) quads.push({ ...hint, x: 0.25, y: -1.85, z: d + 0.1, w: 2.6, h: 0.32, alpha: 0.75 });
  return quads;
}
