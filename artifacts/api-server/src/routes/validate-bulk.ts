import { Router, type Request, type Response } from "express";
import { fetchFbPage, parseProfileHtml } from "../utils/fb-profile";

const router = Router();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

  let cancelled = false;
  const onClose = () => { cancelled = true; };
  req.on("close", onClose);
  res.on("close", onClose);

  const keepalive = setInterval(() => {
    if (!cancelled && !res.writableEnded && !res.destroyed) res.write(": keepalive\n\n");
  }, 15_000);

  const emit = (data: object) => {
    if (!cancelled && !res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  let processedCount = 0;
  let rateLimitedUntil = 0;
  const queue = [...allUids];
  const CONCURRENCY = 5;

  const worker = async () => {
    while (!cancelled) {
      if (res.writableEnded || res.destroyed) break;

      if (rateLimitedUntil > Date.now()) {
        const wait = rateLimitedUntil - Date.now() + 500;
        emit({ event: "rate_limited", retryAfter: Math.ceil(wait / 1000) });
        await sleep(wait);
        if (cancelled) break;
      }

      const uid = queue.shift();
      if (uid === undefined) break;

      try {
        const { html, rateLimited } = await fetchFbPage(uid);

        if (rateLimited) {
          rateLimitedUntil = Date.now() + 30_000;
          queue.unshift(uid);
          continue;
        }

        processedCount++;

        if (!html) {
          emit({ uid, status: "dead", progress: processedCount, total });
        } else {
          const profile = parseProfileHtml(html, uid);
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
