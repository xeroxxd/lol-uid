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
  SHARED_USER_ID,
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
        ? { ...req.user, isAdmin: true }
        : null,
    }),
  );
});

router.post("/login", async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!password || password !== APP_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  await db
    .insert(usersTable)
    .values({ id: SHARED_USER_ID, email: null, firstName: "User", lastName: null, profileImageUrl: null })
    .onConflictDoNothing();

  const sessionData: SessionData = {
    user: {
      id: SHARED_USER_ID,
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
