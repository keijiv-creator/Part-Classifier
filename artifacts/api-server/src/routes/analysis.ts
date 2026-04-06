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

fs.mkdirSync(CACHE_DIR, { recursive: true });

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

    const bookingsPath = files.bookings_zip[0].path;
    const nationalPath = files.national_zip[0].path;
    const cutoffYear = req.body?.cutoff_year || "2021";
    const faiThreshold = req.body?.fai_threshold || "0.50";

    const bookingsHash = hashFile(bookingsPath);
    const nationalHash = hashFile(nationalPath);
    const cacheKey = buildCacheKey(bookingsHash, nationalHash, cutoffYear, faiThreshold);

    const cached = getCachedResult(cacheKey);
    if (cached) {
      console.log(`[analysis] Cache hit: ${cacheKey.slice(0, 12)}...`);
      try { fs.unlinkSync(bookingsPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
      res.json({ ...cached, cached: true });
      return;
    }

    console.log(`[analysis] Cache miss: ${cacheKey.slice(0, 12)}... running pipeline`);

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
      saveCachedResult(cacheKey, jsonData);
      res.json(jsonData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      try { fs.unlinkSync(bookingsPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
    }
  }
);

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
