// Every video source the vault can play lives here.
// Add a new source by adding a new entry to SOURCES.
// Each entry returns an embed strategy: iframe URL, direct <video> source,
// or a "widget" (Twitter/TikTok blockquote) handled by Player.jsx.

// ─── ID extractors ───────────────────────────────────────────────────────────

const YT_RE       = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/;
const VIMEO_RE    = /vimeo\.com\/(?:video\/)?(\d+)/;
const DRIVE_RE    = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/;
const TIKTOK_RE   = /tiktok\.com\/(?:@[^/]+\/video|v)\/(\d+)/;
const DAILY_RE    = /(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/;
const STREAM_RE   = /streamable\.com\/(?:e\/|s\/)?([a-z0-9]+)/i;
const WISTIA_RE   = /(?:wistia\.com\/medias\/|wistia\.net\/medias\/|wi\.st\/medias\/|fast\.wistia\.net\/embed\/iframe\/)([a-z0-9]+)/i;
const IG_RE       = /instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/;
const TWITCH_VOD  = /twitch\.tv\/videos\/(\d+)/;
const TWITCH_CLIP = /(?:clips\.twitch\.tv\/(?:embed\?clip=)?|twitch\.tv\/\w+\/clip\/)([\w-]+)/;
const TWITCH_CH   = /twitch\.tv\/(?!videos\/|directory\/)([\w-]+)(?:\/|$|\?)/;
const TWITTER_RE  = /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/;
const REDDIT_RE   = /reddit\.com\/r\/(\w+)\/comments\/(\w+)/;
const FB_RE       = /facebook\.com\/(?:[^/]+\/videos\/|watch\/?\?v=|reel\/|video\.php\?v=)(\d+)/;
const FILE_RE     = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv)(\?|$)/i;
const HLS_RE      = /\.(m3u8)(\?|$)/i;
const IMG_RE      = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?|$)/i;
const DBOX_RE     = /(dropbox\.com|dl\.dropboxusercontent\.com)/i;

// Normalize Dropbox share links to direct-stream form
function dropboxDirect(url) {
  return url
    .replace("www.dropbox.com", "dl.dropboxusercontent.com")
    .replace(/\?dl=0(&|$)/, "?raw=1$1")
    .replace(/&dl=0(&|$)/, "&raw=1$1")
    .replace(/([?&])(?:dl|raw)=0/, "$1raw=1")
    .replace(/\?$/, "");
}

// ─── Source registry ─────────────────────────────────────────────────────────
// Order matters: more specific matches first (e.g. twitch clip before twitch channel)

export const SOURCES = [
  {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    match: (u) => YT_RE.test(u),
    id_of: (u) => u.match(YT_RE)?.[1],
    thumb: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    embed: { kind: "youtube-api" },
  },
  {
    id: "vimeo",
    name: "Vimeo",
    color: "#1AB7EA",
    match: (u) => VIMEO_RE.test(u),
    id_of: (u) => u.match(VIMEO_RE)?.[1],
    thumb: (id) => `https://vumbnail.com/${id}.jpg`,
    embed: { kind: "iframe", build: (id, _u, opts) =>
      `https://player.vimeo.com/video/${id}?autoplay=1${opts?.muted ? "&muted=1" : ""}` },
  },
  {
    id: "drive",
    name: "Drive",
    color: "#34A853",
    match: (u) => DRIVE_RE.test(u),
    id_of: (u) => u.match(DRIVE_RE)?.[1],
    thumb: (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w640`,
    embed: { kind: "iframe", build: (id) => `https://drive.google.com/file/d/${id}/preview` },
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#fe2c55",
    match: (u) => TIKTOK_RE.test(u),
    id_of: (u) => u.match(TIKTOK_RE)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id) => `https://www.tiktok.com/embed/v2/${id}`, portrait: true },
  },
  {
    id: "twitter",
    name: "X / Twitter",
    color: "#1DA1F2",
    match: (u) => TWITTER_RE.test(u),
    id_of: (u) => u.match(TWITTER_RE)?.[1],
    thumb: () => null,
    embed: { kind: "twitter-widget" },
  },
  {
    id: "facebook",
    name: "Facebook",
    color: "#1877F2",
    match: (u) => FB_RE.test(u) || /fb\.watch\//.test(u),
    id_of: (u) => u.match(FB_RE)?.[1] || u,
    thumb: () => null,
    embed: { kind: "iframe", build: (_id, url) =>
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true` },
  },
  {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    match: (u) => IG_RE.test(u),
    id_of: (u) => u.match(IG_RE)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id) => `https://www.instagram.com/p/${id}/embed/`, portrait: true },
  },
  {
    id: "reddit",
    name: "Reddit",
    color: "#FF4500",
    match: (u) => REDDIT_RE.test(u),
    id_of: (u) => u.match(REDDIT_RE)?.[2],
    thumb: () => null,
    embed: { kind: "iframe", build: (_id, url) => {
      // redditmedia embed wants the post path. Strip query and trailing slash.
      const path = url.replace(/^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com/, "").split("?")[0].replace(/\/$/, "");
      return `https://www.redditmedia.com${path}/?embed=true&ref_source=embed`;
    } },
  },
  {
    id: "twitch-clip",
    name: "Twitch Clip",
    color: "#9146FF",
    match: (u) => TWITCH_CLIP.test(u),
    id_of: (u) => u.match(TWITCH_CLIP)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id, _u, opts) =>
      `https://clips.twitch.tv/embed?clip=${id}&parent=${opts?.parent || "localhost"}&autoplay=true` },
  },
  {
    id: "twitch-vod",
    name: "Twitch VOD",
    color: "#9146FF",
    match: (u) => TWITCH_VOD.test(u),
    id_of: (u) => u.match(TWITCH_VOD)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id, _u, opts) =>
      `https://player.twitch.tv/?video=v${id}&parent=${opts?.parent || "localhost"}&autoplay=true` },
  },
  {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    match: (u) => TWITCH_CH.test(u),
    id_of: (u) => u.match(TWITCH_CH)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id, _u, opts) =>
      `https://player.twitch.tv/?channel=${id}&parent=${opts?.parent || "localhost"}&autoplay=true` },
  },
  {
    id: "dailymotion",
    name: "Dailymotion",
    color: "#00aaff",
    match: (u) => DAILY_RE.test(u),
    id_of: (u) => u.match(DAILY_RE)?.[1],
    thumb: (id) => `https://www.dailymotion.com/thumbnail/video/${id}`,
    embed: { kind: "iframe", build: (id) => `https://www.dailymotion.com/embed/video/${id}?autoplay=1` },
  },
  {
    id: "streamable",
    name: "Streamable",
    color: "#0F90FA",
    match: (u) => STREAM_RE.test(u),
    id_of: (u) => u.match(STREAM_RE)?.[1],
    thumb: (id) => `https://cdn-cf-east.streamable.com/image/${id}.jpg`,
    embed: { kind: "iframe", build: (id) => `https://streamable.com/e/${id}?autoplay=1` },
  },
  {
    id: "wistia",
    name: "Wistia",
    color: "#54bbff",
    match: (u) => WISTIA_RE.test(u),
    id_of: (u) => u.match(WISTIA_RE)?.[1],
    thumb: () => null,
    embed: { kind: "iframe", build: (id) =>
      `https://fast.wistia.net/embed/iframe/${id}?autoPlay=true` },
  },
  {
    id: "dropbox",
    name: "Dropbox",
    color: "#0061FF",
    match: (u) => DBOX_RE.test(u) && (FILE_RE.test(u) || /\?(?:dl|raw)=/.test(u)),
    id_of: (u) => u,
    thumb: () => null,
    embed: { kind: "video", src: (url) => dropboxDirect(url) },
  },
  {
    id: "hls",
    name: "HLS Stream",
    color: "#888",
    match: (u) => HLS_RE.test(u),
    id_of: (u) => u,
    thumb: () => null,
    embed: { kind: "hls", src: (url) => url },
  },
  {
    id: "file",
    name: "Video File",
    color: "#F59E0B",
    match: (u) => FILE_RE.test(u),
    id_of: (u) => u,
    thumb: () => null,
    embed: { kind: "video", src: (url) => url },
  },
  {
    id: "image",
    name: "Image",
    color: "#8B5CF6",
    match: (u) => IMG_RE.test(u),
    id_of: (u) => u,
    thumb: (_id, u) => u,
    embed: { kind: "image", src: (url) => url },
  },
  // Catch-all: any other http(s) URL. Player will try server-side extraction
  // on open. Must stay LAST so explicit sources match first.
  {
    id: "extract",
    name: "Webpage",
    color: "#6B7280",
    match: (u) => /^https?:\/\//i.test(u),
    id_of: (u) => u,
    thumb: () => null,
    embed: { kind: "extract" },
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function getSource(url) {
  if (!url) return null;
  return SOURCES.find((s) => s.match(url)) || null;
}

export function isPlayable(url) {
  return !!getSource(url);
}

export function getThumb(url) {
  const s = getSource(url);
  if (!s) return null;
  const id = s.id_of(url);
  if (!id) return null;
  return s.thumb(id, url);
}

export function getSourceMeta(url) {
  const s = getSource(url);
  if (!s) return { id: "link", name: "Link", color: "#6B7280" };
  return { id: s.id, name: s.name, color: s.color };
}

// Used by Player.jsx to know what to render
export function getEmbed(url, opts = {}) {
  const s = getSource(url);
  if (!s) return null;
  const id = s.id_of(url);
  const k = s.embed.kind;
  if (k === "iframe") return { kind: "iframe", src: s.embed.build(id, url, opts), portrait: !!s.embed.portrait, source: s };
  if (k === "video")  return { kind: "video",  src: s.embed.src(url), source: s };
  if (k === "hls")    return { kind: "hls",    src: s.embed.src(url), source: s };
  if (k === "image")  return { kind: "image",  src: s.embed.src(url), source: s };
  if (k === "extract") return { kind: "extract", url, source: s };
  if (k === "youtube-api")    return { kind: "youtube-api",    ytId: id, source: s };
  if (k === "twitter-widget") return { kind: "twitter-widget", url, tweetId: id, source: s };
  return null;
}

// Quick directory used by UI filters
export const SOURCE_OPTIONS = SOURCES.map((s) => ({ id: s.id, name: s.name, color: s.color }));
