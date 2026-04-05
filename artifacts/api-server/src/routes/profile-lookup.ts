import { Router, type IRouter, type Request, type Response } from "express";
import * as cheerio from "cheerio";

const router: IRouter = Router();

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

async function fetchFbPage(uid: string): Promise<string | null> {
  const urls = [
    `https://www.facebook.com/profile.php?id=${uid}`,
    `https://www.facebook.com/${uid}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 500) return text;
      }
    } catch {
      continue;
    }
  }
  return null;
}

router.get("/profile-lookup", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const uid = String(req.query.uid ?? "").trim();
  if (!uid) {
    res.status(400).json({ error: "uid is required" });
    return;
  }

  try {
    const html = await fetchFbPage(uid);
    if (!html) {
      res.status(502).json({ error: "Could not fetch Facebook page" });
      return;
    }

    const $ = cheerio.load(html);

    const name = $('meta[property="og:title"]').attr("content") ?? null;

    let username: string | null = null;
    const ogUrl = $('meta[property="og:url"]').attr("content") ?? "";
    const usernameMatch = ogUrl.match(/facebook\.com\/([^/?]+)/);
    if (usernameMatch && usernameMatch[1] !== "profile.php") {
      username = usernameMatch[1];
    }

    let userId: string | null = uid;
    const androidUrl = $('meta[property="al:android:url"]').attr("content") ?? "";
    const androidIdMatch = androidUrl.match(/profile\/(\d+)/);
    if (androidIdMatch) userId = androidIdMatch[1];
    if (!userId) {
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
      if (m) {
        nationality = m[1].trim();
        break;
      }
    }

    res.json({
      name: name ?? null,
      username: username ?? null,
      userId: userId ?? uid,
      followerCount: followerCount ?? null,
      nationality: nationality ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
