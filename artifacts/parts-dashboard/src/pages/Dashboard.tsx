import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

const BASE = import.meta.env.BASE_URL;
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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-500" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
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
                <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-t hover:bg-muted/30">
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
        <div className="flex items-center justify-between mt-2">
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

export default function Dashboard() {
  const [bookingsFile, setBookingsFile] = useState<File | null>(null);
  const [nationalFile, setNationalFile] = useState<File | null>(null);
  const [cutoffYear, setCutoffYear] = useState("2021");
  const [faiThreshold, setFaiThreshold] = useState("0.50");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [dragOver1, setDragOver1] = useState(false);
  const [dragOver2, setDragOver2] = useState(false);

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
      setError("Please upload both files before running the analysis.");
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

      const data: AnalysisResult = await resp.json();
      setResult(data);
      setProgress(100);
      setActiveTab("summary");
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Parts Analysis Dashboard</h1>
              <p className="text-xs text-muted-foreground">Repeat vs. New Business Analysis</p>
            </div>
          </div>
          {result && (
            <Button onClick={downloadExcel} className="gap-2">
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Input Files & Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  dragOver1 ? "border-primary bg-primary/5" : bookingsFile ? "border-green-400 bg-green-50" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver1(true); }}
                onDragLeave={() => setDragOver1(false)}
                onDrop={(e) => { setDragOver1(false); handleDrop(setBookingsFile, e); }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".zip";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setBookingsFile(file);
                  };
                  input.click();
                }}
              >
                {bookingsFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <p className="text-sm font-medium truncate max-w-full">{bookingsFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(bookingsFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Natman Bookings</p>
                    <p className="text-xs text-muted-foreground">Drag & drop .zip</p>
                  </div>
                )}
              </div>

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  dragOver2 ? "border-primary bg-primary/5" : nationalFile ? "border-green-400 bg-green-50" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver2(true); }}
                onDragLeave={() => setDragOver2(false)}
                onDrop={(e) => { setDragOver2(false); handleDrop(setNationalFile, e); }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".zip";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setNationalFile(file);
                  };
                  input.click();
                }}
              >
                {nationalFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <p className="text-sm font-medium truncate max-w-full">{nationalFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(nationalFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Python National</p>
                    <p className="text-xs text-muted-foreground">Drag & drop .zip</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Quote Cutoff Year</Label>
                  <Input
                    type="number"
                    value={cutoffYear}
                    onChange={(e) => setCutoffYear(e.target.value)}
                    min="2015"
                    max="2030"
                  />
                </div>
                <div>
                  <Label className="text-xs">FAI Threshold</Label>
                  <Input
                    type="number"
                    value={faiThreshold}
                    onChange={(e) => setFaiThreshold(e.target.value)}
                    step="0.05"
                    min="0"
                    max="1"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <Button
                  onClick={runAnalysis}
                  disabled={loading || !bookingsFile || !nationalFile}
                  className="w-full gap-2 h-12"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Running Analysis...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      Run Analysis
                    </>
                  )}
                </Button>
                {loading && (
                  <div className="mt-3">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1 text-center">{progress}% complete</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                title="Unique Parts"
                value={formatNumber(result.summary.total_unique_parts)}
                icon={Package}
              />
              <KpiCard
                title="New Deals"
                value={formatNumber(result.summary.new_deals_count)}
                icon={Target}
                subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_new)}`}
              />
              <KpiCard
                title="PD Deals"
                value={formatNumber(result.summary.pd_info_count)}
                icon={BarChart3}
                subtitle={`Avg ${formatCurrency(result.summary.avg_deal_value_pd)}`}
              />
              <KpiCard
                title="Pipeline Value"
                value={formatCurrency(result.summary.total_pd_pipeline_value)}
                icon={DollarSign}
                trend="up"
              />
              <KpiCard
                title="Won Deals"
                value={formatNumber(result.summary.won_deals_count)}
                icon={CheckCircle2}
                subtitle={formatCurrency(result.summary.won_deals_value)}
                trend="up"
              />
              <KpiCard
                title="Open Pipeline"
                value={formatNumber(result.summary.open_deals_count)}
                icon={Users}
                subtitle={formatCurrency(result.summary.open_deals_value)}
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="summary">Sales Analytics</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
                <TabsTrigger value="all_parts">All Parts ({formatNumber(result.sheets.all_unique_parts.length)})</TabsTrigger>
                <TabsTrigger value="new_deals">New Deals ({formatNumber(result.sheets.new_deals.length)})</TabsTrigger>
                <TabsTrigger value="pd_info">PD Info ({formatNumber(result.sheets.pd_info.length)})</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Deal Classification (New Deals)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={dictToChartData(result.analytics.calc_label_distribution)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={4}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {dictToChartData(result.analytics.calc_label_distribution).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatNumber(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Pipeline Status (PD Deals)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={dictToChartData(result.analytics.pd_status_distribution)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={4}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {dictToChartData(result.analytics.pd_status_distribution).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatNumber(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Revenue by Platform</CardTitle>
                    </CardHeader>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Deals by Platform</CardTitle>
                    </CardHeader>
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

                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm">Top 15 Customers by Pipeline Value (PD Deals)</CardTitle>
                    </CardHeader>
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

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Analysis Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="space-y-2">
                        <p className="font-medium text-muted-foreground">Data Coverage</p>
                        <p>LANDMARK parts: <span className="font-semibold">{formatNumber(result.summary.landmark_parts_count)}</span></p>
                        <p>PD Cache entries: <span className="font-semibold">{formatNumber(result.summary.pd_cache_entries)}</span></p>
                        <p>Total unique parts: <span className="font-semibold">{formatNumber(result.summary.total_unique_parts)}</span></p>
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-muted-foreground">New Deals Breakdown</p>
                        {Object.entries(result.analytics.calc_label_distribution).map(([k, v]) => (
                          <p key={k}>{k}: <span className="font-semibold">{formatNumber(v)}</span></p>
                        ))}
                        <p>Total Revenue: <span className="font-semibold">{formatCurrency(result.summary.total_new_deals_revenue)}</span></p>
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-muted-foreground">Deal Types</p>
                        {Object.entries(result.analytics.deal_type_distribution).map(([k, v]) => (
                          <p key={k}>{k}: <span className="font-semibold">{formatNumber(v)}</span></p>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-muted-foreground">Industry Mix</p>
                        {Object.entries(result.analytics.industry_distribution).map(([k, v]) => (
                          <p key={k}>{k}: <span className="font-semibold">{formatNumber(v)}</span></p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="charts" className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Label Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={dictToChartData(result.analytics.label_distribution)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                          >
                            {dictToChartData(result.analytics.label_distribution).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Pipeline Stage Distribution</CardTitle>
                    </CardHeader>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Industry Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={dictToChartData(result.analytics.industry_distribution)}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {dictToChartData(result.analytics.industry_distribution).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">New Deals Status Distribution</CardTitle>
                    </CardHeader>
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

                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm">Top 15 New Deal Customers by Revenue</CardTitle>
                    </CardHeader>
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

              <TabsContent value="all_parts" className="mt-4">
                <Card>
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

              <TabsContent value="new_deals" className="mt-4">
                <Card>
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

              <TabsContent value="pd_info" className="mt-4">
                <Card>
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

            <div className="text-center text-xs text-muted-foreground pb-4">
              Analysis completed in {result.elapsed_seconds}s
            </div>
          </>
        )}
      </main>
    </div>
  );
}
