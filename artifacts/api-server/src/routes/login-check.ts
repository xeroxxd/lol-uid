import { Router, type Request, type Response } from "express";
import { db, facebookIdsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { checkFbLogin, type LoginStatus } from "../utils/fb-device";

const router = Router();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

router.post("/login-check", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const body = req.body as {
    pairs?: { uid: string; password: string }[];
    workers?: number;
    delay?: number;
    proxies?: string[];
  };

  if (!body || !Array.isArray(body.pairs) || body.pairs.length === 0) {
    res.status(400).json({ error: "pairs array is required" });
    return;
  }

  const pairs = body.pairs
    .slice(0, 2000)
    .filter((p) => p && typeof p.uid === "string" && typeof p.password === "string")
    .map((p) => ({ uid: p.uid.trim(), password: p.password.trim() }))
    .filter((p) => p.uid && p.password);

  if (pairs.length === 0) {
    res.status(400).json({ error: "No valid uid:password pairs" });
    return;
  }

  const workers = Math.min(Math.max(Number(body.workers ?? 3), 1), 10);
  const delayMs = Math.min(Math.max(Number(body.delay ?? 1000), 0), 5000);
  const ALLOWED_PROXY_SCHEMES = ["http:", "https:", "socks:", "socks4:", "socks4a:", "socks5:"];
  const proxies = Array.isArray(body.proxies)
    ? body.proxies
        .filter((p) => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim())
        .filter((p) => {
          try { return ALLOWED_PROXY_SCHEMES.includes(new URL(p).protocol); } catch { return false; }
        })
    : [];
  let proxyIndex = 0;
  const nextProxy = (): string | undefined => {
    if (proxies.length === 0) return undefined;
    const p = proxies[proxyIndex % proxies.length];
    proxyIndex++;
    return p;
  };
  const total = pairs.length;

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
  const queue = [...pairs];

  const statusLabel: Record<LoginStatus, string> = {
    live: "Live ✅",
    dead: "Dead ❌",
    checkpoint: "Checkpoint 🔒",
    "2fa": "2FA 🔑",
    locked: "Locked 🚫",
    disabled: "Disabled 🛑",
    wrongpass: "Wrong Password 🔐",
  };

  const worker = async () => {
    while (!cancelled) {
      if (res.writableEnded || res.destroyed) break;

      const pair = queue.shift();
      if (!pair) break;

      const proxy = nextProxy();
      try {
        const result = await checkFbLogin(pair.uid, pair.password, proxy);
        processedCount++;

        try {
          await db
            .update(facebookIdsTable)
            .set({
              loginStatus: result.status,
              accessToken: result.accessToken,
              lastChecked: new Date(),
              checkCount: sql`${facebookIdsTable.checkCount} + 1`,
            })
            .where(
              and(
                eq(facebookIdsTable.uid, pair.uid),
                eq(facebookIdsTable.userId, userId),
              ),
            );
        } catch (dbErr) {
          console.error("[login-check] DB persist error for uid=%s: %s", pair.uid, (dbErr as Error).message);
          emit({ event: "db_error", uid: pair.uid, message: (dbErr as Error).message });
        }

        emit({
          uid: pair.uid,
          password: pair.password,
          status: result.status,
          statusLabel: statusLabel[result.status],
          accessToken: result.accessToken,
          proxy: proxy ?? null,
          errorCode: result.errorCode ?? null,
          errorSubcode: result.errorSubcode ?? null,
          progress: processedCount,
          total,
        });

        if (delayMs > 0 && !cancelled) await sleep(delayMs);
      } catch {
        processedCount++;
        emit({
          uid: pair.uid,
          password: pair.password,
          status: "dead" as LoginStatus,
          statusLabel: statusLabel.dead,
          accessToken: null,
          proxy: proxy ?? null,
          progress: processedCount,
          total,
        });
      }
    }
  };

  try {
    await Promise.allSettled(Array.from({ length: workers }, worker));
    if (!cancelled && !res.writableEnded) {
      emit({ event: "done" });
      res.end();
    }
  } finally {
    clearInterval(keepalive);
    req.off("close", onClose);
  }
});

export default router;
