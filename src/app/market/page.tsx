'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Building2,
  DollarSign,
  Download,
  GitCompareArrows,
  Loader2,
  MapPin,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { marketData, properties } from '@/lib/mock-data';
import type { MarketData } from '@/lib/types';
import { cn } from '@/lib/utils';

const COMPARE_COLORS = ['#60a5fa', '#34d399', '#fbbf24'];

const REPORT_STEPS = [
  'Analyzing market data…',
  'Identifying trends and anomalies…',
  'Benchmarking against historicals…',
  'Composing report…',
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

interface MonthPoint {
  month: string;
  rent: number;
  vacancy: number;
  absorption: number;
}

function generateMonthlyData(market: MarketData): MonthPoint[] {
  const h = hashString(market.city);
  const months: MonthPoint[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('en-US', { month: 'short' });
    const seed = (h >> (i * 3)) & 0xf;
    const rentDrift = ((11 - i) * (market.rentGrowth / 100) * market.medianRent) / 12;
    const rent = market.medianRent - rentDrift + ((seed % 7) - 3) * 0.15;
    const vacancy = Math.max(
      4,
      market.vacancyRate + ((seed % 9) - 4) * 0.6 - (11 - i) * 0.08
    );
    const absorption = Math.max(
      5000,
      market.absorption + ((seed % 11) - 5) * 6000 - (11 - i) * 800
    );
    months.push({
      month: label,
      rent: Math.round(rent * 100) / 100,
      vacancy: Math.round(vacancy * 10) / 10,
      absorption: Math.round(absorption),
    });
  }
  return months;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function marketSummary(market: MarketData): string {
  const vacancyDesc =
    market.vacancyRate < 11 ? 'tight' : market.vacancyRate < 15 ? 'balanced' : 'elevated';
  const growthDesc =
    market.rentGrowth >= 4 ? 'strong' : market.rentGrowth >= 2.5 ? 'steady' : 'modest';
  const demandDesc =
    market.absorption > 100000
      ? 'signals robust tenant demand'
      : market.absorption > 60000
        ? 'indicates healthy leasing activity'
        : 'suggests softening demand';
  const capDesc =
    market.capRate < 6
      ? 'remains attractive for investors seeking yield in a high-growth corridor'
      : 'offers stable, income-oriented returns';
  return `${market.city}'s ${market.propertyType} market shows ${growthDesc} fundamentals with ${market.rentGrowth}% year-over-year rent growth and a ${vacancyDesc} vacancy rate of ${market.vacancyRate}%. Absorption of ${formatNumber(market.absorption)} sq ft over the trailing 12 months ${demandDesc}. At a ${market.capRate}% cap rate, the market ${capDesc}. Population growth of ${market.populationGrowth}% and job growth of ${market.jobGrowth}% continue to underpin long-term demand.`;
}

interface ForecastItem {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'flat';
  note: string;
}

function buildForecast(market: MarketData): ForecastItem[] {
  return [
    {
      label: 'Projected Rent Growth',
      value: `${(market.rentGrowth * 1.05).toFixed(1)}%`,
      direction: 'up',
      note: 'Continued demand expected to push rents higher over the next 12 months.',
    },
    {
      label: 'Projected Vacancy Rate',
      value: `${Math.max(5, market.vacancyRate - 0.6).toFixed(1)}%`,
      direction: 'down',
      note: 'New supply limited; vacancy expected to compress as absorption persists.',
    },
    {
      label: 'Projected Cap Rate',
      value: `${Math.max(4.5, market.capRate - 0.15).toFixed(1)}%`,
      direction: 'down',
      note: 'Institutional interest likely to compress cap rates further.',
    },
    {
      label: 'Projected Absorption',
      value: `${formatNumber(Math.round(market.absorption * 1.08))} sq ft`,
      direction: 'up',
      note: 'Lease expirations and expansions drive net absorption higher.',
    },
  ];
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
  trend?: 'up' | 'down';
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={cn(
                'flex items-center gap-0.5 font-semibold',
                trend === 'up' ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {trend === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              Live
            </span>
          )}
          <span className="text-slate-500">{sub}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-slate-400">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? '#60a5fa' }}
          />
          {entry.name}:{' '}
          <span className="font-medium text-slate-200">
            {entry.name === 'Absorption'
              ? `${formatNumber(entry.value)} sq ft`
              : entry.name === 'Vacancy'
                ? `${entry.value}%`
                : `$${entry.value.toFixed(2)}`}
          </span>
        </p>
      ))}
    </div>
  );
}

function GenerateReportPanel({
  market,
  onClose,
}: {
  market: MarketData;
  onClose: () => void;
}) {
  const findings = [
    `${market.rentGrowth}% YoY rent growth outpaces the national average of 3.1%.`,
    `Vacancy at ${market.vacancyRate}% is ${market.vacancyRate < 12 ? 'below' : 'above'} the 12-market portfolio median.`,
    `Cap rate of ${market.capRate}% ${market.capRate < 6 ? 'positions the market as a top-tier yield target' : 'reflects stable, income-focused investor demand'}.`,
    `Job growth of ${market.jobGrowth}% supports sustained leasing velocity through the next fiscal year.`,
  ];

  return (
    <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-slate-900/60 to-slate-900/60 shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">
                AI Market Report — {market.city}, {market.state}
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Generated by Market Intelligence agent · {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-white">
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:bg-slate-800 hover:text-white">
              Dismiss
            </Button>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">{marketSummary(market)}</p>
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Key Findings
          </p>
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li key={finding} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                {finding}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketPage() {
  const [selectedCity, setSelectedCity] = useState(marketData[0].city);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCities, setCompareCities] = useState<string[]>([marketData[0].city]);
  const [reportState, setReportState] = useState<'idle' | 'generating' | 'done'>('idle');
  const [reportStep, setReportStep] = useState(0);

  const market = useMemo(
    () => marketData.find((m) => m.city === selectedCity) ?? marketData[0],
    [selectedCity]
  );

  const monthlyData = useMemo(() => generateMonthlyData(market), [market]);

  const compareMarkets = useMemo(
    () =>
      compareCities
        .map((city) => marketData.find((m) => m.city === city))
        .filter((m): m is MarketData => Boolean(m)),
    [compareCities]
  );

  const compareChartData = useMemo<Record<string, string | number>[]>(() => {
    if (!compareMode || compareMarkets.length === 0) {
      return monthlyData.map((p) => ({ ...p }));
    }
    const series = compareMarkets.map((m) => generateMonthlyData(m));
    return series[0].map((point, i) => {
      const row: Record<string, string | number> = { month: point.month };
      compareMarkets.forEach((m, idx) => {
        row[m.city] = series[idx][i].rent;
      });
      return row;
    });
  }, [compareMode, compareMarkets, monthlyData]);

  const comparables = useMemo(
    () => properties.filter((p) => p.city === market.city),
    [market]
  );

  const forecast = useMemo(() => buildForecast(market), [market]);

  const toggleCompareCity = (city: string) => {
    setCompareCities((prev) => {
      if (prev.includes(city)) return prev.filter((c) => c !== city);
      if (prev.length >= 3) return [...prev.slice(1), city];
      return [...prev, city];
    });
  };

  const generateReport = () => {
    setReportState('generating');
    setReportStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step >= REPORT_STEPS.length) {
        clearInterval(interval);
        setReportState('done');
      } else {
        setReportStep(step);
      }
    }, 900);
  };

  const metricRows: { label: string; render: (m: MarketData) => string }[] = [
    { label: 'Median Rent', render: (m) => `$${m.medianRent.toFixed(2)}/sq ft` },
    { label: 'Rent Growth', render: (m) => `${m.rentGrowth}% YoY` },
    { label: 'Vacancy Rate', render: (m) => `${m.vacancyRate}%` },
    { label: 'Cap Rate', render: (m) => `${m.capRate}%` },
    { label: 'Absorption', render: (m) => `${formatNumber(m.absorption)} sq ft` },
    { label: 'Population Growth', render: (m) => `${m.populationGrowth}%` },
    { label: 'Job Growth', render: (m) => `${m.jobGrowth}%` },
  ];

  return (
    <AppLayout title="Market Intelligence">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Market Intelligence</h2>
            <p className="text-sm text-slate-400">
              Real-time market analytics powered by the Market Intelligence agent.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                aria-label="Select city"
              >
                {marketData.map((m) => (
                  <option key={m.id} value={m.city}>
                    {m.city}, {m.state}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant={compareMode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode && compareCities.length === 0) {
                  setCompareCities([selectedCity]);
                }
              }}
              className={
                compareMode
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-white'
              }
            >
              <GitCompareArrows className="h-4 w-4" />
              Compare
            </Button>
            <Button
              onClick={generateReport}
              disabled={reportState === 'generating'}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {reportState === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {REPORT_STEPS[reportStep]}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </div>

        {compareMode && (
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Compare cities (2–3):
              </span>
              {marketData.map((m) => {
                const active = compareCities.includes(m.city);
                const colorIdx = compareCities.indexOf(m.city);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleCompareCity(m.city)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'border-indigo-500/50 bg-indigo-500/15 text-white'
                        : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-white'
                    )}
                  >
                    {active && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: COMPARE_COLORS[colorIdx] }}
                      />
                    )}
                    {m.city}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {reportState === 'done' && (
          <GenerateReportPanel market={market} onClose={() => setReportState('idle')} />
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Median Rent"
            value={`$${market.medianRent.toFixed(2)}`}
            sub="per sq ft / yr"
            icon={DollarSign}
            trend="up"
          />
          <MetricCard
            label="Rent Growth"
            value={`${market.rentGrowth}%`}
            sub="year over year"
            icon={TrendingUp}
            trend="up"
          />
          <MetricCard
            label="Vacancy Rate"
            value={`${market.vacancyRate}%`}
            sub="office inventory"
            icon={Building2}
            trend={market.vacancyRate > 15 ? 'down' : 'up'}
          />
          <MetricCard
            label="Cap Rate"
            value={`${market.capRate}%`}
            sub="market average"
            icon={Percent}
          />
          <MetricCard
            label="Absorption"
            value={formatNumber(market.absorption)}
            sub="sq ft · trailing 12 mo"
            icon={Activity}
            trend="up"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-5">
          <Card className="border-slate-800 bg-slate-900/60 shadow-lg xl:col-span-3">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Rent Trends</h3>
                  <p className="text-xs text-slate-500">
                    Median asking rent · trailing 12 months
                  </p>
                </div>
                {compareMode && compareMarkets.length > 0 && (
                  <div className="flex items-center gap-3">
                    {compareMarkets.map((m, i) => (
                      <span key={m.id} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: COMPARE_COLORS[i] }}
                        />
                        {m.city}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compareChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={{ stroke: '#1e293b' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      cursor={{ stroke: '#334155' }}
                      content={<ChartTooltip />}
                    />
                    {compareMode ? (
                      <>
                        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        {compareMarkets.map((m, i) => (
                          <Line
                            key={m.id}
                            type="monotone"
                            dataKey={m.city}
                            stroke={COMPARE_COLORS[i]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </>
                    ) : (
                      <Line
                        type="monotone"
                        dataKey="rent"
                        name="Median Rent"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-lg xl:col-span-2">
            <CardContent className="p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-white">Vacancy vs Absorption</h3>
                <p className="text-xs text-slate-500">
                  Monthly vacancy rate and net absorption · {market.city}
                </p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={{ stroke: '#1e293b' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="vacancy"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <YAxis
                      yAxisId="absorption"
                      orientation="right"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                      content={<ChartTooltip />}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Bar
                      yAxisId="vacancy"
                      dataKey="vacancy"
                      name="Vacancy"
                      fill="#f59e0b"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={18}
                    />
                    <Bar
                      yAxisId="absorption"
                      dataKey="absorption"
                      name="Absorption"
                      fill="#38bdf8"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {compareMode && compareMarkets.length >= 2 && (
          <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white">City Comparison</h3>
              <p className="mb-4 text-xs text-slate-500">
                Side-by-side metrics for selected markets
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left">
                      <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Metric
                      </th>
                      {compareMarkets.map((m, i) => (
                        <th key={m.id} className="pb-3 pr-4">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: COMPARE_COLORS[i] }}
                            />
                            {m.city}, {m.state}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((row) => (
                      <tr key={row.label} className="border-b border-slate-800/60 last:border-0">
                        <td className="py-2.5 pr-4 text-xs font-medium text-slate-500">
                          {row.label}
                        </td>
                        {compareMarkets.map((m) => (
                          <td key={m.id} className="py-2.5 pr-4 text-sm text-slate-200">
                            {row.render(m)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Market Summary</h3>
              <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                AI-generated
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {marketSummary(market)}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white">
                Top Comparable Properties — {market.city}
              </h3>
              <p className="mb-4 text-xs text-slate-500">
                Portfolio assets in the selected market
              </p>
              {comparables.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No portfolio properties in this market yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        <th className="pb-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Property</th>
                        <th className="pb-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                        <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Size</th>
                        <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Occ.</th>
                        <th className="pb-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparables.map((p) => (
                        <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-white">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.address}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge className="border-slate-700 bg-slate-800 capitalize text-slate-300">
                              {p.type}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-300">
                            {formatNumber(p.sqFt)} sq ft
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span
                              className={cn(
                                'font-medium tabular-nums',
                                p.occupancy >= 95
                                  ? 'text-emerald-400'
                                  : p.occupancy >= 90
                                    ? 'text-amber-400'
                                    : 'text-red-400'
                              )}
                            >
                              {p.occupancy}%
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium tabular-nums text-slate-200">
                            ${(p.value / 1_000_000).toFixed(1)}M
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white">Market Forecast</h3>
              <p className="mb-4 text-xs text-slate-500">
                12-month projection for {market.city}, {market.state}
              </p>
              <div className="space-y-3">
                {forecast.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{item.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.note}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-base font-bold tabular-nums text-white">
                        {item.value}
                      </span>
                      {item.direction === 'up' ? (
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      ) : item.direction === 'down' ? (
                        <TrendingDown className="h-4 w-4 text-sky-400" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
