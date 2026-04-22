import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  FileText,
  Archive,
  History,
  GitCompare,
  Plus,
  Minus,
  ArrowRight,
  Calendar,
  Key,
  AlertTriangle,
  Eye,
  ArrowLeft,
  Loader2,
  Link2,
  Check,
  Menu,
  Trash2,
  Clipboard,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
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

interface DiffData {
  previousRunId: number;
  currentRunId: number;
  newDeals: {
    rows: any[];
    summary: { added: number; removed: number; changed: number; unchanged: number; revenueChange: number };
  };
  pdInfo: {
    rows: any[];
    summary: { added: number; removed: number; changed: number; unchanged: number; revenueChange: number };
  };
}

interface AnalysisResult {
  output_file: string | null;
  natman_bookings_file?: string | null;
  pdsync_file?: string | null;
  elapsed_seconds?: number;
  run_id?: number;
  diff?: DiffData | null;
  _historical?: boolean;
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
  source_data?: {
    bookings_sheets: Record<string, { headers: string[]; rows: any[] }>;
    national_sheets: Record<string, { headers: string[]; rows: any[] }>;
  } | null;
}

interface RunSummary {
  id: number;
  createdAt: string;
  reportDate: string | null;
  cutoffYear: number | null;
  faiThreshold: number | null;
  totalUniqueParts: number;
  newDealsCount: number;
  pdInfoCount: number;
  totalNewDealsRevenue: number;
  totalPdPipelineValue: number;
  wonDealsCount: number;
  openDealsCount: number;
  hasResultJson?: boolean;
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

function truncateLabel(label: string, max = 18): string {
  if (!label) return "";
  return label.length > max ? label.slice(0, max - 1) + "\u2026" : label;
}

function DeltaBadge({ value, isCurrency = false }: { value: number; isCurrency?: boolean }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  const display = isCurrency ? formatCurrency(Math.abs(value)) : formatNumber(Math.abs(value));
  return (
    <span className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
      {isPositive ? "+" : "-"}{display}
    </span>
  );
}

function ChangeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    NEW: "bg-emerald-100 text-emerald-700 border-emerald-200",
    REMOVED: "bg-red-100 text-red-700 border-red-200",
    CHANGED: "bg-amber-100 text-amber-700 border-amber-200",
    UNCHANGED: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${styles[type] || styles.UNCHANGED}`}>
      {type}
    </span>
  );
}

const FIELD_LABELS: Record<string, string> = {
  mappedStatus: "Status",
  mappedProbability: "Probability",
  mappedMedRev: "Revenue",
  mappedPdP1Time: "P1 Time",
  mappedPdP2Time: "P2 Time",
  mappedPdP4Time: "P4 Time",
  mappedPdP5Time: "P5 Time",
  quoteNumber: "Quote #",
  calcLabel: "Label",
  pdId: "PD ID",
  pdValue: "PD Value",
  pdStatus: "PD Status",
  pdStage: "PD Stage",
};

function ChangeDetails({ changes }: { changes?: Record<string, { old: any; new: any }> }) {
  if (!changes || Object.keys(changes).length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {Object.entries(changes).map(([field, { old: oldVal, new: newVal }]) => {
        const label = FIELD_LABELS[field] || field;
        const formatVal = (v: any) => {
          if (field === "mappedMedRev" || field === "pdValue") return formatCurrency(Number(v) || 0);
          return String(v || "(empty)");
        };
        return (
          <div key={field} className="flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground font-medium">{label}:</span>
            <span className="text-red-500 line-through">{formatVal(oldVal)}</span>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-emerald-600 font-medium">{formatVal(newVal)}</span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  delta,
  deltaCurrency,
}: {
  title: string;
  value: string;
  icon: any;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  delta?: number;
  deltaCurrency?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold">{value}</p>
              {delta !== undefined && delta !== 0 && <DeltaBadge value={delta} isCurrency={deltaCurrency} />}
            </div>
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

function DiffDataTable({
  data,
  columns,
  maxRows = 100,
  showDiff = false,
  tableLabel = "Table",
}: {
  data: any[];
  columns: { key: string; label: string; format?: (v: any) => string }[];
  maxRows?: number;
  showDiff?: boolean;
  tableLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [changeFilter, setChangeFilter] = useState<string>("ALL");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const pageSize = maxRows;

  const filtered = useMemo(() => {
    let d = data;
    if (showDiff && changeFilter !== "ALL") {
      d = d.filter((row) => row.changeType === changeFilter);
    }
    if (!search) return d;
    const lower = search.toLowerCase();
    return d.filter((row) =>
      columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(lower))
    );
  }, [data, search, columns, changeFilter, showDiff]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const changeCounts = useMemo(() => {
    if (!showDiff) return null;
    const counts: Record<string, number> = { ALL: data.length, NEW: 0, REMOVED: 0, CHANGED: 0, UNCHANGED: 0 };
    for (const row of data) {
      if (row.changeType) counts[row.changeType] = (counts[row.changeType] || 0) + 1;
    }
    return counts;
  }, [data, showDiff]);

  const allColumns = useMemo(() => {
    if (!showDiff) return columns;
    return [{ key: "_change", label: "Change" }, ...columns];
  }, [columns, showDiff]);

  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const badgeStyles: Record<string, string> = {
    NEW:       "background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;",
    CHANGED:   "background:#fef3c7;color:#92400e;border:1px solid #fcd34d;",
    REMOVED:   "background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;",
    UNCHANGED: "background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;",
  };

  const copyHtml = async () => {
    setCopying(true);
    try {
      const headers = allColumns.map((c) => c.label);
      let html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;width:100%;">`;
      html += `<thead><tr style="background:#f9fafb;">`;
      for (const h of headers) {
        html += `<th style="padding:8px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #e5e7eb;white-space:nowrap;">${escHtml(h)}</th>`;
      }
      html += `</tr></thead><tbody>`;

      for (const row of filtered) {
        const ct: string = row.changeType || "UNCHANGED";
        const rowBg = ct === "NEW" ? "#f0fdf4" : ct === "REMOVED" ? "#fef2f2" : ct === "CHANGED" ? "#fffbeb" : "#ffffff";
        html += `<tr style="background:${rowBg};border-top:1px solid #f3f4f6;">`;
        for (const col of allColumns) {
          if (col.key === "_change") {
            const bs = badgeStyles[ct] || badgeStyles.UNCHANGED;
            html += `<td style="padding:6px 12px;white-space:nowrap;"><span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;${bs}">${ct}</span></td>`;
          } else {
            const raw = row[col.key];
            const val = col.format ? col.format(raw) : String(raw ?? "");
            html += `<td style="padding:6px 12px;white-space:nowrap;">${escHtml(val)}</td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;

      await navigator.clipboard.writeText(html);
      toast.success("Table HTML copied — paste into your email");
    } catch {
      toast.error("Failed to copy — please try again");
    } finally {
      setCopying(false);
    }
  };

  const saveScreenshot = async () => {
    if (!tableWrapRef.current) return;
    setScreenshotting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(tableWrapRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const date = new Date().toISOString().slice(0, 10);
      const filename = `Parts_Analysis_${tableLabel}_${date}.png`;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = filename;
      a.click();
      toast.success(`Screenshot saved as ${filename}`);
    } catch {
      toast.error("Screenshot failed — please try again");
    } finally {
      setScreenshotting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        {showDiff && changeCounts && (
          <div className="flex gap-1">
            {(["ALL", "NEW", "CHANGED", "REMOVED", "UNCHANGED"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setChangeFilter(t); setPage(0); }}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  changeFilter === t ? "bg-[#1B2A4A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t} ({changeCounts[t] || 0})
              </button>
            ))}
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          {formatNumber(filtered.length)} rows
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={copying}
            onClick={copyHtml}
            className="gap-1.5 h-8 px-2.5 text-xs border-[#1B2A4A]/30 text-[#1B2A4A] hover:bg-[#1B2A4A]/5"
            title="Copy table as HTML — paste into email"
          >
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clipboard className="h-3.5 w-3.5" />}
            Copy as HTML
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={screenshotting}
            onClick={saveScreenshot}
            className="gap-1.5 h-8 px-2.5 text-xs border-[#1B2A4A]/30 text-[#1B2A4A] hover:bg-[#1B2A4A]/5"
            title="Save table as a PNG screenshot"
          >
            {screenshotting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Save Screenshot
          </Button>
        </div>
      </div>
      <div ref={tableWrapRef} className="overflow-auto max-h-[500px] border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {allColumns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => {
              const ct = row.changeType;
              const rowBg = showDiff && ct === "NEW" ? "bg-emerald-50/50"
                : showDiff && ct === "REMOVED" ? "bg-red-50/50"
                : showDiff && ct === "CHANGED" ? "bg-amber-50/30"
                : "";
              const globalIdx = page * pageSize + i;
              const isExpanded = expandedRow === globalIdx;
              return (
                <tr
                  key={i}
                  className={`border-t hover:bg-muted/30 transition-colors cursor-pointer ${rowBg}`}
                  onClick={() => showDiff && ct === "CHANGED" && setExpandedRow(isExpanded ? null : globalIdx)}
                >
                  {allColumns.map((col) => (
                    <td key={col.key} className="px-3 py-1.5 whitespace-nowrap">
                      {col.key === "_change" ? (
                        <div>
                          <ChangeBadge type={ct || "UNCHANGED"} />
                          {isExpanded && ct === "CHANGED" && <ChangeDetails changes={row.changes} />}
                        </div>
                      ) : (
                        col.format ? col.format(row[col.key]) : String(row[col.key] ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
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

function DataTable({
  data,
  columns,
  maxRows = 100,
}: {
  data: any[];
  columns: { key: string; label: string; format?: (v: any) => string }[];
  maxRows?: number;
}) {
  return <DiffDataTable data={data} columns={columns} maxRows={maxRows} showDiff={false} />;
}

function SourceDataView({
  title,
  subtitle,
  sheets,
  sheetNames,
  defaultSheet,
  downloadAction,
  downloadLabel,
}: {
  title: string;
  subtitle: string;
  sheets: Record<string, { headers: string[]; rows: any[] }>;
  sheetNames: string[];
  defaultSheet: string;
  downloadAction?: () => void;
  downloadLabel?: string;
}) {
  const [activeSheet, setActiveSheet] = useState(defaultSheet);
  const totalRows = Object.values(sheets).reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1B2A4A]">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {subtitle} — {sheetNames.length} sheet{sheetNames.length !== 1 ? "s" : ""}, {formatNumber(totalRows)} total rows
          </p>
        </div>
        {downloadAction && (
          <Button onClick={downloadAction} size="sm" className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
            <Download className="h-4 w-4" />
            {downloadLabel || "Download"}
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

function DiffSummaryCard({ diff }: { diff: DiffData }) {
  const nd = diff.newDeals.summary;
  const pi = diff.pdInfo.summary;
  const totalAdded = nd.added + pi.added;
  const totalRemoved = nd.removed + pi.removed;
  const totalChanged = nd.changed + pi.changed;
  const netRevenue = nd.revenueChange + pi.revenueChange;

  return (
    <Card className="border-0 shadow-sm border-l-4 border-l-[#1B2A4A] mb-6">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <GitCompare className="h-4 w-4 text-[#1B2A4A]" />
          <p className="text-sm font-semibold text-[#1B2A4A]">Changes vs. Previous Run (#{diff.previousRunId})</p>
        </div>
        <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-semibold text-emerald-600">{totalAdded}</span>
            <span className="text-muted-foreground">added</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus className="h-3.5 w-3.5 text-red-500" />
            <span className="font-semibold text-red-500">{totalRemoved}</span>
            <span className="text-muted-foreground">removed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-semibold text-amber-600">{totalChanged}</span>
            <span className="text-muted-foreground">changed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-[#1B2A4A]" />
            <span className="text-muted-foreground">Net revenue:</span>
            <DeltaBadge value={netRevenue} isCurrency />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type NavPage = "process" | "dashboard" | "results" | "source_national" | "source_bookings" | "history" | "settings";

export default function Dashboard() {
  const [bookingsFile, setBookingsFile] = useState<File | null>(null);
  const [nationalFile, setNationalFile] = useState<File | null>(null);
  const [cutoffYear, setCutoffYear] = useState("2021");
  const [syncPipedrive, setSyncPipedrive] = useState(true);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportDateWarning, setReportDateWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<boolean>(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [dragOver1, setDragOver1] = useState(false);
  const [dragOver2, setDragOver2] = useState(false);
  const [activePage, setActivePage] = useState<NavPage>(result ? "dashboard" : "process");
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [compareRunA, setCompareRunA] = useState<number | null>(null);
  const [compareRunB, setCompareRunB] = useState<number | null>(null);
  const [comparisonDiff, setComparisonDiff] = useState<DiffData | null>(null);
  const [comparing, setComparing] = useState(false);

  const [viewingHistoricalRun, setViewingHistoricalRun] = useState<{ id: number; reportDate: string | null; createdAt: string } | null>(null);
  const [loadingRunId, setLoadingRunId] = useState<number | null>(null);
  const [savedCurrentResult, setSavedCurrentResult] = useState<AnalysisResult | null>(null);
  const [copyLinkFeedbackId, setCopyLinkFeedbackId] = useState<number | null>(null);

  const [copyLinkFailed, setCopyLinkFailed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const copyRunLink = (runId: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("run", String(runId));
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopyLinkFailed(false);
      setCopyLinkFeedbackId(runId);
      setTimeout(() => setCopyLinkFeedbackId(null), 2000);
    }).catch(() => {
      setCopyLinkFailed(true);
      setCopyLinkFeedbackId(runId);
      setTimeout(() => { setCopyLinkFeedbackId(null); setCopyLinkFailed(false); }, 2000);
    });
  };

  const loadHistoricalRun = async (runId: number) => {
    setLoadingRunId(runId);
    try {
      const resp = await fetch(`${API_BASE}/analysis/runs/${runId}`);
      if (!resp.ok) {
        const err = await resp.json();
        setError(err.error || "Failed to load run");
        if (!result) setActivePage("process");
        const cleanUrl = new URL(window.location.href);
        if (cleanUrl.searchParams.has("run")) {
          cleanUrl.searchParams.delete("run");
          window.history.replaceState(null, "", cleanUrl.toString());
        }
        return;
      }
      const data = await resp.json();
      const historicalResult: AnalysisResult = {
        ...data.result,
        run_id: data.id,
        output_file: null,
        natman_bookings_file: null,
        pdsync_file: null,
        diff: null,
        _historical: true,
      };
      if (!viewingHistoricalRun && result) {
        setSavedCurrentResult(result);
      }
      setResult(historicalResult);
      setViewingHistoricalRun({ id: data.id, reportDate: data.reportDate, createdAt: data.createdAt });
      setActiveTab("summary");
      setActivePage("dashboard");
      setError("");
      const url = new URL(window.location.href);
      url.searchParams.set("run", String(data.id));
      window.history.replaceState(null, "", url.toString());
    } catch (err: any) {
      setError(err.message || "Failed to load run");
      if (!result) setActivePage("process");
      const url = new URL(window.location.href);
      if (url.searchParams.has("run")) {
        url.searchParams.delete("run");
        window.history.replaceState(null, "", url.toString());
      }
    } finally {
      setLoadingRunId(null);
    }
  };

  const clearHistoricalRun = () => {
    setViewingHistoricalRun(null);
    if (savedCurrentResult) {
      setResult(savedCurrentResult);
      setSavedCurrentResult(null);
      setActivePage("dashboard");
    } else {
      setResult(null);
      setActivePage("process");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url.toString());
  };

  const fetchRuns = async () => {
    try {
      const resp = await fetch(`${API_BASE}/analysis/runs?limit=200`);
      if (resp.ok) {
        const data = await resp.json();
        setRuns(data.runs || data);
      }
    } catch {}
  };

  const clearAllHistory = async () => {
    setClearingHistory(true);
    try {
      const resp = await fetch(`${API_BASE}/analysis/runs`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Failed to clear history");
      await fetchRuns();
      setCompareRunA(null);
      setCompareRunB(null);
      setComparisonDiff(null);
      if (viewingHistoricalRun) clearHistoricalRun();
    } catch (e: any) {
      setError(e.message || "Failed to clear run history");
    } finally {
      setClearingHistory(false);
      setShowClearDialog(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const params = new URLSearchParams(window.location.search);
    const runParam = params.get("run");
    if (runParam) {
      const runId = parseInt(runParam, 10);
      if (!isNaN(runId) && runId > 0) {
        loadHistoricalRun(runId);
      } else {
        setError("Invalid run link — the run ID is not valid.");
        const url = new URL(window.location.href);
        url.searchParams.delete("run");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, []);

  useEffect(() => {
    if (runs.length > 0) {
      const dup = runs.some((r) => r.reportDate === reportDate);
      setReportDateWarning(dup ? "A run with this report date already exists. Running again will create a duplicate." : "");
    }
  }, [runs, reportDate]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const runComparison = async () => {
    if (!compareRunA || !compareRunB) return;
    setComparing(true);
    setComparisonDiff(null);
    try {
      const resp = await fetch(`${API_BASE}/analysis/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runIdA: compareRunA, runIdB: compareRunB }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setComparisonDiff(data);
      }
    } catch {}
    setComparing(false);
  };

  const handleDrop = useCallback(
    (setter: (f: File) => void, e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) setter(file);
    },
    []
  );

  const handleRunPipelineClick = () => {
    if (!bookingsFile || !nationalFile) {
      setError("Please upload both files before running.");
      return;
    }
    setApiKey("");
    setShowApiKeyDialog(true);
  };

  const runAnalysis = async (key: string) => {
    if (!bookingsFile || !nationalFile) {
      setError("Please upload both files before running.");
      return;
    }
    setShowApiKeyDialog(false);
    setLoading(true);
    setError("");
    setJobLogs([]);
    setProgress(5);
    errorRef.current = false;

    const formData = new FormData();
    formData.append("booking_file", bookingsFile);
    formData.append("national_file", nationalFile);
    formData.append("cutoff_year", cutoffYear);
    formData.append("report_date", reportDate);
    if (key) {
      formData.append("pipedrive_api_key", key);
    }

    try {
      const resp = await fetch(`${API_BASE}/analysis/run`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Analysis failed");
      }

      const { jobId } = await resp.json();
      if (!jobId) throw new Error("No job ID returned from server");

      await new Promise<void>((resolve, reject) => {
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 3;
        const doPoll = async () => {
          try {
            const pollResp = await fetch(`${API_BASE}/analysis/jobs/${jobId}`);
            if (!pollResp.ok) {
              consecutiveFailures++;
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                reject(new Error("Failed to poll job status after multiple retries"));
              } else {
                pollRef.current = setTimeout(doPoll, 3000);
              }
              return;
            }
            consecutiveFailures = 0;
            const pollData = await pollResp.json();
            if (pollData.logs?.length) {
              setJobLogs(pollData.logs);
              setProgress(Math.min(10 + Math.floor(pollData.logs.length * 1.5), 90));
            }
            if (pollData.status === "done") {
              pollRef.current = null;
              setProgress(100);
              setResult(pollData.result);
              setViewingHistoricalRun(null);
              setSavedCurrentResult(null);
              setActiveTab("summary");
              setActivePage("dashboard");
              fetchRuns();
              resolve();
            } else if (pollData.status === "error") {
              pollRef.current = null;
              reject(new Error(pollData.error || "Analysis failed"));
            } else {
              pollRef.current = setTimeout(doPoll, 3000);
            }
          } catch (pollErr: any) {
            if (!errorRef.current) {
              errorRef.current = true;
              pollRef.current = null;
              reject(pollErr);
            }
          }
        };
        pollRef.current = setTimeout(doPoll, 1000);
      });
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!result?.output_file) return;
    window.open(`${API_BASE}/analysis/download?path=${encodeURIComponent(result.output_file)}`, "_blank");
  };

  const downloadNatmanBookings = () => {
    if (!result?.natman_bookings_file) return;
    window.open(`${API_BASE}/analysis/download?path=${encodeURIComponent(result.natman_bookings_file)}`, "_blank");
  };

  const downloadPDSync = () => {
    if (!result?.pdsync_file) return;
    window.open(`${API_BASE}/analysis/download?path=${encodeURIComponent(result.pdsync_file)}`, "_blank");
  };

  const dashboardRef = useRef<HTMLDivElement>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [zipExporting, setZipExporting] = useState(false);

  const generateDashboardPdfBlob = async (): Promise<Blob | null> => {
    if (!dashboardRef.current) return null;
    const html2canvas = (await import("html2canvas-pro")).default;
    const { jsPDF } = await import("jspdf");

    const el = dashboardRef.current;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#F0F2F5",
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/png");
    const imgW = canvas.width;
    const imgH = canvas.height;

    const pageW = 297;
    const pageH = 210;
    const margin = 6;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const ratio = Math.min(usableW / imgW, usableH / imgH);
    const renderW = imgW * ratio;
    const renderH = imgH * ratio;
    const offsetX = margin + (usableW - renderW) / 2;
    const offsetY = margin + (usableH - renderH) / 2;

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.addImage(imgData, "PNG", offsetX, offsetY, renderW, renderH);
    return pdf.output("blob");
  };

  const generateDashboardImageBlob = async (): Promise<Blob | null> => {
    if (!dashboardRef.current) return null;
    const html2canvas = (await import("html2canvas-pro")).default;

    const el = dashboardRef.current;
    const canvas = await html2canvas(el, {
      scale: 4,
      useCORS: true,
      backgroundColor: "#F0F2F5",
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const downloadDashboardPdf = async () => {
    setPdfExporting(true);
    try {
      const blob = await generateDashboardPdfBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Parts_Analysis_Dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setPdfExporting(false);
    }
  };

  const downloadCombinedZip = async () => {
    if (!result) return;
    setZipExporting(true);
    try {
      const imageBlob = await generateDashboardImageBlob();

      const formData = new FormData();
      if (result.output_file) formData.append("parts_analysis", result.output_file);
      if (result.pdsync_file) formData.append("pdsync", result.pdsync_file);
      if (result.natman_bookings_file) formData.append("natman_bookings", result.natman_bookings_file);
      if (imageBlob) formData.append("dashboard_image", imageBlob, "Dashboard.png");

      const resp = await fetch(`${API_BASE}/analysis/download-zip`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Zip download failed");

      const zipBlob = await resp.blob();
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Combined_Analysis_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip export failed:", err);
    } finally {
      setZipExporting(false);
    }
  };

  const diff = result?.diff || null;
  const prevSummary = useMemo(() => {
    if (!diff || !diff.previousRunId) return null;
    return runs.find(r => r.id === diff.previousRunId) || null;
  }, [diff, runs]);

  const kpiDeltas = useMemo(() => {
    if (!result || !prevSummary) return null;
    return {
      uniqueParts: result.summary.total_unique_parts - prevSummary.totalUniqueParts,
      newDeals: result.summary.new_deals_count - prevSummary.newDealsCount,
      pdInfo: result.summary.pd_info_count - prevSummary.pdInfoCount,
      pipelineValue: result.summary.total_pd_pipeline_value - prevSummary.totalPdPipelineValue,
      wonDeals: result.summary.won_deals_count - prevSummary.wonDealsCount,
      openDeals: result.summary.open_deals_count - prevSummary.openDealsCount,
    };
  }, [result, prevSummary]);

  const newDealsWithDiff = useMemo(() => {
    if (!diff) return result?.sheets.new_deals || [];
    const diffMap = new Map<string, any>();
    for (const row of diff.newDeals.rows) {
      diffMap.set(row.customerPartId, row);
    }
    const merged = (result?.sheets.new_deals || []).map((row) => {
      const d = diffMap.get(row.customer_part_id);
      return d ? { ...row, changeType: d.changeType, changes: d.changes } : { ...row, changeType: "UNCHANGED" };
    });
    for (const row of diff.newDeals.rows) {
      if (row.changeType === "REMOVED") {
        merged.push({
          customer_part_id: row.customerPartId,
          name: row.name || "",
          mapped_status: row.mappedStatus || "",
          mapped_probability: row.mappedProbability || "",
          mapped_med_rev: row.mappedMedRev || 0,
          mapped_pd_p2_time: row.mappedPdP2Time || "",
          first_order_date: row.firstOrderDate || "",
          calc_label: row.calcLabel || "",
          changeType: "REMOVED",
        });
      }
    }
    return merged;
  }, [result, diff]);

  const pdInfoWithDiff = useMemo(() => {
    if (!diff) return result?.sheets.pd_info || [];
    const diffMap = new Map<string, any>();
    for (const row of diff.pdInfo.rows) {
      diffMap.set(row.customerPartId, row);
    }
    const merged = (result?.sheets.pd_info || []).map((row) => {
      const d = diffMap.get(row.customer_part_id);
      return d ? { ...row, changeType: d.changeType, changes: d.changes } : { ...row, changeType: "UNCHANGED" };
    });
    for (const row of diff.pdInfo.rows) {
      if (row.changeType === "REMOVED") {
        merged.push({
          customer_part_id: row.customerPartId,
          pd_id: row.pdId || "",
          title: row.pdTitle || "",
          value: row.pdValue || 0,
          status: row.pdStatus || "",
          org_name: row.pdOrgName || row.name || "",
          stage_id: row.pdStage || "",
          label: row.pdLabel || "",
          platform_company: row.pdPlatform || "",
          deal_type: row.pdDealType || "",
          mfg_type: row.pdMfgType || "",
          industry: row.pdIndustry || "",
          changeType: "REMOVED",
        });
      }
    }
    return merged;
  }, [result, diff]);

  const changedRows = useMemo(() => {
    if (!diff) return [];
    const ndChanged = newDealsWithDiff
      .filter((r) => r.changeType && r.changeType !== "UNCHANGED")
      .map((r) => ({
        changeType: r.changeType,
        _source: "New Deals",
        customer_part_id: r.customer_part_id,
        _customer: r.name,
        _status: r.mapped_status,
        _revenue: r.mapped_med_rev,
        _label: r.calc_label,
      }));
    const piChanged = pdInfoWithDiff
      .filter((r) => r.changeType && r.changeType !== "UNCHANGED")
      .map((r) => ({
        changeType: r.changeType,
        _source: "PD Info",
        customer_part_id: r.customer_part_id,
        _customer: r.org_name,
        _status: r.status,
        _revenue: r.value,
        _label: r.label,
      }));
    return [...ndChanged, ...piChanged];
  }, [newDealsWithDiff, pdInfoWithDiff, diff]);

  const navItems = [
    { id: "dashboard" as NavPage, label: "Dashboard", icon: LayoutDashboard, disabled: !result },
    { id: "process" as NavPage, label: "Process Files", icon: FolderInput },
    { id: "results" as NavPage, label: "Results & Export", icon: FileOutput, disabled: !result },
    { id: "source_national" as NavPage, label: "National PDSync", icon: FileSpreadsheet, disabled: !result },
    { id: "source_bookings" as NavPage, label: "Natman Bookings", icon: FileSpreadsheet, disabled: !result },
    { id: "history" as NavPage, label: "Run History", icon: History },
    { id: "settings" as NavPage, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-[#F0F2F5]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-56 bg-[#1B2A4A] text-white flex flex-col shrink-0 transition-transform duration-200`}>
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">National Pipeline</p>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">Manager</p>
            </div>
          </div>
          <button className="md:hidden text-white/60 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { if (!item.disabled) { setActivePage(item.id); setSidebarOpen(false); } }}
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

      <main className="flex-1 overflow-auto w-full">
        <div className="md:hidden bg-[#1B2A4A] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-1">
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold">National Pipeline Manager</p>
          <div className="w-7" />
        </div>
        {viewingHistoricalRun && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm font-medium text-amber-800 truncate">
                Run #{viewingHistoricalRun.id} — {viewingHistoricalRun.reportDate || new Date(viewingHistoricalRun.createdAt).toLocaleDateString()}
              </span>
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] shrink-0 hidden sm:inline-flex">Historical</Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyRunLink(viewingHistoricalRun.id)}
                className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                {copyLinkFeedbackId === viewingHistoricalRun.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {copyLinkFeedbackId === viewingHistoricalRun.id ? (copyLinkFailed ? "Failed" : "Copied!") : "Copy Link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistoricalRun}
                className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to current
              </Button>
            </div>
          </div>
        )}

        {activePage === "process" && (
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">
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
                    <p className="text-sm font-medium text-[#1B2A4A] mb-1.5">Report Date</p>
                    <Input
                      type="date"
                      value={reportDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setReportDate(val);
                        const dup = runs.some((r) => r.reportDate === val);
                        setReportDateWarning(dup ? "A run with this report date already exists. Running again will create a duplicate." : "");
                      }}
                      className="w-44"
                    />
                  </div>
                  <div className="mt-5">
                    <p className="text-xs text-muted-foreground">Date this data represents (defaults to today). Used for labeling and ordering runs.</p>
                    {reportDateWarning && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {reportDateWarning}
                      </p>
                    )}
                  </div>
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
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {progress < 100 ? "Processing..." : "Complete!"}
                </p>
                {jobLogs.length > 0 && (
                  <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 max-h-36 overflow-y-auto font-mono text-[10px] text-gray-600 leading-relaxed">
                    {jobLogs.map((line, i) => (
                      <div key={i} className={line.startsWith("[stderr]") ? "text-amber-600" : ""}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleRunPipelineClick}
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

            {showApiKeyDialog && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <Card className="w-full max-w-md shadow-xl border-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-[#1B2A4A] flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Pipedrive API Key
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Enter your Pipedrive API key to fetch live deal data. Leave blank to use cached data only.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      type="password"
                      placeholder="Enter API key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runAnalysis(apiKey)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setShowApiKeyDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => runAnalysis(apiKey)}
                        className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]"
                      >
                        <Play className="h-4 w-4" />
                        Run
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {activePage === "dashboard" && result && (
          <div ref={dashboardRef} className="px-4 md:px-8 py-6 md:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[#1B2A4A]">Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.elapsed_seconds ? `Analysis completed in ${result.elapsed_seconds}s` : "Historical run data"}
                  {result.run_id && <span className="ml-2 text-[#1B2A4A] font-medium">(Run #{result.run_id})</span>}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {result.output_file && (
                  <Button onClick={downloadExcel} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Parts Analysis</span>
                    <span className="sm:hidden">Parts</span>
                  </Button>
                )}
                {result.natman_bookings_file && (
                  <Button onClick={downloadNatmanBookings} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Natman Bookings</span>
                    <span className="sm:hidden">Natman</span>
                  </Button>
                )}
                {result.pdsync_file && (
                  <Button onClick={downloadPDSync} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">National PDSync</span>
                    <span className="sm:hidden">PDSync</span>
                  </Button>
                )}
                {!viewingHistoricalRun && (
                  <>
                    <Button onClick={downloadDashboardPdf} disabled={pdfExporting} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                      {pdfExporting ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="hidden sm:inline">{pdfExporting ? "Exporting..." : "Download PDF"}</span>
                      <span className="sm:hidden">{pdfExporting ? "..." : "PDF"}</span>
                    </Button>
                    <Button onClick={downloadCombinedZip} disabled={zipExporting} size="sm" className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
                      {zipExporting ? <Spinner className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      <span className="hidden sm:inline">{zipExporting ? "Building Zip..." : "Download All (Zip)"}</span>
                      <span className="sm:hidden">{zipExporting ? "..." : "Zip"}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {diff && <DiffSummaryCard diff={diff} />}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <KpiCard title="Unique Parts" value={formatNumber(result.summary.total_unique_parts)} icon={Package} delta={kpiDeltas?.uniqueParts} />
              <KpiCard title="New Deals" value={formatNumber(result.summary.new_deals_count)} icon={Target} subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_new)}`} delta={kpiDeltas?.newDeals} />
              <KpiCard title="PD Deals" value={formatNumber(result.summary.pd_info_count)} icon={BarChart3} subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_pd)}`} delta={kpiDeltas?.pdInfo} />
              <KpiCard title="Pipeline Value" value={formatCurrency(result.summary.total_pd_pipeline_value)} icon={DollarSign} trend="up" delta={kpiDeltas?.pipelineValue} deltaCurrency />
              <KpiCard title="Won Deals" value={formatNumber(result.summary.won_deals_count)} icon={CheckCircle2} subtitle={formatCurrency(result.summary.won_deals_value)} trend="up" delta={kpiDeltas?.wonDeals} />
              <KpiCard title="Open Pipeline" value={formatNumber(result.summary.open_deals_count)} icon={Users} subtitle={formatCurrency(result.summary.open_deals_value)} delta={kpiDeltas?.openDeals} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Deal Classification (New Deals)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dictToChartData(result.analytics.calc_label_distribution)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${truncateLabel(name, 14)} (${(percent * 100).toFixed(0)}%)`}>
                        {dictToChartData(result.analytics.calc_label_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Pipeline Status (PD Deals)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dictToChartData(result.analytics.pd_status_distribution)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${truncateLabel(name, 14)} (${(percent * 100).toFixed(0)}%)`}>
                        {dictToChartData(result.analytics.pd_status_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Revenue by Platform</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dictToChartData(result.analytics.platform_revenue, "name", "value")} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                      <YAxis type="category" dataKey="name" width={80} tickFormatter={(v) => truncateLabel(v, 12)} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Deals by Platform</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dictToChartData(result.analytics.platform_distribution, "name", "value")} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={80} tickFormatter={(v) => truncateLabel(v, 12)} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm overflow-hidden md:col-span-2">
                <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Top 15 Customers by Pipeline Value</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={result.analytics.top_customers_pd} margin={{ top: 5, right: 20, bottom: 60, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 11 }} tickFormatter={(v) => truncateLabel(v)} />
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
          <div className="px-4 md:px-8 py-6 md:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[#1B2A4A]">Results & Export</h1>
                <p className="text-sm text-muted-foreground mt-1">Browse and export analysis results</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {result.natman_bookings_file && (
                  <Button onClick={downloadNatmanBookings} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Natman Bookings</span>
                    <span className="sm:hidden">Natman</span>
                  </Button>
                )}
                {result.pdsync_file && (
                  <Button onClick={downloadPDSync} variant="outline" size="sm" className="gap-2 border-[#1B2A4A]/30 text-[#1B2A4A]">
                    <Download className="h-4 w-4" />
                    PDSync
                  </Button>
                )}
                {!viewingHistoricalRun && (
                  <Button onClick={downloadCombinedZip} disabled={zipExporting} size="sm" className="gap-2 bg-[#1B2A4A] hover:bg-[#243659]">
                    {zipExporting ? <Spinner className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    <span className="hidden sm:inline">{zipExporting ? "Building Zip..." : "Download All (Zip)"}</span>
                    <span className="sm:hidden">{zipExporting ? "..." : "Zip"}</span>
                  </Button>
                )}
              </div>
            </div>

            {diff && <DiffSummaryCard diff={diff} />}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="summary">Charts</TabsTrigger>
                <TabsTrigger value="all_parts">All Parts ({formatNumber(result.sheets.all_unique_parts.length)})</TabsTrigger>
                <TabsTrigger value="new_deals">
                  New Deals ({formatNumber(newDealsWithDiff.length)})
                  {diff && diff.newDeals.summary.added + diff.newDeals.summary.changed + diff.newDeals.summary.removed > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                      {diff.newDeals.summary.added + diff.newDeals.summary.changed + diff.newDeals.summary.removed} changes
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pd_info">
                  PD Info ({formatNumber(pdInfoWithDiff.length)})
                  {diff && diff.pdInfo.summary.added + diff.pdInfo.summary.changed + diff.pdInfo.summary.removed > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                      {diff.pdInfo.summary.added + diff.pdInfo.summary.changed + diff.pdInfo.summary.removed} changes
                    </span>
                  )}
                </TabsTrigger>
                {changedRows.length > 0 && (
                  <TabsTrigger value="changes">
                    Changes
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                      {changedRows.length}
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="summary" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm overflow-hidden">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Pipeline Status</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={dictToChartData(result.analytics.pd_status_distribution)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${truncateLabel(name, 14)} (${(percent * 100).toFixed(0)}%)`}>
                            {dictToChartData(result.analytics.pd_status_distribution).map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatNumber(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm overflow-hidden">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Deal Labels</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={dictToChartData(result.analytics.label_distribution, "name", "value")} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={120} tickFormatter={(v) => truncateLabel(v, 16)} />
                          <Tooltip />
                          <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm overflow-hidden md:col-span-2">
                    <CardHeader><CardTitle className="text-sm text-[#1B2A4A]">Top 15 New Deals by Revenue</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={result.analytics.top_customers_new} margin={{ top: 5, right: 20, bottom: 60, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 11 }} tickFormatter={(v) => truncateLabel(v)} />
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
                    <DiffDataTable
                      data={newDealsWithDiff}
                      showDiff={!!diff}
                      tableLabel="New_Deals"
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
                    <DiffDataTable
                      data={pdInfoWithDiff}
                      showDiff={!!diff}
                      tableLabel="PD_Info"
                      columns={[
                        { key: "pd_id", label: "PD ID" },
                        { key: "customer_part_id", label: "Part ID" },
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

              {changedRows.length > 0 && (
                <TabsContent value="changes">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-6">
                      <DiffDataTable
                        data={changedRows}
                        showDiff={true}
                        tableLabel="Changes"
                        columns={[
                          { key: "_source", label: "Source" },
                          { key: "customer_part_id", label: "Part ID" },
                          { key: "_customer", label: "Customer" },
                          { key: "_status", label: "Status" },
                          { key: "_revenue", label: "Revenue / Value", format: (v) => formatCurrency(v || 0) },
                          { key: "_label", label: "Label" },
                        ]}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}

        {activePage === "history" && (
          <div className="px-4 md:px-8 py-6 md:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-[#1B2A4A]">Run History</h1>
                <p className="text-sm text-muted-foreground mt-1">View past runs and compare any two uploads</p>
              </div>
              {runs.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearDialog(true)}
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All History
                </Button>
              )}
            </div>

            <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all run history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {runs.length} past run{runs.length !== 1 ? "s" : ""} and their data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={clearingHistory}>Cancel</AlertDialogCancel>
                  <Button
                    onClick={clearAllHistory}
                    disabled={clearingHistory}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  >
                    {clearingHistory ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        Clearing...
                      </>
                    ) : (
                      "Clear All"
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Card className="border-0 shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-sm text-[#1B2A4A] flex items-center gap-2">
                  <GitCompare className="h-4 w-4" />
                  Compare Two Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Older Run (Base)</p>
                    <select
                      value={compareRunA || ""}
                      onChange={(e) => setCompareRunA(e.target.value ? Number(e.target.value) : null)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select run...</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          Run #{r.id} — {r.reportDate || new Date(r.createdAt).toLocaleDateString()} ({r.newDealsCount} new, {r.pdInfoCount} PD)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Newer Run (Compare)</p>
                    <select
                      value={compareRunB || ""}
                      onChange={(e) => setCompareRunB(e.target.value ? Number(e.target.value) : null)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select run...</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          Run #{r.id} — {r.reportDate || new Date(r.createdAt).toLocaleDateString()} ({r.newDealsCount} new, {r.pdInfoCount} PD)
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={runComparison}
                    disabled={!compareRunA || !compareRunB || compareRunA === compareRunB || comparing}
                    className="gap-2 bg-[#1B2A4A] hover:bg-[#243659] w-full sm:w-auto"
                  >
                    {comparing ? <Spinner className="h-4 w-4" /> : <GitCompare className="h-4 w-4" />}
                    {comparing ? "Comparing..." : "Compare"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {comparisonDiff && (
              <div className="mb-6">
                <DiffSummaryCard diff={comparisonDiff} />
                <Tabs defaultValue="comp_new_deals">
                  <TabsList className="mb-4">
                    <TabsTrigger value="comp_new_deals">
                      New Deals Diff
                      {comparisonDiff.newDeals.summary.added + comparisonDiff.newDeals.summary.changed + comparisonDiff.newDeals.summary.removed > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                          {comparisonDiff.newDeals.summary.added + comparisonDiff.newDeals.summary.changed + comparisonDiff.newDeals.summary.removed}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="comp_pd_info">
                      PD Info Diff
                      {comparisonDiff.pdInfo.summary.added + comparisonDiff.pdInfo.summary.changed + comparisonDiff.pdInfo.summary.removed > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                          {comparisonDiff.pdInfo.summary.added + comparisonDiff.pdInfo.summary.changed + comparisonDiff.pdInfo.summary.removed}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="comp_new_deals">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="pt-6">
                        <DiffDataTable
                          data={comparisonDiff.newDeals.rows.map((r: any) => ({
                            customer_part_id: r.customerPartId,
                            name: r.name || "",
                            mapped_status: r.mappedStatus || "",
                            mapped_probability: r.mappedProbability || "",
                            mapped_med_rev: r.mappedMedRev || 0,
                            mapped_pd_p2_time: r.mappedPdP2Time || "",
                            first_order_date: r.firstOrderDate || "",
                            calc_label: r.calcLabel || "",
                            changeType: r.changeType,
                            changes: r.changes,
                          }))}
                          showDiff
                          columns={[
                            { key: "name", label: "Customer" },
                            { key: "customer_part_id", label: "Part ID" },
                            { key: "mapped_status", label: "Status" },
                            { key: "mapped_probability", label: "Probability" },
                            { key: "mapped_med_rev", label: "Revenue", format: (v) => formatCurrency(v || 0) },
                            { key: "calc_label", label: "Label" },
                          ]}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="comp_pd_info">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="pt-6">
                        <DiffDataTable
                          data={comparisonDiff.pdInfo.rows.map((r: any) => ({
                            pd_id: r.pdId || "",
                            customer_part_id: r.customerPartId,
                            value: r.pdValue || 0,
                            status: r.pdStatus || "",
                            name: r.pdOrgName || r.name || "",
                            stage: r.pdStage || "",
                            label: r.pdLabel || "",
                            platform: r.pdPlatform || "",
                            changeType: r.changeType,
                            changes: r.changes,
                          }))}
                          showDiff
                          columns={[
                            { key: "pd_id", label: "PD ID" },
                            { key: "customer_part_id", label: "Part ID" },
                            { key: "value", label: "Value", format: (v) => formatCurrency(v || 0) },
                            { key: "status", label: "Status" },
                            { key: "name", label: "Customer" },
                            { key: "stage", label: "Stage" },
                            { key: "label", label: "Label" },
                          ]}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-[#1B2A4A]">Past Runs</CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No runs yet. Process your first files to get started.</p>
                ) : (
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <div key={run.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors gap-3">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="h-8 w-8 rounded-full bg-[#1B2A4A]/10 flex items-center justify-center text-xs font-bold text-[#1B2A4A] shrink-0">
                            #{run.id}
                          </div>
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {run.reportDate || new Date(run.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Cutoff: {run.cutoffYear || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6 text-xs flex-wrap">
                          <div className="text-center">
                            <p className="font-semibold text-[#1B2A4A]">{formatNumber(run.totalUniqueParts)}</p>
                            <p className="text-muted-foreground">Parts</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-[#1B2A4A]">{formatNumber(run.newDealsCount)}</p>
                            <p className="text-muted-foreground">New Deals</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-[#1B2A4A]">{formatNumber(run.pdInfoCount)}</p>
                            <p className="text-muted-foreground">PD Info</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <p className="font-semibold text-[#1B2A4A]">{formatCurrency(run.totalPdPipelineValue)}</p>
                            <p className="text-muted-foreground">Pipeline</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 ml-2"
                            onClick={() => copyRunLink(run.id)}
                            title="Copy shareable link"
                          >
                            {copyLinkFeedbackId === run.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            {copyLinkFeedbackId === run.id ? (copyLinkFailed ? "Failed" : "Copied!") : "Share"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => loadHistoricalRun(run.id)}
                            disabled={loadingRunId === run.id || run.hasResultJson === false}
                            title={run.hasResultJson === false ? "Full data not available for this run" : "Load this run's full dashboard"}
                          >
                            {loadingRunId === run.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                            {loadingRunId === run.id ? "Loading..." : "Load"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activePage === "source_national" && result && !result.source_data && (
          <div className="px-4 md:px-8 py-16 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-1">Source Data Not Available</h2>
            <p className="text-sm text-muted-foreground">Source data was not stored for this historical run.</p>
          </div>
        )}

        {activePage === "source_national" && result && result.source_data && (() => {
          const sheets = result.source_data.national_sheets;
          const sheetNames = Object.keys(sheets);
          const defaultSheet = sheetNames[0] || "";
          return (
            <SourceDataView
              title="National PDSync"
              subtitle="Generated PDSync / PD Upload Preview output"
              sheets={sheets}
              sheetNames={sheetNames}
              defaultSheet={defaultSheet}
              downloadAction={viewingHistoricalRun ? undefined : downloadPDSync}
              downloadLabel="Download PDSync"
            />
          );
        })()}

        {activePage === "source_bookings" && result && !result.source_data && (
          <div className="px-4 md:px-8 py-16 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-1">Source Data Not Available</h2>
            <p className="text-sm text-muted-foreground">Source data was not stored for this historical run.</p>
          </div>
        )}

        {activePage === "source_bookings" && result && result.source_data && (() => {
          const sheets = result.source_data.bookings_sheets;
          const sheetNames = Object.keys(sheets);
          const defaultSheet = sheetNames[0] || "";
          return (
            <SourceDataView
              title="Natman Bookings"
              subtitle="Generated Natman Bookings output (MAIN, UNIQUE, TOTALS, LANDMARK)"
              sheets={sheets}
              sheetNames={sheetNames}
              defaultSheet={defaultSheet}
              downloadAction={viewingHistoricalRun ? undefined : downloadNatmanBookings}
              downloadLabel="Download Natman Bookings"
            />
          );
        })()}

        {activePage === "settings" && (
          <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8">
            <div className="mb-8">
              <h1 className="text-xl md:text-2xl font-bold text-[#1B2A4A]">Settings</h1>
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
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
