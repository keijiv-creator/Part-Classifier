import { Router, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();
const upload = multer({ dest: "/tmp/uploads/" });

const SCRIPT_PATH = "/home/runner/workspace/scripts/src/combine_parts_analysis.py";
const CACHE_DIR = "/tmp/analysis_cache";
const RUN_LOG_PATH = "/tmp/analysis_runs.json";

fs.mkdirSync(CACHE_DIR, { recursive: true });

interface RunLogEntry {
  id: string;
  nationalFileName: string;
  bookingsFileName: string;
  nationalRowCount: number;
  cutoffYear: string;
  faiThreshold: string;
  uploadTime: string;
  status: "success" | "fail";
  errorSummary: string;
  cacheKey: string;
  uniqueParts: number;
  newDeals: number;
  pdInfo: number;
  elapsedSeconds: number;
}

function loadRunLog(): RunLogEntry[] {
  try {
    if (fs.existsSync(RUN_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(RUN_LOG_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function saveRunLog(log: RunLogEntry[]): void {
  fs.writeFileSync(RUN_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

function addRunLogEntry(entry: RunLogEntry): void {
  const log = loadRunLog();
  log.unshift(entry);
  if (log.length > 50) log.length = 50;
  saveRunLog(log);
}

function getLastSuccessfulRun(): RunLogEntry | null {
  const log = loadRunLog();
  return log.find((e) => e.status === "success") || null;
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function buildCacheKey(bookingsHash: string, nationalHash: string, cutoffYear: string, faiThreshold: string): string {
  const combined = `${bookingsHash}:${nationalHash}:${cutoffYear}:${faiThreshold}`;
  return crypto.createHash("sha256").update(combined).digest("hex");
}

function getCachedResult(cacheKey: string): any | null {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      if (data.output_file && fs.existsSync(data.output_file)) {
        return data;
      }
    } catch {}
  }
  return null;
}

function saveCachedResult(cacheKey: string, data: any): void {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(data), "utf-8");
}

function countXlsxRows(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("python3", [
      "-c",
      `
import openpyxl, sys, json
try:
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    ws = wb.active
    count = sum(1 for _ in ws.iter_rows(values_only=True)) - 1
    wb.close()
    print(json.dumps({"rows": count}))
except Exception as e:
    print(json.dumps({"rows": 0, "error": str(e)}))
`,
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("close", () => {
      try {
        resolve(JSON.parse(out).rows || 0);
      } catch {
        resolve(0);
      }
    });
  });
}

function findXlsxInZip(zipPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("python3", [
      "-c",
      `
import zipfile, sys, json, os, tempfile
try:
    zf = zipfile.ZipFile(sys.argv[1])
    xlsx_files = [n for n in zf.namelist() if n.endswith('.xlsx')]
    if xlsx_files:
        tmp = tempfile.mktemp(suffix='.xlsx')
        with open(tmp, 'wb') as f:
            f.write(zf.read(xlsx_files[0]))
        print(json.dumps({"path": tmp}))
    else:
        print(json.dumps({"path": None}))
except:
    print(json.dumps({"path": None}))
`,
      zipPath,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("close", () => {
      try {
        resolve(JSON.parse(out).path || null);
      } catch {
        resolve(null);
      }
    });
  });
}

async function getNationalRowCount(filePath: string, originalName: string): Promise<number> {
  if (originalName.endsWith(".xlsx")) {
    return countXlsxRows(filePath);
  }
  if (originalName.endsWith(".zip")) {
    const xlsxPath = await findXlsxInZip(filePath);
    if (xlsxPath) {
      const count = await countXlsxRows(xlsxPath);
      try { fs.unlinkSync(xlsxPath); } catch {}
      return count;
    }
  }
  return 0;
}

router.post(
  "/analysis/run",
  upload.fields([
    { name: "bookings_zip", maxCount: 1 },
    { name: "national_zip", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.bookings_zip?.[0] || !files?.national_zip?.[0]) {
      res.status(400).json({ error: "Both bookings_zip and national_zip files are required" });
      return;
    }

    const bookingsFile = files.bookings_zip[0];
    const nationalFile = files.national_zip[0];
    const bookingsPath = bookingsFile.path;
    const nationalPath = nationalFile.path;
    const nationalOrigName = nationalFile.originalname;
    const bookingsOrigName = bookingsFile.originalname;
    const cutoffYear = req.body?.cutoff_year || "2021";
    const faiThreshold = req.body?.fai_threshold || "0.50";

    const nationalRowCount = await getNationalRowCount(nationalPath, nationalOrigName);
    console.log(`[analysis] National file: "${nationalOrigName}", rows: ${nationalRowCount}`);

    const lastRun = getLastSuccessfulRun();
    if (lastRun) {
      const nameMatch = lastRun.nationalFileName === nationalOrigName;
      const rowMatch = lastRun.nationalRowCount === nationalRowCount;
      const paramsMatch = lastRun.cutoffYear === cutoffYear && lastRun.faiThreshold === faiThreshold;

      if (nameMatch && rowMatch && paramsMatch) {
        const cached = getCachedResult(lastRun.cacheKey);
        if (cached) {
          console.log(`[analysis] Smart cache hit: same file name + row count + params as last run`);

          addRunLogEntry({
            id: crypto.randomUUID(),
            nationalFileName: nationalOrigName,
            bookingsFileName: bookingsOrigName,
            nationalRowCount,
            cutoffYear,
            faiThreshold,
            uploadTime: new Date().toISOString(),
            status: "success",
            errorSummary: "",
            cacheKey: lastRun.cacheKey,
            uniqueParts: cached.summary?.total_unique_parts || 0,
            newDeals: cached.summary?.new_deals_count || 0,
            pdInfo: cached.summary?.pd_info_count || 0,
            elapsedSeconds: cached.elapsed_seconds || 0,
          });

          try { fs.unlinkSync(bookingsPath); } catch {}
          try { fs.unlinkSync(nationalPath); } catch {}
          res.json({ ...cached, cached: true, cacheReason: "Same file name and row count as last successful run" });
          return;
        }
      }
    }

    const bookingsHash = hashFile(bookingsPath);
    const nationalHash = hashFile(nationalPath);
    const cacheKey = buildCacheKey(bookingsHash, nationalHash, cutoffYear, faiThreshold);

    const exactCached = getCachedResult(cacheKey);
    if (exactCached) {
      console.log(`[analysis] Exact hash cache hit: ${cacheKey.slice(0, 12)}...`);

      addRunLogEntry({
        id: crypto.randomUUID(),
        nationalFileName: nationalOrigName,
        bookingsFileName: bookingsOrigName,
        nationalRowCount,
        cutoffYear,
        faiThreshold,
        uploadTime: new Date().toISOString(),
        status: "success",
        errorSummary: "",
        cacheKey,
        uniqueParts: exactCached.summary?.total_unique_parts || 0,
        newDeals: exactCached.summary?.new_deals_count || 0,
        pdInfo: exactCached.summary?.pd_info_count || 0,
        elapsedSeconds: exactCached.elapsed_seconds || 0,
      });

      try { fs.unlinkSync(bookingsPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
      res.json({ ...exactCached, cached: true, cacheReason: "Exact file match" });
      return;
    }

    console.log(`[analysis] No cache match — running full pipeline`);

    const outputDir = "/tmp/analysis_output_" + Date.now();
    const jsonOutput = path.join(outputDir, "result.json");

    fs.mkdirSync(outputDir, { recursive: true });

    const args = [
      SCRIPT_PATH,
      "--bookings-zip", bookingsPath,
      "--national-zip", nationalPath,
      "--output-dir", outputDir,
      "--json-output", jsonOutput,
    ];

    if (cutoffYear) args.push("--cutoff-year", String(cutoffYear));
    if (faiThreshold) args.push("--fai-threshold", String(faiThreshold));

    const runId = crypto.randomUUID();

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
        const errorLines = (result.stderr || result.stdout).split("\n").filter(Boolean);
        const errorSummary = errorLines.slice(-3).join(" | ").substring(0, 200);

        addRunLogEntry({
          id: runId,
          nationalFileName: nationalOrigName,
          bookingsFileName: bookingsOrigName,
          nationalRowCount,
          cutoffYear,
          faiThreshold,
          uploadTime: new Date().toISOString(),
          status: "fail",
          errorSummary,
          cacheKey,
          uniqueParts: 0,
          newDeals: 0,
          pdInfo: 0,
          elapsedSeconds: 0,
        });

        res.status(500).json({
          error: "Analysis script failed",
          stdout: result.stdout,
          stderr: result.stderr,
        });
        return;
      }

      if (!fs.existsSync(jsonOutput)) {
        addRunLogEntry({
          id: runId,
          nationalFileName: nationalOrigName,
          bookingsFileName: bookingsOrigName,
          nationalRowCount,
          cutoffYear,
          faiThreshold,
          uploadTime: new Date().toISOString(),
          status: "fail",
          errorSummary: "JSON output not generated",
          cacheKey,
          uniqueParts: 0,
          newDeals: 0,
          pdInfo: 0,
          elapsedSeconds: 0,
        });

        res.status(500).json({ error: "JSON output not generated", stdout: result.stdout });
        return;
      }

      const jsonData = JSON.parse(fs.readFileSync(jsonOutput, "utf-8"));
      saveCachedResult(cacheKey, jsonData);

      addRunLogEntry({
        id: runId,
        nationalFileName: nationalOrigName,
        bookingsFileName: bookingsOrigName,
        nationalRowCount,
        cutoffYear,
        faiThreshold,
        uploadTime: new Date().toISOString(),
        status: "success",
        errorSummary: "",
        cacheKey,
        uniqueParts: jsonData.summary?.total_unique_parts || 0,
        newDeals: jsonData.summary?.new_deals_count || 0,
        pdInfo: jsonData.summary?.pd_info_count || 0,
        elapsedSeconds: jsonData.elapsed_seconds || 0,
      });

      res.json(jsonData);
    } catch (err: any) {
      addRunLogEntry({
        id: runId,
        nationalFileName: nationalOrigName,
        bookingsFileName: bookingsOrigName,
        nationalRowCount,
        cutoffYear,
        faiThreshold,
        uploadTime: new Date().toISOString(),
        status: "fail",
        errorSummary: err.message?.substring(0, 200) || "Unknown error",
        cacheKey,
        uniqueParts: 0,
        newDeals: 0,
        pdInfo: 0,
        elapsedSeconds: 0,
      });
      res.status(500).json({ error: err.message });
    } finally {
      try { fs.unlinkSync(bookingsPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
    }
  }
);

router.get("/analysis/history", (_req: Request, res: Response) => {
  const log = loadRunLog();
  res.json(log);
});

router.get("/analysis/history/:id", (req: Request, res: Response) => {
  const log = loadRunLog();
  const entry = log.find((e) => e.id === req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (entry.status !== "success") {
    res.status(400).json({ error: "Run was not successful", entry });
    return;
  }
  const cached = getCachedResult(entry.cacheKey);
  if (!cached) {
    res.status(404).json({ error: "Cached result no longer available" });
    return;
  }
  res.json({ ...cached, fromHistory: true, runId: entry.id });
});

router.get("/analysis/download", (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  if (!filePath.startsWith("/tmp/")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.download(filePath, path.basename(filePath));
});

export default router;
