import * as cheerio from "cheerio";

export const FB_HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "cache-control": "no-cache",
};

export function formatFollowers(raw: string): string {
  const n = parseInt(raw.replace(/,/g, ""), 10);
  if (isNaN(n)) return raw;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export interface FetchResult {
  html: string | null;
  rateLimited: boolean;
}

export async function tryFetchUrl(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: FB_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(9_000),
    });
    if (res.status === 429) return { html: null, rateLimited: true };
    if (!res.ok) return { html: null, rateLimited: false };
    const text = await res.text();
    if (text.length < 500) return { html: null, rateLimited: false };
    return { html: text, rateLimited: false };
  } catch {
    return { html: null, rateLimited: false };
  }
}

export async function fetchFbPage(uid: string): Promise<FetchResult> {
  const isNumeric = /^\d+$/.test(uid);
  const primaryUrl = isNumeric
    ? `https://www.facebook.com/profile.php?id=${uid}`
    : `https://www.facebook.com/${uid}`;

  const r1 = await tryFetchUrl(primaryUrl);
  if (r1.html) return { html: r1.html, rateLimited: false };
  if (r1.rateLimited) return { html: null, rateLimited: true };

  const fallbackUrl = isNumeric
    ? `https://www.facebook.com/${uid}`
    : `https://www.facebook.com/profile.php?id=${uid}`;
  const r2 = await tryFetchUrl(fallbackUrl);
  return { html: r2.html, rateLimited: r2.rateLimited };
}

export interface ProfileData {
  name: string | null;
  username: string | null;
  userId: string;
  followerCount: string | null;
  nationality: string | null;
  photoUrl: string | null;
  instagramUsername: string | null;
}

// Instagram path segments that are not usernames
const IG_BLACKLIST = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts",
  "sharedfiles", "web", "login", "signup", "direct", "ar", "lite",
  "challenge", "graphql", "static", "legal", "about", "privacy",
  "help", "api", "oauth", "embed",
]);

function validateIgUsername(raw: string): string | null {
  const cleaned = raw.replace(/\/$/, "").trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 30) return null;
  if (IG_BLACKLIST.has(cleaned.toLowerCase())) return null;
  if (!/^[a-zA-Z0-9_.]+$/.test(cleaned)) return null;
  return cleaned;
}

function extractInstagramUsername(
  html: string,
  $: ReturnType<typeof cheerio.load>,
): string | null {

  // ── Strategy 1: scan every <a href> in the DOM ──────────────────────────
  const hrefs: string[] = [];
  $("a[href]").each((_, el) => { hrefs.push($(el).attr("href") ?? ""); });

  for (const href of hrefs) {
    // Direct link: https://www.instagram.com/username
    const direct = href.match(
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30})\/?(?:\?|#|$)/i,
    );
    if (direct) { const r = validateIgUsername(direct[1]); if (r) return r; }

    // Facebook redirect: l.php?u=https%3A%2F%2Finstagram.com%2Fusername
    if (href.includes("instagram")) {
      try {
        const decoded = decodeURIComponent(href);
        const m = decoded.match(
          /instagram\.com\/([a-zA-Z0-9_.]{1,30})\/?(?:\?|#|$)/i,
        );
        if (m) { const r = validateIgUsername(m[1]); if (r) return r; }
      } catch {}
    }
  }

  // ── Strategy 2: escape-slash patterns inside JSON blobs ─────────────────
  // Facebook embeds external URLs as "https:\/\/www.instagram.com\/username\/"
  const escapedSlash = /instagram\.com\\\/([a-zA-Z0-9_.]{1,30})(?:\\\/|["'\s]|$)/g;
  for (const m of html.matchAll(escapedSlash)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 3: linked_social_username in FB GraphQL data ───────────────
  // "linked_social_username":"johnsmith"
  const linkedSocial = /"linked_social_username"\s*:\s*"([a-zA-Z0-9_.]{2,30})"/g;
  for (const m of html.matchAll(linkedSocial)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 4: "instagram":"username" JSON key ─────────────────────────
  const igKey = /"instagram"\s*:\s*"([a-zA-Z0-9_.]{2,30})"/g;
  for (const m of html.matchAll(igKey)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 5: provider=INSTAGRAM near a username ──────────────────────
  // {"provider":"INSTAGRAM","username":"johnsmith"}
  const igProvider = /"INSTAGRAM"[^}]{0,120}"username"\s*:\s*"([a-zA-Z0-9_.]{2,30})"/g;
  for (const m of html.matchAll(igProvider)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }
  // reversed: "username":"x","provider":"INSTAGRAM"
  const igProviderRev = /"username"\s*:\s*"([a-zA-Z0-9_.]{2,30})"[^}]{0,120}"INSTAGRAM"/g;
  for (const m of html.matchAll(igProviderRev)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 6: URL-encoded instagram.com in raw HTML ───────────────────
  // instagram.com%2Fusername  (appears in data-href, action attrs, etc.)
  const urlEncoded = /instagram\.com(?:%2F|\/)([a-zA-Z0-9_.]{1,30})(?:%2F|\/|&|"|'|\s|\\|$)/gi;
  for (const m of html.matchAll(urlEncoded)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 7: "url":"https://www.instagram.com/username" ─────────────
  const urlField = /"url"\s*:\s*"https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30})(?:\/|"|$)/g;
  for (const m of html.matchAll(urlField)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 8: @username near "instagram" keyword in text ──────────────
  // "Follow us on Instagram @johnsmith"
  const atNearIg = /instagram[^<"]{0,80}@([a-zA-Z0-9_.]{2,30})/gi;
  for (const m of html.matchAll(atNearIg)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  // ── Strategy 9: plain instagram.com/username anywhere in HTML ───────────
  const plain = /instagram\.com\/([a-zA-Z0-9_.]{1,30})\/?(?:["'\s?\\]|$)/g;
  for (const m of html.matchAll(plain)) {
    const r = validateIgUsername(m[1]);
    if (r) return r;
  }

  return null;
}

export function parseProfileHtml(html: string, uid: string): ProfileData {
  const $ = cheerio.load(html);

  const rawName = $('meta[property="og:title"]').attr("content") ?? null;
  const name = rawName
    ? rawName.replace(/\s*[|\-–—]\s*(?:Facebook|FB).*$/i, "").trim() || null
    : null;

  const ogUrl = $('meta[property="og:url"]').attr("content") ?? "";
  let username: string | null = null;
  const usernameMatch = ogUrl.match(/facebook\.com\/([^/?]+)/);
  if (usernameMatch && usernameMatch[1] !== "profile.php") {
    username = usernameMatch[1];
  }

  let userId: string = uid;
  const androidUrl = $('meta[property="al:android:url"]').attr("content") ?? "";
  const androidIdMatch = androidUrl.match(/profile\/(\d+)/);
  if (androidIdMatch) userId = androidIdMatch[1];
  if (!androidIdMatch) {
    const idMatch = ogUrl.match(/[?&]id=(\d+)/);
    if (idMatch) userId = idMatch[1];
  }

  let followerCount: string | null = null;
  const desc = $('meta[property="og:description"]').attr("content") ?? "";
  const followerMatch = desc.match(/([\d,]+)\s*(?:followers|likes)/i);
  if (followerMatch) followerCount = formatFollowers(followerMatch[1]);
  if (!followerCount) {
    const bodyText = $.root().text();
    const bodyMatch = bodyText.match(/([\d,]+)\s*(?:followers|likes)/i);
    if (bodyMatch) followerCount = formatFollowers(bodyMatch[1]);
  }

  let nationality: string | null = null;
  const locationPatterns = [
    /"location":\s*\{[^}]*"name":\s*"([^"]+)"/,
    /"hometown":\s*\{[^}]*"name":\s*"([^"]+)"/,
    /Lives in ([^<"]+)/i,
    /From ([^<"]+)/i,
  ];
  for (const pattern of locationPatterns) {
    const m = html.match(pattern);
    if (m) { nationality = m[1].trim(); break; }
  }

  let photoUrl: string | null = null;
  const ogImage = $('meta[property="og:image"]').attr("content") ?? null;
  if (ogImage && (ogImage.startsWith("https://") || ogImage.startsWith("http://"))) {
    photoUrl = ogImage;
  }

  const instagramUsername = extractInstagramUsername(html, $);

  return { name, username, userId, followerCount, nationality, photoUrl, instagramUsername };
}
