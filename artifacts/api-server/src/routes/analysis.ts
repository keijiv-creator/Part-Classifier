import { Router, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { db } from "@workspace/db";
import { runsTable, runPartsTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();
const upload = multer({ dest: "/tmp/uploads/" });

const SCRIPT_PATH = "/home/runner/workspace/scripts/src/combine_parts_analysis.py";

interface DiffRow {
  changeType: "NEW" | "REMOVED" | "CHANGED" | "UNCHANGED";
  changes?: Record<string, { old: any; new: any }>;
  [key: string]: any;
}

function computeDiff(
  currentParts: any[],
  previousParts: any[],
  sheetType: string,
): { rows: DiffRow[]; summary: { added: number; removed: number; changed: number; unchanged: number; revenueChange: number } } {
  const normalizeKey = (k: string) => (k || "").trim().toUpperCase();

  const prevMap = new Map<string, any>();
  for (const p of previousParts) {
    if (p.sheetType === sheetType) {
      const key = normalizeKey(p.customerPartId);
      if (key) prevMap.set(key, p);
    }
  }

  const currMap = new Map<string, any>();
  for (const c of currentParts) {
    if (c.sheetType === sheetType) {
      const key = normalizeKey(c.customerPartId);
      if (key) currMap.set(key, c);
    }
  }

  const compareFields = ["mappedStatus", "mappedProbability", "mappedMedRev", "mappedPdP1Time", "mappedPdP2Time", "mappedPdP4Time", "mappedPdP5Time", "quoteNumber", "calcLabel", "pdId", "pdValue", "pdStatus", "pdStage"];

  const rows: DiffRow[] = [];
  let added = 0, removed = 0, changed = 0, unchanged = 0;
  let revenueChange = 0;
  const revField = sheetType === "new_deals" ? "mappedMedRev" : "pdValue";

  for (const [key, curr] of currMap.entries()) {
    const prev = prevMap.get(key);
    if (!prev) {
      rows.push({ ...curr, changeType: "NEW" });
      added++;
      revenueChange += (curr[revField] || 0);
    } else {
      const changes: Record<string, { old: any; new: any }> = {};
      for (const f of compareFields) {
        const oldVal = prev[f] ?? "";
        const newVal = curr[f] ?? "";
        if (String(oldVal) !== String(newVal)) {
          changes[f] = { old: oldVal, new: newVal };
        }
      }
      if (Object.keys(changes).length > 0) {
        rows.push({ ...curr, changeType: "CHANGED", changes });
        changed++;
        revenueChange += ((curr[revField] || 0) - (prev[revField] || 0));
      } else {
        rows.push({ ...curr, changeType: "UNCHANGED" });
        unchanged++;
      }
    }
  }

  for (const [key, prev] of prevMap.entries()) {
    if (!currMap.has(key)) {
      rows.push({ ...prev, changeType: "REMOVED" });
      removed++;
      revenueChange -= (prev[revField] || 0);
    }
  }

  rows.sort((a, b) => {
    const order = { NEW: 0, CHANGED: 1, REMOVED: 2, UNCHANGED: 3 };
    return order[a.changeType] - order[b.changeType];
  });

  return { rows, summary: { added, removed, changed, unchanged, revenueChange } };
}

router.post(
  "/analysis/run",
  upload.fields([
    { name: "booking_file", maxCount: 1 },
    { name: "national_file", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.booking_file?.[0] || !files?.national_file?.[0]) {
      res.status(400).json({ error: "Both national_file and booking_file are required" });
      return;
    }

    const outputDir = "/tmp/analysis_output_" + Date.now();
    fs.mkdirSync(outputDir, { recursive: true });

    const bookingPath = files.booking_file[0].path + ".xlsx";
    fs.renameSync(files.booking_file[0].path, bookingPath);
    const nationalPath = files.national_file[0].path + ".xlsx";
    fs.renameSync(files.national_file[0].path, nationalPath);
    const jsonOutput = path.join(outputDir, "result.json");

    const args = [
      SCRIPT_PATH,
      "--booking-file", bookingPath,
      "--national-file", nationalPath,
      "--output-dir", outputDir,
      "--json-output", jsonOutput,
    ];

    const cutoffYear = req.body?.cutoff_year;
    const faiThreshold = req.body?.fai_threshold;
    if (cutoffYear) args.push("--cutoff-year", String(cutoffYear));
    if (faiThreshold) args.push("--fai-threshold", String(faiThreshold));

    let prevRunJsonPath: string | null = null;
    try {
      const latestRuns = await db.select({ id: runsTable.id })
        .from(runsTable)
        .orderBy(desc(runsTable.id))
        .limit(1);

      if (latestRuns.length > 0) {
        const prevParts = await db.select().from(runPartsTable).where(eq(runPartsTable.runId, latestRuns[0].id));
        if (prevParts.length > 0) {
          prevRunJsonPath = path.join(outputDir, "prev_run.json");
          fs.writeFileSync(prevRunJsonPath, JSON.stringify(prevParts));
          args.push("--previous-run-json", prevRunJsonPath);
        }
      }
    } catch (prevErr: any) {
      console.error("Could not fetch previous run for diff (non-fatal):", prevErr.message);
    }

    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn("python3", args, {
          env: { ...process.env },
          cwd: "/home/runner/workspace",
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      });

      if (result.code !== 0) {
        res.status(500).json({
          error: "Analysis script failed",
          stdout: result.stdout,
          stderr: result.stderr,
        });
        return;
      }

      if (!fs.existsSync(jsonOutput)) {
        res.status(500).json({ error: "JSON output not generated", stdout: result.stdout });
        return;
      }

      const jsonData = JSON.parse(fs.readFileSync(jsonOutput, "utf-8"));

      let runId: number | null = null;
      try {
        const [run] = await db.insert(runsTable).values({
          cutoffYear: cutoffYear ? parseInt(cutoffYear) : null,
          faiThreshold: faiThreshold ? parseFloat(faiThreshold) : null,
          summaryJson: jsonData.summary,
          totalUniqueParts: jsonData.summary.total_unique_parts,
          newDealsCount: jsonData.summary.new_deals_count,
          pdInfoCount: jsonData.summary.pd_info_count,
          totalNewDealsRevenue: jsonData.summary.total_new_deals_revenue,
          totalPdPipelineValue: jsonData.summary.total_pd_pipeline_value,
          wonDealsCount: jsonData.summary.won_deals_count,
          wonDealsValue: jsonData.summary.won_deals_value,
          openDealsCount: jsonData.summary.open_deals_count,
          openDealsValue: jsonData.summary.open_deals_value,
        }).returning({ id: runsTable.id });
        runId = run.id;

        const partRows: any[] = [];
        for (const nd of jsonData.sheets.new_deals) {
          partRows.push({
            runId,
            sheetType: "new_deals",
            customerPartId: (nd.customer_part_id || "").trim().toUpperCase(),
            orgId: nd.org_id || "",
            name: nd.name || "",
            mappedStatus: nd.mapped_status || "",
            mappedProbability: nd.mapped_probability || "",
            mappedMedRev: nd.mapped_med_rev || 0,
            mappedPdP1Time: nd.mapped_pd_p1_time || "",
            mappedPdP2Time: nd.mapped_pd_p2_time || "",
            mappedPdP4Time: nd.mapped_pd_p4_time || "",
            mappedPdP5Time: nd.mapped_pd_p5_time || "",
            quoteNumber: nd.quote_number || "",
            firstOrderDate: nd.first_order_date || "",
            firstOrderNo: nd.first_order_no || "",
            landmarkQuoteNo: nd.landmark_quote_no || "",
            calcLabel: nd.calc_label || "",
          });
        }
        for (const pi of jsonData.sheets.pd_info) {
          partRows.push({
            runId,
            sheetType: "pd_info",
            customerPartId: (pi.customer_part_id || "").trim().toUpperCase(),
            orgId: pi.org_id || "",
            name: pi.name || pi.org_name || "",
            mappedStatus: pi.mapped_status || "",
            mappedProbability: pi.mapped_probability || "",
            mappedMedRev: pi.mapped_med_rev || 0,
            mappedPdP1Time: pi.mapped_pd_p1_time || "",
            mappedPdP2Time: pi.mapped_pd_p2_time || "",
            mappedPdP4Time: pi.mapped_pd_p4_time || "",
            mappedPdP5Time: pi.mapped_pd_p5_time || "",
            quoteNumber: pi.quote_number || "",
            firstOrderDate: pi.first_order_date || "",
            firstOrderNo: pi.first_order_no || "",
            landmarkQuoteNo: pi.landmark_quote_no || "",
            pdId: pi.pd_id ? String(pi.pd_id) : "",
            pdValue: pi.value || 0,
            pdStatus: pi.status || "",
            pdStage: pi.stage_id || "",
            pdLabel: pi.label || "",
            pdIndustry: pi.industry || "",
            pdDealType: pi.deal_type || "",
            pdMfgType: pi.mfg_type || "",
            pdPlatform: pi.platform_company || "",
            pdTitle: pi.title || "",
            pdOrgName: pi.org_name || "",
          });
        }

        const BATCH_SIZE = 500;
        for (let i = 0; i < partRows.length; i += BATCH_SIZE) {
          await db.insert(runPartsTable).values(partRows.slice(i, i + BATCH_SIZE));
        }
      } catch (dbErr: any) {
        console.error("DB persistence error (non-fatal):", dbErr.message);
      }

      let diff = null;
      if (runId) {
        try {
          const previousRuns = await db.select({ id: runsTable.id })
            .from(runsTable)
            .where(sql`${runsTable.id} < ${runId}`)
            .orderBy(desc(runsTable.id))
            .limit(1);

          if (previousRuns.length > 0) {
            const prevRunId = previousRuns[0].id;
            const prevParts = await db.select().from(runPartsTable).where(eq(runPartsTable.runId, prevRunId));
            const currParts = await db.select().from(runPartsTable).where(eq(runPartsTable.runId, runId));

            const newDealsDiff = computeDiff(currParts, prevParts, "new_deals");
            const pdInfoDiff = computeDiff(currParts, prevParts, "pd_info");

            diff = {
              previousRunId: prevRunId,
              currentRunId: runId,
              newDeals: newDealsDiff,
              pdInfo: pdInfoDiff,
            };
          }
        } catch (diffErr: any) {
          console.error("Diff computation error (non-fatal):", diffErr.message);
        }
      }

      jsonData.run_id = runId;
      jsonData.diff = diff;
      res.json(jsonData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      try { fs.unlinkSync(bookingPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
    }
  }
);

router.get("/analysis/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await db.select({
      id: runsTable.id,
      createdAt: runsTable.createdAt,
      cutoffYear: runsTable.cutoffYear,
      faiThreshold: runsTable.faiThreshold,
      totalUniqueParts: runsTable.totalUniqueParts,
      newDealsCount: runsTable.newDealsCount,
      pdInfoCount: runsTable.pdInfoCount,
      totalNewDealsRevenue: runsTable.totalNewDealsRevenue,
      totalPdPipelineValue: runsTable.totalPdPipelineValue,
      wonDealsCount: runsTable.wonDealsCount,
      openDealsCount: runsTable.openDealsCount,
    }).from(runsTable).orderBy(desc(runsTable.createdAt)).limit(50);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/analysis/compare", async (req: Request, res: Response) => {
  const { runIdA, runIdB } = req.body;
  if (!runIdA || !runIdB) {
    res.status(400).json({ error: "runIdA and runIdB are required" });
    return;
  }

  try {
    const [partsA, partsB, runsData] = await Promise.all([
      db.select().from(runPartsTable).where(eq(runPartsTable.runId, Number(runIdA))),
      db.select().from(runPartsTable).where(eq(runPartsTable.runId, Number(runIdB))),
      db.select().from(runsTable).where(
        sql`${runsTable.id} IN (${Number(runIdA)}, ${Number(runIdB)})`
      ),
    ]);

    const runA = runsData.find(r => r.id === Number(runIdA));
    const runB = runsData.find(r => r.id === Number(runIdB));

    if (!runA || !runB) {
      res.status(404).json({ error: "One or both runs not found" });
      return;
    }

    const olderParts = Number(runIdA) < Number(runIdB) ? partsA : partsB;
    const newerParts = Number(runIdA) < Number(runIdB) ? partsB : partsA;
    const olderRun = Number(runIdA) < Number(runIdB) ? runA : runB;
    const newerRun = Number(runIdA) < Number(runIdB) ? runB : runA;

    const newDealsDiff = computeDiff(newerParts, olderParts, "new_deals");
    const pdInfoDiff = computeDiff(newerParts, olderParts, "pd_info");

    res.json({
      previousRunId: olderRun?.id,
      currentRunId: newerRun?.id,
      previousRun: olderRun,
      currentRun: newerRun,
      newDeals: newDealsDiff,
      pdInfo: pdInfoDiff,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analysis/download", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: "Path required" });
    return;
  }
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith("/tmp/")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.download(resolved, path.basename(resolved));
});

const zipUpload = multer({ dest: "/tmp/uploads/", limits: { fileSize: 50 * 1024 * 1024 } });

router.post(
  "/analysis/download-zip",
  zipUpload.single("dashboard_image"),
  (req: Request, res: Response) => {
    const { parts_analysis, natman_bookings, pdsync } = req.body || {};

    const filesToInclude: { absPath: string; name: string }[] = [];

    const validate = (p: string | undefined, label: string) => {
      if (!p) return;
      const resolved = path.resolve(p);
      if (!resolved.startsWith("/tmp/") || !fs.existsSync(resolved)) return;
      filesToInclude.push({ absPath: resolved, name: label });
    };

    validate(parts_analysis, "Parts_Analysis.xlsx");
    validate(pdsync, "National_PDSync_PDUploadPreview.xlsx");
    validate(natman_bookings, "Natman_Bookings.xlsx");

    if (req.file) {
      filesToInclude.push({ absPath: req.file.path, name: "Dashboard.png" });
    }

    if (filesToInclude.length === 0) {
      res.status(400).json({ error: "No valid files to include" });
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="Combined_Analysis_${date}.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      res.status(500).json({ error: err.message });
    });
    archive.pipe(res);

    for (const f of filesToInclude) {
      archive.file(f.absPath, { name: f.name });
    }

    archive.finalize();
  }
);

export default router;
