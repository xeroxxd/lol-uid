import { Router, type Request, type Response } from "express";
import * as cheerio from "cheerio";

const router = Router();

const HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "cache-control": "no-cache",
};

function formatFollowers(raw: string): string {
  const n = parseInt(raw.replace(/,/g, ""), 10);
  if (isNaN(n)) return raw;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryFetchUrl(url: string): Promise<{ html: string | null; rateLimited: boolean }> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
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

function parseProfileFromHtml(html: string) {
  const $ = cheerio.load(html);

  const rawName = $('meta[property="og:title"]').attr("content") ?? null;
  const name = rawName
    ? rawName.replace(/\s*[|\-–—]\s*(?:Facebook|FB).*$/i, "").trim() || null
    : null;

  let username: string | null = null;
  const ogUrl = $('meta[property="og:url"]').attr("content") ?? "";
  const usernameMatch = ogUrl.match(/facebook\.com\/([^/?]+)/);
  if (usernameMatch && usernameMatch[1] !== "profile.php") {
    username = usernameMatch[1];
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

  let photoUrl: string | null = null;
  const ogImage = $('meta[property="og:image"]').attr("content") ?? null;
  if (ogImage && (ogImage.startsWith("https://") || ogImage.startsWith("http://"))) {
    photoUrl = ogImage;
  }

  let instagramUsername: string | null = null;
  const igPatterns = [
    /instagram\.com\/([a-zA-Z0-9_.]{1,30})\/?(?:["'\s?]|$)/g,
    /"instagram\.com\/([a-zA-Z0-9_.]{1,30})"/g,
  ];
  const igBlacklist = new Set([
    "p", "reel", "reels", "tv", "stories", "explore", "accounts", "sharedfiles",
  ]);
  for (const pattern of igPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const candidate = m[1].toLowerCase();
      if (!igBlacklist.has(candidate) && candidate.length > 1) {
        instagramUsername = m[1];
        break;
      }
    }
    if (instagramUsername) break;
  }

  return { name, username, followerCount, photoUrl, instagramUsername };
}

router.post("/validate-bulk", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body;
  if (!body || !Array.isArray(body.uids) || body.uids.length === 0) {
    res.status(400).json({ error: "uids array is required" });
    return;
  }

  const allUids: string[] = (body.uids as unknown[])
    .slice(0, 5000)
    .map(String)
    .filter(Boolean);
  const total = allUids.length;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, 15_000);

  const emit = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  let processedCount = 0;
  let rateLimitedUntil = 0;
  const queue = [...allUids];
  const CONCURRENCY = 5;

  const worker = async () => {
    while (true) {
      if (res.writableEnded) break;

      if (rateLimitedUntil > Date.now()) {
        const wait = rateLimitedUntil - Date.now() + 500;
        emit({ event: "rate_limited", retryAfter: Math.ceil(wait / 1000) });
        await sleep(wait);
      }

      const uid = queue.shift();
      if (uid === undefined) break;

      try {
        const isNumeric = /^\d+$/.test(uid);
        const primaryUrl = isNumeric
          ? `https://www.facebook.com/profile.php?id=${uid}`
          : `https://www.facebook.com/${uid}`;

        const r1 = await tryFetchUrl(primaryUrl);

        if (r1.rateLimited) {
          rateLimitedUntil = Date.now() + 30_000;
          queue.unshift(uid);
          continue;
        }

        let html = r1.html;

        if (!html) {
          const fallbackUrl = isNumeric
            ? `https://www.facebook.com/${uid}`
            : `https://www.facebook.com/profile.php?id=${uid}`;
          const r2 = await tryFetchUrl(fallbackUrl);
          if (r2.rateLimited) {
            rateLimitedUntil = Date.now() + 30_000;
            queue.unshift(uid);
            continue;
          }
          html = r2.html;
        }

        processedCount++;

        if (!html) {
          emit({ uid, status: "dead", progress: processedCount, total });
        } else {
          const profile = parseProfileFromHtml(html);
          const isLive = !!(profile.name || profile.followerCount || profile.username);
          emit({
            uid,
            status: isLive ? "live" : "dead",
            name: profile.name,
            username: profile.username,
            followerCount: profile.followerCount,
            photoUrl: profile.photoUrl,
            instagramUsername: profile.instagramUsername,
            progress: processedCount,
            total,
          });
        }
      } catch {
        processedCount++;
        emit({ uid, status: "dead", progress: processedCount, total });
      }
    }
  };

  try {
    await Promise.allSettled(Array.from({ length: CONCURRENCY }, worker));
    if (!res.writableEnded) {
      emit({ event: "done" });
      res.end();
    }
  } finally {
    clearInterval(keepalive);
  }
});

export default router;
