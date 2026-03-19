import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  Download,
  DollarSign,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/redesign/app/components/ui/card";
import { Input } from "@/redesign/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table";
import { cn } from "@/redesign/app/components/ui/utils";
import { createCompanyMetrics, formatCurrency, formatNumber, getCompanyMetrics } from "@/redesign/app/lib/company-metrics-data";
import { useFirestoreDocument } from "@/redesign/app/hooks/use-firestore";
import { isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import { firestoreService } from "@/redesign/app/lib/firestore-service";
import { MonthlyMetrics, User } from "@/redesign/app/lib/types";

interface CompanyMetricsPageProps {
  currentUser: User;
  companyId?: string | null;
}

type MetricFormat = "number" | "currency";
type ChartVariant = "line" | "bar" | "area";
type BaseMetricKey =
  | "revenue"
  | "employees"
  | "customers"
  | "patents"
  | "certifications"
  | "monthlyActiveUsers";

type CustomMetricField = {
  key: string;
  label: string;
  format: MetricFormat;
};

type MetricField = CustomMetricField & {
  source: "base" | "custom";
  tone: string;
};

type MetricsPageState = {
  year: number;
  data: MonthlyMetrics[];
  customFields: CustomMetricField[];
};

type PersistedMetricsDocument = MetricsPageState & {
  companyId: string;
  companyName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const DEFAULT_SELECTED_METRIC_KEY: BaseMetricKey = "revenue";
const CHART_VARIANT_OPTIONS: Array<{ key: ChartVariant; label: string }> = [
  { key: "line", label: "선형" },
  { key: "bar", label: "막대" },
  { key: "area", label: "영역" },
];

const BASE_METRIC_FIELDS: MetricField[] = [
  { key: "revenue", label: "매출", format: "currency", source: "base", tone: "bg-emerald-500" },
  { key: "employees", label: "팀원 수", format: "number", source: "base", tone: "bg-blue-500" },
  { key: "customers", label: "고객 수", format: "number", source: "base", tone: "bg-violet-500" },
  { key: "patents", label: "특허", format: "number", source: "base", tone: "bg-amber-500" },
  { key: "certifications", label: "인증", format: "number", source: "base", tone: "bg-slate-500" },
  { key: "monthlyActiveUsers", label: "MAU", format: "number", source: "base", tone: "bg-cyan-500" },
];

function createEmptyMonth(year: number, month: number): MonthlyMetrics {
  return {
    month,
    year,
    revenue: 0,
    employees: 0,
    patents: 0,
    certifications: 0,
    customers: 0,
    monthlyActiveUsers: 0,
    otherMetrics: {},
  };
}

function normalizeMonthlyData(data: MonthlyMetrics[], year: number): MonthlyMetrics[] {
  const dataByMonth = new Map(data.map((item) => [item.month, item]));

  return MONTHS.map((month) => {
    const existing = dataByMonth.get(month);
    if (!existing) {
      return createEmptyMonth(year, month);
    }

    return {
      ...createEmptyMonth(year, month),
      ...existing,
      month,
      year,
      monthlyActiveUsers: existing.monthlyActiveUsers ?? 0,
      otherMetrics: { ...(existing.otherMetrics ?? {}) },
    };
  });
}

function inferCustomFields(data: MonthlyMetrics[]): CustomMetricField[] {
  const keys = new Set<string>();
  data.forEach((item) => {
    Object.keys(item.otherMetrics ?? {}).forEach((key) => keys.add(key));
  });

  return Array.from(keys).map((key) => ({
    key,
    label: key,
    format: "number" as const,
  }));
}

function normalizeCustomFields(
  value: unknown,
  fallback: CustomMetricField[],
): CustomMetricField[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const customFields = value
    .filter(
      (field): field is CustomMetricField =>
        typeof field?.key === "string" &&
        typeof field?.label === "string" &&
        (field?.format === "number" || field?.format === "currency"),
    )
    .map((field) => ({
      key: field.key,
      label: field.label.trim() || field.key,
      format: field.format,
    }));

  return customFields.length > 0 ? customFields : fallback;
}

function createSeedState(companyName: string): MetricsPageState {
  const seed = getCompanyMetrics(companyName) ?? createCompanyMetrics(companyName);

  return {
    year: seed.year,
    data: normalizeMonthlyData(seed.data, seed.year),
    customFields: inferCustomFields(seed.data),
  };
}

function normalizeMetricsState(
  source: Partial<MetricsPageState> | null | undefined,
  companyName: string,
): MetricsPageState {
  const fallback = createSeedState(companyName);

  if (!source) {
    return fallback;
  }

  const year = typeof source.year === "number" ? source.year : fallback.year;
  const data = Array.isArray(source.data)
    ? normalizeMonthlyData(source.data as MonthlyMetrics[], year).map((monthData) => ({
        ...monthData,
        otherMetrics: { ...(monthData.otherMetrics ?? {}) },
      }))
    : fallback.data;
  const inferredCustomFields = inferCustomFields(data);
  const customFields = normalizeCustomFields(source.customFields, inferredCustomFields);

  return {
    year,
    data,
    customFields,
  };
}

function getLatestFilledMonth(data: MonthlyMetrics[]): number {
  const filledMonth = [...data]
    .reverse()
    .find((item) => {
      const baseValues = [
        item.revenue,
        item.employees,
        item.customers,
        item.patents,
        item.certifications,
        item.monthlyActiveUsers ?? 0,
      ];
      const customValues = Object.values(item.otherMetrics ?? {});

      return [...baseValues, ...customValues].some((value) => value > 0);
    });

  return filledMonth?.month ?? 1;
}

function getComparisonMonth(year: number, data: MonthlyMetrics[]): number {
  const today = new Date();
  if (today.getFullYear() === year) {
    return today.getMonth() + 1;
  }

  return getLatestFilledMonth(data);
}

function getMetricValue(item: MonthlyMetrics, key: string): number {
  switch (key as BaseMetricKey) {
    case "revenue":
      return item.revenue;
    case "employees":
      return item.employees;
    case "customers":
      return item.customers;
    case "patents":
      return item.patents;
    case "certifications":
      return item.certifications;
    case "monthlyActiveUsers":
      return item.monthlyActiveUsers ?? 0;
    default:
      return item.otherMetrics?.[key] ?? 0;
  }
}

function setMetricValue(item: MonthlyMetrics, key: string, nextValue: number): MonthlyMetrics {
  const value = Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0;

  switch (key as BaseMetricKey) {
    case "revenue":
      return { ...item, revenue: value };
    case "employees":
      return { ...item, employees: value };
    case "customers":
      return { ...item, customers: value };
    case "patents":
      return { ...item, patents: value };
    case "certifications":
      return { ...item, certifications: value };
    case "monthlyActiveUsers":
      return { ...item, monthlyActiveUsers: value };
    default:
      return {
        ...item,
        otherMetrics: {
          ...(item.otherMetrics ?? {}),
          [key]: value,
        },
      };
  }
}

function formatMetricValue(value: number, format: MetricFormat): string {
  return format === "currency" ? formatCurrency(value) : formatNumber(value);
}

function formatAxisValue(value: number, format: MetricFormat): string {
  if (format === "currency") {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(value % 100000000 === 0 ? 0 : 1)}억`;
    }
    if (value >= 10000) {
      return `${Math.round(value / 10000)}만`;
    }
  }

  return new Intl.NumberFormat("ko-KR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function getMonthDelta(currentValue: number, previousValue?: number): string {
  if (previousValue === undefined) {
    return "비교 데이터 없음";
  }

  const difference = currentValue - previousValue;
  if (difference === 0) {
    return "전월과 동일";
  }

  return `${difference > 0 ? "+" : ""}${formatNumber(difference)} 변화`;
}

function getMetricFieldByKey(fields: MetricField[], key: string, fallbackIndex = 0): MetricField {
  return fields.find((field) => field.key === key) ?? BASE_METRIC_FIELDS[fallbackIndex]!;
}

function normalizeDateLabel(value: unknown): string | null {
  if (!value) {
    return null;
  }

  let parsedDate: Date | null = null;

  if (value instanceof Date) {
    parsedDate = value;
  } else if (typeof value === "string" || typeof value === "number") {
    const candidate = new Date(value);
    parsedDate = Number.isNaN(candidate.getTime()) ? null : candidate;
  } else if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        parsedDate = maybeTimestamp.toDate();
      } catch {
        parsedDate = null;
      }
    }
  }

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createMetricsCsv(metricsState: MetricsPageState, metricFields: MetricField[]): string {
  const escapeCell = (value: string | number) => {
    const source = String(value ?? "");
    if (/[",\n]/.test(source)) {
      return `"${source.replace(/"/g, "\"\"")}"`;
    }
    return source;
  };

  const headers = ["월", ...metricFields.map((field) => field.label)];
  const rows = metricsState.data.map((monthData) => [
    `${monthData.month}월`,
    ...metricFields.map((field) => getMetricValue(monthData, field.key)),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCell(cell)).join(","))
    .join("\n");
}

function MetricTooltip({
  active,
  payload,
  label,
  format,
  metricLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: MetricFormat;
  metricLabel: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = typeof payload[0]?.value === "number" ? payload[0].value : 0;

  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-sm">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {metricLabel} <span className="font-semibold text-foreground">{formatMetricValue(value, format)}</span>
      </p>
    </div>
  );
}

export function CompanyMetricsPage({ currentUser, companyId }: CompanyMetricsPageProps) {
  const metricsCollectionPath = useMemo(
    () => (companyId ? `companies/${companyId}/metrics` : ""),
    [companyId],
  );
  const { data: persistedMetricsDoc, loading: persistedMetricsLoading } =
    useFirestoreDocument<PersistedMetricsDocument>(metricsCollectionPath, "annual", {
      enabled: isFirebaseConfigured && !!companyId,
    });
  const [savedMetricsState, setSavedMetricsState] = useState<MetricsPageState>(() =>
    createSeedState(currentUser.companyName),
  );
  const [draftMetricsState, setDraftMetricsState] = useState<MetricsPageState>(() =>
    createSeedState(currentUser.companyName),
  );
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>(DEFAULT_SELECTED_METRIC_KEY);
  const [chartVariant, setChartVariant] = useState<ChartVariant>("line");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldFormat, setNewFieldFormat] = useState<MetricFormat>("number");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const seedState = createSeedState(currentUser.companyName);
    setSavedMetricsState(seedState);
    setDraftMetricsState(seedState);
    setSelectedMetricKey(DEFAULT_SELECTED_METRIC_KEY);
    setIsDirty(false);
    setLastSavedAt(null);
  }, [currentUser.companyName, companyId]);

  useEffect(() => {
    if (!isFirebaseConfigured || !companyId || persistedMetricsLoading || isDirty) {
      return;
    }

    const nextState = normalizeMetricsState(persistedMetricsDoc ?? null, currentUser.companyName);
    setSavedMetricsState(nextState);
    setDraftMetricsState(nextState);
    setLastSavedAt(normalizeDateLabel(persistedMetricsDoc?.updatedAt) ?? null);
  }, [
    companyId,
    currentUser.companyName,
    isDirty,
    persistedMetricsDoc,
    persistedMetricsLoading,
  ]);

  const savedMetricFields = useMemo<MetricField[]>(
    () => [
      ...BASE_METRIC_FIELDS,
      ...savedMetricsState.customFields.map((field) => ({
        ...field,
        source: "custom" as const,
        tone: "bg-indigo-500",
      })),
    ],
    [savedMetricsState.customFields],
  );

  const draftMetricFields = useMemo<MetricField[]>(
    () => [
      ...BASE_METRIC_FIELDS,
      ...draftMetricsState.customFields.map((field) => ({
        ...field,
        source: "custom" as const,
        tone: "bg-indigo-500",
      })),
    ],
    [draftMetricsState.customFields],
  );

  useEffect(() => {
    if (!savedMetricFields.some((field) => field.key === selectedMetricKey)) {
      setSelectedMetricKey(DEFAULT_SELECTED_METRIC_KEY);
    }
  }, [savedMetricFields, selectedMetricKey]);

  const selectedMonth = useMemo(
    () => getComparisonMonth(savedMetricsState.year, savedMetricsState.data),
    [savedMetricsState.year, savedMetricsState.data],
  );

  const currentMonthData = useMemo(
    () =>
      savedMetricsState.data.find((item) => item.month === selectedMonth) ??
      createEmptyMonth(savedMetricsState.year, selectedMonth),
    [savedMetricsState.data, savedMetricsState.year, selectedMonth],
  );

  const previousMonthData = useMemo(
    () => savedMetricsState.data.find((item) => item.month === selectedMonth - 1),
    [savedMetricsState.data, selectedMonth],
  );

  const selectedMetric = useMemo(
    () => getMetricFieldByKey(savedMetricFields, selectedMetricKey, 0),
    [savedMetricFields, selectedMetricKey],
  );

  const chartData = useMemo(
    () =>
      savedMetricsState.data.map((item) => ({
        month: `${item.month}월`,
        value: getMetricValue(item, selectedMetric.key),
      })),
    [savedMetricsState.data, selectedMetric.key],
  );

  const summaryFields = useMemo(() => {
    const fixedFields = ["revenue", "employees", "customers"];
    const fallbackFourth = selectedMetric.key === "revenue" || selectedMetric.key === "employees" || selectedMetric.key === "customers"
      ? "patents"
      : selectedMetric.key;

    return [
      getMetricFieldByKey(savedMetricFields, "revenue", 0),
      getMetricFieldByKey(savedMetricFields, "employees", 1),
      getMetricFieldByKey(savedMetricFields, "customers", 2),
      savedMetricFields.find((field) => field.key === fallbackFourth)
        ?? savedMetricFields.find((field) => !fixedFields.includes(field.key))
        ?? BASE_METRIC_FIELDS[3]!,
    ];
  }, [savedMetricFields, selectedMetric.key]);

  const handleMetricChange = (month: number, key: string, rawValue: string) => {
    const nextValue = Number.parseInt(rawValue, 10);

    setDraftMetricsState((prev) => ({
      ...prev,
      data: prev.data.map((item) =>
        item.month === month ? setMetricValue(item, key, Number.isNaN(nextValue) ? 0 : nextValue) : item,
      ),
    }));
    setIsDirty(true);
  };

  const handleAddField = () => {
    const label = newFieldLabel.trim();
    if (!label) {
      toast.error("컬럼 이름을 입력해 주세요.");
      return;
    }

    const duplicated = draftMetricFields.some((field) => field.label === label);
    if (duplicated) {
      toast.error("같은 이름의 컬럼이 이미 있습니다.");
      return;
    }

    const nextField: CustomMetricField = {
      key: `custom-${Date.now()}`,
      label,
      format: newFieldFormat,
    };

    setDraftMetricsState((prev) => ({
      ...prev,
      customFields: [...prev.customFields, nextField],
      data: prev.data.map((item) => ({
        ...item,
        otherMetrics: {
          ...(item.otherMetrics ?? {}),
          [nextField.key]: 0,
        },
      })),
    }));
    setSelectedMetricKey(nextField.key);
    setNewFieldLabel("");
    setNewFieldFormat("number");
    setIsDirty(true);
    toast.success("새 지표 컬럼을 추가했습니다.");
  };

  const handleDeleteField = (key: string) => {
    const targetField = draftMetricsState.customFields.find((field) => field.key === key);
    if (!targetField) {
      return;
    }

    setDraftMetricsState((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((field) => field.key !== key),
      data: prev.data.map((item) => {
        const nextOtherMetrics = { ...(item.otherMetrics ?? {}) };
        delete nextOtherMetrics[key];

        return {
          ...item,
          otherMetrics: nextOtherMetrics,
        };
      }),
    }));

    if (selectedMetricKey === key) {
      setSelectedMetricKey(DEFAULT_SELECTED_METRIC_KEY);
    }

    setIsDirty(true);
    toast.success(`${targetField.label} 컬럼을 삭제했습니다.`);
  };

  const handleSave = async () => {
    if (!isFirebaseConfigured) {
      toast.error("Firebase 설정이 없어 실데이터 저장을 진행할 수 없습니다.");
      return;
    }

    if (!companyId) {
      toast.error("회사 문서를 찾지 못해 저장할 수 없습니다.");
      return;
    }

    setIsSaving(true);

    const success = await firestoreService.setDocument<PersistedMetricsDocument>(
      metricsCollectionPath,
      "annual",
      {
        companyId,
        companyName: currentUser.companyName,
        year: draftMetricsState.year,
        data: draftMetricsState.data,
        customFields: draftMetricsState.customFields,
      },
      true,
    );

    setIsSaving(false);

    if (!success) {
      toast.error("실적 데이터를 저장하지 못했습니다.");
      return;
    }

    const refreshedDocument = await firestoreService.getDocument<PersistedMetricsDocument>(
      metricsCollectionPath,
      "annual",
    );
    const nextState = normalizeMetricsState(
      refreshedDocument ?? draftMetricsState,
      currentUser.companyName,
    );

    setSavedMetricsState(nextState);
    setDraftMetricsState(nextState);
    setIsDirty(false);
    setLastSavedAt(
      normalizeDateLabel(refreshedDocument?.updatedAt) ??
        new Date().toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
    toast.success("실적 데이터를 회사 문서에 저장했습니다.");
  };

  const handleDownload = () => {
    const csvContent = createMetricsCsv(draftMetricsState, draftMetricFields);
    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentUser.companyName}-${draftMetricsState.year}-monthly-metrics.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 8, right: 8, left: 8, bottom: 0 },
    };

    if (chartVariant === "bar") {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(value) => formatAxisValue(value, selectedMetric.format)}
          />
          <Tooltip
            content={
              <MetricTooltip
                format={selectedMetric.format}
                metricLabel={selectedMetric.label}
              />
            }
          />
          <Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} />
        </BarChart>
      );
    }

    if (chartVariant === "area") {
      return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="company-metrics-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(value) => formatAxisValue(value, selectedMetric.format)}
          />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip
            content={
              <MetricTooltip
                format={selectedMetric.format}
                metricLabel={selectedMetric.label}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2.5}
            fill="url(#company-metrics-fill)"
          />
        </AreaChart>
      );
    }

    return (
      <LineChart {...commonProps}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickFormatter={(value) => formatAxisValue(value, selectedMetric.format)}
        />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
        <Tooltip
          content={
            <MetricTooltip
              format={selectedMetric.format}
              metricLabel={selectedMetric.label}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#2563eb" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    );
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1>실적 관리</h1>
            <Badge variant="outline">{draftMetricsState.year}년</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {currentUser.companyName}의 월별 실적을 입력하고 지표별 흐름을 빠르게 확인하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryFields.map((field) => {
          const currentValue = getMetricValue(currentMonthData, field.key);
          const previousValue = previousMonthData ? getMetricValue(previousMonthData, field.key) : undefined;
          const difference = previousValue === undefined ? 0 : currentValue - previousValue;
          const isPositive = difference >= 0;

          const Icon =
            field.key === "revenue"
              ? DollarSign
              : field.key === "employees"
                ? Users
                : field.key === "customers"
                  ? Target
                  : field.key === "patents"
                    ? Award
                    : Sparkles;

          return (
            <Card key={field.key} className="gap-0">
              <CardContent className="flex h-full min-h-[112px] flex-col justify-between p-3.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{selectedMonth}월 {field.label}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatMetricValue(currentValue, field.format)}
                    </p>
                  </div>
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", field.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{getMonthDelta(currentValue, previousValue)}</p>
                  {previousValue !== undefined && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                        isPositive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700",
                      )}
                    >
                      {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {Math.abs(difference).toLocaleString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.22fr)_minmax(0,0.98fr)]">
        <Card className="flex h-full flex-col gap-0">
          <CardHeader className="gap-3 border-b px-5 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">월별 실적 입력</CardTitle>
                <CardDescription className="text-xs leading-5">
                  기본 지표는 유지되고, 사용자 지표는 추가 후 삭제할 수 있습니다.
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    CSV 다운로드
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || persistedMetricsLoading || !companyId || !isFirebaseConfigured}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    저장
                  </Button>
                </div>
                <div className="flex flex-col items-end text-[11px]">
                  {lastSavedAt && (
                    <span className="text-muted-foreground">최근 저장 {lastSavedAt}</span>
                  )}
                  {isDirty && (
                    <span className="font-medium text-amber-700">저장되지 않은 변경사항</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_auto]">
              <Input
                value={newFieldLabel}
                onChange={(event) => setNewFieldLabel(event.target.value)}
                placeholder="새 컬럼 이름 예: 투자유치현황"
                className="h-8"
              />
              <Select value={newFieldFormat} onValueChange={(value: MetricFormat) => setNewFieldFormat(value)}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">숫자</SelectItem>
                  <SelectItem value="currency">금액</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={handleAddField}>
                <Plus className="h-4 w-4" />
                컬럼 추가
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col px-5 pt-4">
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border xl:max-h-[500px]">
              <Table className="min-w-[980px]">
                <TableHeader className="bg-muted/30 [&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-muted/95">
                  <TableRow>
                    <TableHead className="w-[84px]">월</TableHead>
                    {draftMetricFields.map((field) => (
                      <TableHead key={field.key}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span>{field.label}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                field.source === "base"
                                  ? "border-slate-200 bg-white text-slate-500"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
                              )}
                            >
                              {field.source === "base" ? "기본" : "사용자"}
                            </Badge>
                          </div>
                          {field.source === "custom" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDeleteField(field.key)}
                              aria-label={`${field.label} 컬럼 삭제`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftMetricsState.data.map((monthData) => (
                    <TableRow key={monthData.month}>
                      <TableCell className="font-medium">{monthData.month}월</TableCell>
                      {draftMetricFields.map((field) => (
                        <TableCell key={`${monthData.month}-${field.key}`}>
                          <Input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={String(getMetricValue(monthData, field.key))}
                            onChange={(event) =>
                              handleMetricChange(monthData.month, field.key, event.target.value)
                            }
                            className="h-7 min-w-[96px] text-right text-sm"
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-3 pt-3 text-[11px] text-muted-foreground">
              <span>저장 전에는 차트와 요약 카드에 반영되지 않습니다.</span>
              <span>저장 후 회사 문서 하위 데이터에 반영됩니다.</span>
              <span>예: 투자유치현황, 제휴 수, 리드 수</span>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col gap-0">
          <CardHeader className="gap-3 border-b px-5 pt-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">월별 현황 차트</CardTitle>
                  <CardDescription className="text-xs leading-5">
                    지표와 차트 형태를 빠르게 바꿔 보세요.
                  </CardDescription>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">지표</p>
                    <Select value={selectedMetricKey} onValueChange={setSelectedMetricKey}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {savedMetricFields.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">차트</p>
                    <Select
                      value={chartVariant}
                      onValueChange={(value: ChartVariant) => setChartVariant(value)}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHART_VARIANT_OPTIONS.map((item) => (
                          <SelectItem key={item.key} value={item.key}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col px-5 pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{selectedMetric.label}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {savedMetricsState.year}년 1월부터 12월까지의 월별 추이
              </span>
            </div>
            <div className="h-[280px] w-full xl:h-full xl:min-h-[390px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
