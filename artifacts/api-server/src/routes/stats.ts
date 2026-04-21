import { Router } from "express";
import { db, appStats } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

async function ensureStatsRow() {
  await db
    .insert(appStats)
    .values({ id: "global", totalVisits: 0, totalAnalyses: 0, totalFixes: 0, totalUploads: 0 })
    .onConflictDoNothing();
}

export async function incrementStat(field: "totalVisits" | "totalAnalyses" | "totalFixes" | "totalUploads") {
  try {
    await ensureStatsRow();
    const col = {
      totalVisits: appStats.totalVisits,
      totalAnalyses: appStats.totalAnalyses,
      totalFixes: appStats.totalFixes,
      totalUploads: appStats.totalUploads,
    }[field];
    await db
      .update(appStats)
      .set({ [field]: sql`${col} + 1` })
      .where(sql`id = 'global'`);
  } catch {
  }
}

router.post("/stats/visit", async (_req, res): Promise<void> => {
  await incrementStat("totalVisits");
  res.json({ ok: true });
});

router.get("/stats", async (_req, res): Promise<void> => {
  try {
    await ensureStatsRow();
    const rows = await db.select().from(appStats).limit(1);
    const row = rows[0] ?? { totalVisits: 0, totalAnalyses: 0, totalFixes: 0, totalUploads: 0 };
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
