import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  APP_PASSWORD,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/auth/user", (req: Request, res: Response) => {
  const authenticated = req.isAuthenticated();
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: authenticated
        ? { ...req.user, isAdmin: false }
        : null,
    }),
  );
});

router.post("/login", async (req: Request, res: Response) => {
  const { password, deviceId } = req.body as { password?: string; deviceId?: string };

  if (!password || password !== APP_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  // Use the device's unique ID so each device has its own isolated data.
  // If no deviceId provided (old clients), fall back to a random one.
  const userId = (typeof deviceId === "string" && deviceId.length > 0)
    ? deviceId.slice(0, 64)
    : ("dev_" + Math.random().toString(36).slice(2));

  await db
    .insert(usersTable)
    .values({ id: userId, email: null, firstName: "User", lastName: null, profileImageUrl: null })
    .onConflictDoNothing();

  const sessionData: SessionData = {
    user: {
      id: userId,
      email: null,
      firstName: "User",
      lastName: null,
      profileImageUrl: null,
    },
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ ok: true });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/");
});

export default router;
