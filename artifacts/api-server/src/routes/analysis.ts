import { Router, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const router = Router();
const upload = multer({ dest: "/tmp/uploads/" });

const SCRIPT_PATH = "/home/runner/workspace/scripts/src/combine_parts_analysis.py";

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

    const emptyCache = path.join(outputDir, "empty_cache.json");
    fs.writeFileSync(emptyCache, "{}");

    const args = [
      SCRIPT_PATH,
      "--booking-file", bookingPath,
      "--national-file", nationalPath,
      "--output-dir", outputDir,
      "--json-output", jsonOutput,
      "--pd-cache-file", emptyCache,
    ];

    const cutoffYear = req.body?.cutoff_year;
    const faiThreshold = req.body?.fai_threshold;
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
      res.json(jsonData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      try { fs.unlinkSync(bookingPath); } catch {}
      try { fs.unlinkSync(nationalPath); } catch {}
    }
  }
);

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

export default router;
