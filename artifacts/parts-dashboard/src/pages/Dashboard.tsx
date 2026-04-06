import { useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Upload,
  Download,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Target,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Play,
  Settings,
  LayoutDashboard,
  FolderInput,
  FileOutput,
  SlidersHorizontal,
  CloudUpload,
  X,
  Clock,
  RefreshCw,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import * as XLSX from "xlsx";

const API_BASE = "/api";

const CHART_COLORS = [
  "hsl(213, 94%, 38%)",
  "hsl(160, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(190, 70%, 45%)",
  "hsl(45, 85%, 50%)",
  "hsl(0, 65%, 50%)",
];

interface AnalysisResult {
  output_file: string;
  elapsed_seconds: number;
  summary: {
    total_unique_parts: number;
    new_deals_count: number;
    pd_info_count: number;
    total_new_deals_revenue: number;
    total_pd_pipeline_value: number;
    won_deals_count: number;
    won_deals_value: number;
    open_deals_count: number;
    open_deals_value: number;
    avg_deal_value_pd: number;
    avg_deal_value_new: number;
    landmark_parts_count: number;
    pd_cache_entries: number;
  };
  analytics: {
    pd_status_distribution: Record<string, number>;
    platform_distribution: Record<string, number>;
    platform_revenue: Record<string, number>;
    label_distribution: Record<string, number>;
    stage_distribution: Record<string, number>;
    industry_distribution: Record<string, number>;
    deal_type_distribution: Record<string, number>;
    new_deals_status_distribution: Record<string, number>;
    calc_label_distribution: Record<string, number>;
    top_customers_new: { name: string; revenue: number }[];
    top_customers_pd: { name: string; value: number }[];
  };
  sheets: {
    all_unique_parts: any[];
    new_deals: any[];
    pd_info: any[];
  };
  source_data: {
    bookings_sheets: Record<string, { headers: string[]; rows: any[] }>;
    national_sheets: Record<string, { headers: string[]; rows: any[] }>;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function dictToChartData(dict: Record<string, number>, nameKey = "name", valKey = "value") {
  return Object.entries(dict)
    .filter(([k]) => k && k !== "Unknown" && k !== "")
    .map(([k, v]) => ({ [nameKey]: k, [valKey]: v }))
    .sort((a, b) => (b[valKey] as number) - (a[valKey] as number));
}

function KpiCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
}: {
  title: string;
  value: string;
  icon: any;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {trend === "up" && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-[#1B2A4A]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DataTable({
  data,
  columns,
  maxRows = 100,
}: {
  data: any[];
  columns: { key: string; label: string; format?: (v: any) => string }[];
  maxRows?: number;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = maxRows;

  const filtered = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(lower))
    );
  }, [data, search, columns]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {formatNumber(filtered.length)} rows
        </span>
      </div>
      <div className="overflow-auto max-h-[500px] border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-1.5 whitespace-nowrap">
                    {col.format ? col.format(row[col.key]) : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function SourceDataView({
  title,
  subtitle,
  sheets,
  sheetNames,
  defaultSheet,
  onExportExcel,
}: {
  title: string;
  subtitle: string;
  sheets: Record<string, { headers: string[]; rows: any[] }>;
  sheetNames: string[];
  defaultSheet: string;
  onExportExcel?: () => void;
}) {
  const [activeSheet, setActiveSheet] = useState(defaultSheet);
  const totalRows = Object.values(sheets).reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <div className="px-8 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {subtitle} — {sheetNames.length} sheet{sheetNames.length !== 1 ? "s" : ""}, {formatNumber(totalRows)} total rows
          </p>
        </div>
        {onExportExcel && (
          <Button onClick={onExportExcel} className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
        )}
      </div>
      <Tabs value={activeSheet} onValueChange={setActiveSheet}>
        <TabsList className="mb-4">
          {sheetNames.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name} ({formatNumber(sheets[name].rows.length)})
            </TabsTrigger>
          ))}
        </TabsList>
        {sheetNames.map((name) => (
          <TabsContent key={name} value={name}>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <DataTable
                  data={sheets[name].rows}
                  columns={sheets[name].headers.map((h) => ({ key: h, label: h }))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

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

type NavPage = "process" | "dashboard" | "results" | "source_bookings" | "history" | "settings";

export default function Dashboard() {
  const [bookingsFile, setBookingsFile] = useState<File | null>(null);
  const [nationalFile, setNationalFile] = useState<File | null>(null);
  const [cutoffYear, setCutoffYear] = useState("2021");
  const [faiThreshold, setFaiThreshold] = useState("0.50");
  const [syncPipedrive, setSyncPipedrive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem("analysis_result");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [activeTab, setActiveTab] = useState("summary");
  const [dragOver1, setDragOver1] = useState(false);
  const [dragOver2, setDragOver2] = useState(false);
  const [activePage, setActivePage] = useState<NavPage>(() => {
    try {
      if (localStorage.getItem("analysis_result")) return "dashboard";
    } catch {}
    return "process";
  });
  const [wasCached, setWasCached] = useState(false);
  const [cacheReason, setCacheReason] = useState("");
  const [runHistory, setRunHistory] = useState<RunLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/analysis/history`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRunHistory(data); })
      .catch(() => {});
  }, [result]);

  const loadHistoryRun = async (runId: string) => {
    setHistoryLoading(runId);
    try {
      const resp = await fetch(`${API_BASE}/analysis/history/${runId}`);
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.error || "Failed to load historical run");
        return;
      }
      const data = await resp.json();
      setResult(data);
      setWasCached(true);
      setCacheReason("Loaded from run history");
      try { localStorage.setItem("analysis_result", JSON.stringify(data)); } catch {}
      setActivePage("dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setHistoryLoading(null);
    }
  };

  const handleDrop = useCallback(
    (setter: (f: File) => void, e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) setter(file);
    },
    []
  );

  const runAnalysis = async () => {
    if (!bookingsFile || !nationalFile) {
      setError("Please upload both files before running.");
      return;
    }
    setLoading(true);
    setError("");
    setProgress(10);

    const formData = new FormData();
    formData.append("bookings_zip", bookingsFile);
    formData.append("national_zip", nationalFile);
    formData.append("cutoff_year", cutoffYear);
    formData.append("fai_threshold", faiThreshold);

    const progressTimer = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 90));
    }, 2000);

    try {
      const resp = await fetch(`${API_BASE}/analysis/run`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressTimer);
      setProgress(95);

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await resp.json();
      const isCached = data.cached === true;
      const reason = data.cacheReason || "";
      delete data.cached;
      delete data.cacheReason;
      const analysisData: AnalysisResult = data;
      setResult(analysisData);
      setWasCached(isCached);
      setCacheReason(reason);
      try { localStorage.setItem("analysis_result", JSON.stringify(analysisData)); } catch {}
      setProgress(100);
      setActiveTab("summary");
      setActivePage("dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      clearInterval(progressTimer);
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!result?.output_file) return;
    window.open(`${API_BASE}/analysis/download?path=${encodeURIComponent(result.output_file)}`, "_blank");
  };

  const navItems = [
    { id: "dashboard" as NavPage, label: "Dashboard", icon: LayoutDashboard, disabled: !result },
    { id: "process" as NavPage, label: "Process Files", icon: FolderInput },
    { id: "results" as NavPage, label: "Results & Export", icon: FileOutput, disabled: !result },
    { id: "source_bookings" as NavPage, label: "Natman Bookings", icon: FileSpreadsheet, disabled: !result },
    { id: "history" as NavPage, label: "Run History", icon: Clock },
    { id: "settings" as NavPage, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-[#F0F2F5]">
      <aside className="w-56 bg-[#1B2A4A] text-white flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">National Pipeline</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">Manager</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => !item.disabled && setActivePage(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activePage === item.id
                  ? "bg-white/15 text-white"
                  : item.disabled
                  ? "text-white/25 cursor-not-allowed"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        {activePage === "process" && (
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[#1B2A4A]">Process Data</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload raw exports to identify new business and sync with Pipedrive.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A4A]">
                    <FileSpreadsheet className="h-4 w-4" />
                    National Quote Data
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Upload the raw quote export (.xlsx)</p>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                      dragOver1
                        ? "border-[#1B2A4A] bg-[#1B2A4A]/5"
                        : nationalFile
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 hover:border-[#1B2A4A]/30 bg-gray-50/50"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver1(true); }}
                    onDragLeave={() => setDragOver1(false)}
                    onDrop={(e) => { setDragOver1(false); handleDrop(setNationalFile, e); }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".zip,.xlsx";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) setNationalFile(file);
                      };
                      input.click();
                    }}
                  >
                    {nationalFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <p className="text-sm font-medium text-emerald-700 truncate max-w-full">{nationalFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(nationalFile.size / 1024).toFixed(0)} KB</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={(e) => { e.stopPropagation(); setNationalFile(null); }}
                        >
                          <X className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <CloudUpload className="h-8 w-8 text-gray-400" />
                        <p className="text-sm font-medium text-gray-600">Drag & drop your file here</p>
                        <p className="text-xs text-muted-foreground">or click to browse</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          Select File
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A4A]">
                    <FileSpreadsheet className="h-4 w-4" />
                    Development Booking
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Upload the development booking export (.xlsx)</p>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                      dragOver2
                        ? "border-[#1B2A4A] bg-[#1B2A4A]/5"
                        : bookingsFile
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 hover:border-[#1B2A4A]/30 bg-gray-50/50"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver2(true); }}
                    onDragLeave={() => setDragOver2(false)}
                    onDrop={(e) => { setDragOver2(false); handleDrop(setBookingsFile, e); }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".zip,.xlsx";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) setBookingsFile(file);
                      };
                      input.click();
                    }}
                  >
                    {bookingsFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <p className="text-sm font-medium text-emerald-700 truncate max-w-full">{bookingsFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(bookingsFile.size / 1024).toFixed(0)} KB</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={(e) => { e.stopPropagation(); setBookingsFile(null); }}
                        >
                          <X className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <CloudUpload className="h-8 w-8 text-gray-400" />
                        <p className="text-sm font-medium text-gray-600">Drag & drop your file here</p>
                        <p className="text-xs text-muted-foreground">or click to browse</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          Select File
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A4A]">
                  <SlidersHorizontal className="h-4 w-4" />
                  Processing Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1B2A4A]">Sync with Pipedrive</p>
                    <p className="text-xs text-muted-foreground">Match parts against existing Pipedrive deals</p>
                  </div>
                  <Switch checked={syncPipedrive} onCheckedChange={setSyncPipedrive} />
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#1B2A4A] mb-1.5">Quote Date Cutoff Year</p>
                    <Input
                      type="number"
                      value={cutoffYear}
                      onChange={(e) => setCutoffYear(e.target.value)}
                      min="2015"
                      max="2030"
                      className="w-28"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-5">Ignore quotes older than this year to reduce noise.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#1B2A4A] mb-1.5">FAI Threshold</p>
                    <Input
                      type="number"
                      value={faiThreshold}
                      onChange={(e) => setFaiThreshold(e.target.value)}
                      step="0.05"
                      min="0"
                      max="1"
                      className="w-28"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-5">First Article Inspection revenue threshold (0-1).</p>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {loading && (
              <div className="mb-4">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5 text-center">
                  Processing... {progress}% complete
                </p>
              </div>
            )}

            <Button
              onClick={runAnalysis}
              disabled={loading || !bookingsFile || !nationalFile}
              className="w-full h-12 text-base font-semibold bg-[#1B2A4A] hover:bg-[#243659] text-white rounded-lg gap-2"
              size="lg"
            >
              {loading ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Pipeline
                </>
              )}
            </Button>

            {result && !loading && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <p className="text-sm text-blue-800">
                    Previous results available — {formatNumber(result.summary.total_unique_parts)} parts analyzed.
                    Upload the same files to load cached results instantly.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-800 shrink-0"
                  onClick={() => setActivePage("dashboard")}
                >
                  View Results
                </Button>
              </div>
            )}
          </div>
        )}

        {activePage === "dashboard" && result && (
          <div className="px-8 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#1B2A4A]">Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  Analysis completed in {result.elapsed_seconds}s
                  {wasCached && (
                    <Badge variant="secondary" className="text-xs" title={cacheReason}>Cached</Badge>
                  )}
                </p>
              </div>
              <Button onClick={downloadExcel} className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
                <Download className="h-4 w-4" />
                Download Excel
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <KpiCard title="Unique Parts" value={formatNumber(result.summary.total_unique_parts)} icon={Package} />
              <KpiCard title="New Deals" value={formatNumber(result.summary.new_deals_count)} icon={Target} subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_new)}`} />
              <KpiCard title="PD Deals" value={formatNumber(result.summary.pd_info_count)} icon={BarChart3} subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_pd)}`} />
              <KpiCard title="Pipeline Value" value={formatCurrency(result.summary.total_pd_pipeline_value)} icon={DollarSign} trend="up" />
              <KpiCard title="Won Deals" value={formatNumber(result.summary.won_deals_count)} icon={CheckCircle2} subtitle={formatCurrency(result.summary.won_deals_value)} trend="up" />
              <KpiCard title="Open Pipeline" value={formatNumber(result.summary.open_deals_count)} icon={Users} subtitle={formatCurrency(result.summary.open_deals_value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Deal Classification (New Deals)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dictToChartData(result.analytics.calc_label_distribution)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {dictToChartData(result.analytics.calc_label_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Pipeline Status (PD Deals)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dictToChartData(result.analytics.pd_status_distribution)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {dictToChartData(result.analytics.pd_status_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Revenue by Platform</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dictToChartData(result.analytics.platform_revenue, "name", "value")} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Deals by Platform</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dictToChartData(result.analytics.platform_distribution, "name", "value")} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm md:col-span-2">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Top 15 Customers by Pipeline Value</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={result.analytics.top_customers_pd}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => formatCurrency(v)} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Analysis Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                  <div className="space-y-2">
                    <p className="font-semibold text-[#1B2A4A] text-xs uppercase tracking-wide">Data Coverage</p>
                    <p className="text-muted-foreground">LANDMARK parts: <span className="font-semibold text-foreground">{formatNumber(result.summary.landmark_parts_count)}</span></p>
                    <p className="text-muted-foreground">PD Cache entries: <span className="font-semibold text-foreground">{formatNumber(result.summary.pd_cache_entries)}</span></p>
                    <p className="text-muted-foreground">Total unique parts: <span className="font-semibold text-foreground">{formatNumber(result.summary.total_unique_parts)}</span></p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[#1B2A4A] text-xs uppercase tracking-wide">New Deals Breakdown</p>
                    {Object.entries(result.analytics.calc_label_distribution).map(([k, v]) => (
                      <p key={k} className="text-muted-foreground">{k}: <span className="font-semibold text-foreground">{formatNumber(v)}</span></p>
                    ))}
                    <p className="text-muted-foreground">Total Revenue: <span className="font-semibold text-foreground">{formatCurrency(result.summary.total_new_deals_revenue)}</span></p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[#1B2A4A] text-xs uppercase tracking-wide">Deal Types</p>
                    {Object.entries(result.analytics.deal_type_distribution).map(([k, v]) => (
                      <p key={k} className="text-muted-foreground">{k}: <span className="font-semibold text-foreground">{formatNumber(v)}</span></p>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[#1B2A4A] text-xs uppercase tracking-wide">Industry Mix</p>
                    {Object.entries(result.analytics.industry_distribution).map(([k, v]) => (
                      <p key={k} className="text-muted-foreground">{k}: <span className="font-semibold text-foreground">{formatNumber(v)}</span></p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activePage === "results" && result && (
          <div className="px-8 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#1B2A4A]">Results & Export</h1>
                <p className="text-sm text-muted-foreground mt-1">Browse and export analysis results</p>
              </div>
              <Button onClick={downloadExcel} className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
                <Download className="h-4 w-4" />
                Download Excel
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="summary">Charts</TabsTrigger>
                <TabsTrigger value="all_parts">All Parts ({formatNumber(result.sheets.all_unique_parts.length)})</TabsTrigger>
                <TabsTrigger value="new_deals">New Deals ({formatNumber(result.sheets.new_deals.length)})</TabsTrigger>
                <TabsTrigger value="pd_info">PD Info ({formatNumber(result.sheets.pd_info.length)})</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Label Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={dictToChartData(result.analytics.label_distribution)} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                            {dictToChartData(result.analytics.label_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Pipeline Stage Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={dictToChartData(result.analytics.stage_distribution)}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Industry Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={dictToChartData(result.analytics.industry_distribution)} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {dictToChartData(result.analytics.industry_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">New Deals by Status</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={dictToChartData(result.analytics.new_deals_status_distribution)}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm md:col-span-2">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Top 15 New Deal Customers by Revenue</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={result.analytics.top_customers_new}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => formatCurrency(v)} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="revenue" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="all_parts">
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <DataTable
                      data={result.sheets.all_unique_parts}
                      columns={[
                        { key: "customer_part_id", label: "Customer Part ID" },
                        { key: "in_quote_data", label: "In Quote Data", format: (v) => v ? "Yes" : "No" },
                        { key: "in_landmark", label: "In LANDMARK", format: (v) => v ? "Yes" : "No" },
                        { key: "has_pd_match", label: "Has PD Match", format: (v) => v ? "Yes" : "No" },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="new_deals">
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <DataTable
                      data={result.sheets.new_deals}
                      columns={[
                        { key: "name", label: "Customer" },
                        { key: "customer_part_id", label: "Part ID" },
                        { key: "mapped_status", label: "Status" },
                        { key: "mapped_probability", label: "Probability" },
                        { key: "mapped_med_rev", label: "Revenue", format: (v) => formatCurrency(v || 0) },
                        { key: "mapped_pd_p2_time", label: "P2 Time" },
                        { key: "first_order_date", label: "First Order" },
                        { key: "calc_label", label: "Label" },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pd_info">
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <DataTable
                      data={result.sheets.pd_info}
                      columns={[
                        { key: "pd_id", label: "PD ID" },
                        { key: "customer_part_id", label: "Part ID" },
                        { key: "title", label: "Title" },
                        { key: "value", label: "Value", format: (v) => formatCurrency(v || 0) },
                        { key: "status", label: "Status" },
                        { key: "org_name", label: "Customer" },
                        { key: "stage_id", label: "Stage" },
                        { key: "label", label: "Label" },
                        { key: "platform_company", label: "Platform" },
                        { key: "deal_type", label: "Deal Type" },
                        { key: "mfg_type", label: "Mfg Type" },
                        { key: "industry", label: "Industry" },
                      ]}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {activePage === "source_bookings" && result && (() => {
          const sheets = result.source_data.bookings_sheets;
          const sheetNames = Object.keys(sheets);
          const defaultSheet = sheetNames[0] || "";
          const exportBookingsExcel = () => {
            const wb = XLSX.utils.book_new();
            for (const name of sheetNames) {
              const sheet = sheets[name];
              const wsData = [sheet.headers, ...sheet.rows.map((row: any) => sheet.headers.map((h: string) => row[h]))];
              const ws = XLSX.utils.aoa_to_sheet(wsData);
              XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
            }
            XLSX.writeFile(wb, "Natman_Bookings_Export.xlsx");
          };
          return (
            <SourceDataView
              title="Natman Bookings"
              subtitle="Output from the Natman Bookings package"
              sheets={sheets}
              sheetNames={sheetNames}
              defaultSheet={defaultSheet}
              onExportExcel={exportBookingsExcel}
            />
          );
        })()}

        {activePage === "history" && (
          <div className="px-8 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#1B2A4A]">Run History</h1>
              <p className="text-sm text-muted-foreground mt-1">View past pipeline runs and load previous results</p>
            </div>

            {runHistory.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No pipeline runs yet. Process files to see run history.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <Card key={run.id} className={`transition-all hover:shadow-md ${run.status === "fail" ? "border-red-200" : ""}`}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {run.status === "success" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                            <span className="font-semibold text-sm text-[#1B2A4A] truncate">
                              {run.nationalFileName}
                            </span>
                            <Badge variant={run.status === "success" ? "default" : "destructive"} className="text-xs shrink-0">
                              {run.status === "success" ? "Success" : "Failed"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-6">
                            <span>{new Date(run.uploadTime).toLocaleString()}</span>
                            <span>{formatNumber(run.nationalRowCount)} rows</span>
                            <span>Cutoff: {run.cutoffYear}</span>
                            <span>FAI: {run.faiThreshold}</span>
                            {run.status === "success" && (
                              <>
                                <span className="text-green-700">{formatNumber(run.uniqueParts)} parts</span>
                                <span className="text-blue-700">{formatNumber(run.newDeals)} new deals</span>
                              </>
                            )}
                          </div>
                          {run.status === "fail" && run.errorSummary && (
                            <p className="text-xs text-red-600 mt-1 ml-6 truncate">{run.errorSummary}</p>
                          )}
                        </div>

                        {run.status === "success" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-4 shrink-0 gap-1.5"
                            disabled={historyLoading === run.id}
                            onClick={() => loadHistoryRun(run.id)}
                          >
                            {historyLoading === run.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3.5 w-3.5" />
                                Load Results
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activePage === "settings" && (
          <div className="max-w-2xl mx-auto px-8 py-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[#1B2A4A]">Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">Configure pipeline defaults</p>
            </div>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1B2A4A]">Pipedrive Sync</p>
                    <p className="text-xs text-muted-foreground">Automatically match parts with Pipedrive deals</p>
                  </div>
                  <Switch checked={syncPipedrive} onCheckedChange={setSyncPipedrive} />
                </div>
                <div className="border-t pt-5">
                  <p className="text-sm font-medium text-[#1B2A4A] mb-1.5">Default Cutoff Year</p>
                  <Input
                    type="number"
                    value={cutoffYear}
                    onChange={(e) => setCutoffYear(e.target.value)}
                    min="2015"
                    max="2030"
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Quotes before this year will be excluded</p>
                </div>
                <div className="border-t pt-5">
                  <p className="text-sm font-medium text-[#1B2A4A] mb-1.5">Default FAI Threshold</p>
                  <Input
                    type="number"
                    value={faiThreshold}
                    onChange={(e) => setFaiThreshold(e.target.value)}
                    step="0.05"
                    min="0"
                    max="1"
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Revenue threshold for First Article Inspection split (0-1)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
