import { Router, type IRouter, type Request, type Response } from "express";
import { db, facebookIdsTable, usersTable } from "@workspace/db";
import { eq, and, count, sql, gte } from "drizzle-orm";
import {
  BulkImportFacebookIdsBody,
  UpdateFacebookIdBody,
  DeleteFacebookIdParams,
  UpdateFacebookIdParams,
  AdminGetUserIdsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function isAdmin(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId) return false;
  return req.user.id === adminUserId;
}

router.get("/facebook-ids/daily-stats", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const rawDays = Number(req.query.days ?? 7);
  const days = rawDays === 30 ? 30 : 7;
  const span = days - 1;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - span);
  cutoff.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(${facebookIdsTable.visitedAt} AT TIME ZONE 'UTC')`,
      count: count(),
    })
    .from(facebookIdsTable)
    .where(
      and(
        eq(facebookIdsTable.userId, userId),
        gte(facebookIdsTable.visitedAt, cutoff),
      ),
    )
    .groupBy(sql`DATE(${facebookIdsTable.visitedAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${facebookIdsTable.visitedAt} AT TIME ZONE 'UTC')`);

  const result: { date: string; count: number }[] = [];
  for (let i = span; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.date === dateStr);
    result.push({ date: dateStr, count: Number(found?.count ?? 0) });
  }

  res.json({ days: result });
});

router.get("/facebook-ids/tag-stats", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const rows = await db
    .select({
      tag: facebookIdsTable.tag,
      count: count(),
    })
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId))
    .groupBy(facebookIdsTable.tag);

  const result: { tag: string; count: number }[] = rows.map((r) => ({
    tag: r.tag ?? "Untagged",
    count: Number(r.count),
  }));

  res.json({ tags: result });
});

router.get("/facebook-ids/stats", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [totalRow] = await db
    .select({ count: count() })
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId));

  const [pinnedRow] = await db
    .select({ count: count() })
    .from(facebookIdsTable)
    .where(and(eq(facebookIdsTable.userId, userId), eq(facebookIdsTable.pinned, true)));

  const [visitedRow] = await db
    .select({ count: count() })
    .from(facebookIdsTable)
    .where(and(eq(facebookIdsTable.userId, userId), eq(facebookIdsTable.visited, true)));

  const total = totalRow?.count ?? 0;
  const pinned = pinnedRow?.count ?? 0;
  const visited = visitedRow?.count ?? 0;

  res.json({ total, pinned, visited, unvisited: total - visited });
});

router.get("/facebook-ids", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const items = await db
    .select()
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId))
    .orderBy(sql`${facebookIdsTable.pinned} DESC, ${facebookIdsTable.createdAt} ASC`);

  res.json({
    items: items.map((item) => ({
      id: item.id,
      uid: item.uid,
      password: item.password,
      pinned: item.pinned,
      visited: item.visited,
      note: item.note ?? null,
      tag: item.tag ?? null,
      createdAt: item.createdAt.toISOString(),
      visitedAt: item.visitedAt ? item.visitedAt.toISOString() : null,
      loginStatus: item.loginStatus ?? null,
      accessToken: item.accessToken ?? null,
      lastChecked: item.lastChecked ? item.lastChecked.toISOString() : null,
      checkCount: item.checkCount ?? 0,
    })),
  });
});

router.post("/facebook-ids", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const parsed = BulkImportFacebookIdsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { rawText } = parsed.data;
  const rawDefaultTag = typeof req.body.defaultTag === "string" ? req.body.defaultTag.slice(0, 50) : null;
  const defaultTag: string | null = rawDefaultTag || null;

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const existing = await db
    .select({ uid: facebookIdsTable.uid })
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId));

  const existingUids = new Set(existing.map((e) => e.uid));

  const toInsert: { userId: string; uid: string; password: string | null; tag: string | null }[] = [];
  const seenInBatch = new Set<string>();
  let duplicatesSkipped = 0;

  for (const line of lines) {
    const parts = line.split("|");
    const uid = parts[0].trim();
    const password = parts.length > 1 ? parts.slice(1).join("|").trim() || null : null;

    if (!uid) continue;

    if (existingUids.has(uid) || seenInBatch.has(uid)) {
      duplicatesSkipped++;
      continue;
    }

    seenInBatch.add(uid);
    toInsert.push({ userId, uid, password, tag: defaultTag });
  }

  if (toInsert.length > 0) {
    await db.insert(facebookIdsTable).values(toInsert);
  }

  const [totalRow] = await db
    .select({ count: count() })
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId));

  res.json({
    imported: toInsert.length,
    duplicatesSkipped,
    total: totalRow?.count ?? 0,
  });
});

router.delete("/facebook-ids", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const result = await db
    .delete(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, userId))
    .returning({ id: facebookIdsTable.id });

  res.json({ deleted: result.length });
});

router.delete("/facebook-ids/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const paramsParsed = DeleteFacebookIdParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const result = await db
    .delete(facebookIdsTable)
    .where(and(eq(facebookIdsTable.id, paramsParsed.data.id), eq(facebookIdsTable.userId, userId)))
    .returning({ id: facebookIdsTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ deleted: result.length });
});

router.patch("/facebook-ids/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const paramsParsed = UpdateFacebookIdParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = UpdateFacebookIdBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const updates: { pinned?: boolean; visited?: boolean; visitedAt?: Date | null; note?: string | null; tag?: string | null; loginStatus?: string | null; accessToken?: string | null } = {};
  if (bodyParsed.data.pinned !== undefined) updates.pinned = bodyParsed.data.pinned;
  if (bodyParsed.data.visited !== undefined) {
    updates.visited = bodyParsed.data.visited;
    updates.visitedAt = bodyParsed.data.visited ? new Date() : null;
  }
  if ("note" in bodyParsed.data) updates.note = bodyParsed.data.note ?? null;
  if ("tag" in bodyParsed.data) updates.tag = bodyParsed.data.tag ?? null;
  if ("loginStatus" in bodyParsed.data) updates.loginStatus = bodyParsed.data.loginStatus ?? null;
  if ("accessToken" in bodyParsed.data) updates.accessToken = bodyParsed.data.accessToken ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const result = await db
    .update(facebookIdsTable)
    .set(updates)
    .where(and(eq(facebookIdsTable.id, paramsParsed.data.id), eq(facebookIdsTable.userId, userId)))
    .returning();

  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const item = result[0];
  res.json({
    id: item.id,
    uid: item.uid,
    password: item.password,
    pinned: item.pinned,
    visited: item.visited,
    note: item.note ?? null,
    tag: item.tag ?? null,
    createdAt: item.createdAt.toISOString(),
    visitedAt: item.visitedAt ? item.visitedAt.toISOString() : null,
    loginStatus: item.loginStatus ?? null,
    accessToken: item.accessToken ?? null,
    lastChecked: item.lastChecked ? item.lastChecked.toISOString() : null,
    checkCount: item.checkCount ?? 0,
  });
});

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const usersWithCounts = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      totalIds: count(facebookIdsTable.id),
      pinnedIds: sql<number>`COUNT(CASE WHEN ${facebookIdsTable.pinned} = true THEN 1 END)`,
      visitedIds: sql<number>`COUNT(CASE WHEN ${facebookIdsTable.visited} = true THEN 1 END)`,
    })
    .from(usersTable)
    .leftJoin(facebookIdsTable, eq(usersTable.id, facebookIdsTable.userId))
    .groupBy(usersTable.id, usersTable.email, usersTable.firstName, usersTable.lastName);

  const totalUsers = usersWithCounts.length;
  const totalIds = usersWithCounts.reduce((sum, u) => sum + (u.totalIds || 0), 0);

  res.json({
    users: usersWithCounts.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      totalIds: Number(u.totalIds) || 0,
      pinnedIds: Number(u.pinnedIds) || 0,
      visitedIds: Number(u.visitedIds) || 0,
    })),
    totalUsers,
    totalIds,
  });
});

router.get("/admin/users/:userId/ids", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const paramsParsed = AdminGetUserIdsParams.safeParse({ userId: req.params.userId });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const items = await db
    .select()
    .from(facebookIdsTable)
    .where(eq(facebookIdsTable.userId, paramsParsed.data.userId))
    .orderBy(sql`${facebookIdsTable.pinned} DESC, ${facebookIdsTable.createdAt} ASC`);

  res.json({
    items: items.map((item) => ({
      id: item.id,
      uid: item.uid,
      password: item.password,
      pinned: item.pinned,
      visited: item.visited,
      createdAt: item.createdAt.toISOString(),
    })),
  });
});

export default router;
