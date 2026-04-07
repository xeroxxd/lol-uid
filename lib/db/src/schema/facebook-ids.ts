import { pgTable, serial, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const facebookIdsTable = pgTable("facebook_ids", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  uid: varchar("uid", { length: 255 }).notNull(),
  password: varchar("password", { length: 500 }),
  pinned: boolean("pinned").notNull().default(false),
  visited: boolean("visited").notNull().default(false),
  note: varchar("note", { length: 1000 }),
  tag: varchar("tag", { length: 50 }),
  visitedAt: timestamp("visited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  loginStatus: varchar("login_status", { length: 20 }),
  accessToken: varchar("access_token", { length: 500 }),
  lastChecked: timestamp("last_checked", { withTimezone: true }),
  checkCount: integer("check_count").notNull().default(0),
});

export const insertFacebookIdSchema = createInsertSchema(facebookIdsTable).omit({ id: true, createdAt: true });
export type InsertFacebookId = z.infer<typeof insertFacebookIdSchema>;
export type FacebookId = typeof facebookIdsTable.$inferSelect;
