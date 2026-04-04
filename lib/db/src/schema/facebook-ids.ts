import { pgTable, serial, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFacebookIdSchema = createInsertSchema(facebookIdsTable).omit({ id: true, createdAt: true });
export type InsertFacebookId = z.infer<typeof insertFacebookIdSchema>;
export type FacebookId = typeof facebookIdsTable.$inferSelect;
