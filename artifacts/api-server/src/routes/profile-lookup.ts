import { Router, type IRouter, type Request, type Response } from "express";
import { fetchFbPage, parseProfileHtml, type FetchResult } from "../utils/fb-profile";

const router: IRouter = Router();

const SERVER_CACHE = new Map<string, { data: object; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const RATE_LIMIT_UNTIL = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const IN_FLIGHT = new Map<string, Promise<FetchResult>>();

async function fetchFbPageCached(uid: string): Promise<FetchResult> {
  if (IN_FLIGHT.has(uid)) return IN_FLIGHT.get(uid)!;
  const promise = fetchFbPage(uid).finally(() => IN_FLIGHT.delete(uid));
  IN_FLIGHT.set(uid, promise);
  return promise;
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

  const cached = SERVER_CACHE.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const rateLimitedUntil = RATE_LIMIT_UNTIL.get("global") ?? 0;
  if (rateLimitedUntil > Date.now()) {
    res.status(429).json({ error: "Rate limited by Facebook. Try again in a minute." });
    return;
  }

  try {
    const { html, rateLimited } = await fetchFbPageCached(uid);
    if (rateLimited) {
      RATE_LIMIT_UNTIL.set("global", Date.now() + RATE_LIMIT_COOLDOWN_MS);
      res.status(429).json({ error: "Rate limited by Facebook. Try again in a minute." });
      return;
    }
    if (!html) {
      res.status(502).json({ error: "Could not fetch Facebook page" });
      return;
    }

    const profile = parseProfileHtml(html, uid);
    const payload = {
      name: profile.name ?? null,
      username: profile.username ?? null,
      userId: profile.userId ?? uid,
      followerCount: profile.followerCount ?? null,
      nationality: profile.nationality ?? null,
      photoUrl: profile.photoUrl ?? null,
      instagramUsername: profile.instagramUsername ?? null,
    };
    SERVER_CACHE.set(uid, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Lookup failed" });
  }
});

export default router;
