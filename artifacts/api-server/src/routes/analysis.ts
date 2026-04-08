import { Router, type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import archiver from "archiver";

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
