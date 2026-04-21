import { pgTable, text, integer } from "drizzle-orm/pg-core";

export const appStats = pgTable("app_stats", {
  id: text("id").primaryKey().default("global"),
  totalVisits: integer("total_visits").notNull().default(0),
  totalAnalyses: integer("total_analyses").notNull().default(0),
  totalFixes: integer("total_fixes").notNull().default(0),
  totalUploads: integer("total_uploads").notNull().default(0),
});

export type AppStats = typeof appStats.$inferSelect;
