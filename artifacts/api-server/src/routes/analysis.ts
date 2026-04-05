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
