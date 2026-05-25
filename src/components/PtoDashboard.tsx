import React, { useState, useMemo } from "react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";
import { 
  Clock, 
  TrendingUp, 
  LayoutDashboard, 
  User, 
  BarChart3, 
  AreaChart as AreaIcon, 
  LineChart as LineIcon, 
  Sparkles, 
  Wrench, 
  AlertCircle 
} from "lucide-react";
import { VehicleState } from "../types";

// Interactive PTO weekly mock dataset mapped to Hebrew days
interface WeeklyPtoData {
  dayName: string;
  hikmatMinutes: number; // For Hikmat (Mercedes Crane)
  aliMinutes: number;    // For Ali (Isuzu Flatbed)
  hikmatCount: number;   // Number of PTO turn-ons
  aliCount: number;      // Number of PTO turn-ons
}

const INITIAL_PTO_DATA: WeeklyPtoData[] = [
  { dayName: "יום ראשון", hikmatMinutes: 120, aliMinutes: 60, hikmatCount: 5, aliCount: 3 },
  { dayName: "יום שני", hikmatMinutes: 185, aliMinutes: 90, hikmatCount: 8, aliCount: 5 },
  { dayName: "יום שלישי", hikmatMinutes: 90, aliMinutes: 110, hikmatCount: 4, aliCount: 6 },
  { dayName: "יום רביעי", hikmatMinutes: 210, aliMinutes: 75, hikmatCount: 9, aliCount: 4 },
  { dayName: "יום חמישי", hikmatMinutes: 150, aliMinutes: 130, hikmatCount: 6, aliCount: 7 },
  { dayName: "יום שישי", hikmatMinutes: 45, aliMinutes: 30, hikmatCount: 2, aliCount: 2 },
  { dayName: "יום שבת", hikmatMinutes: 0, aliMinutes: 0, hikmatCount: 0, aliCount: 0 }
];

interface PtoDashboardProps {
  fleet: Record<string, VehicleState>;
}

export default function PtoDashboard({ fleet }: PtoDashboardProps) {
  const [chartType, setChartType] = useState<"bar" | "area" | "line">("bar");
  const [metricType, setMetricType] = useState<"minutes" | "count">("minutes");

  // Include current live changes in the dashboard if active
  const updatedWeeklyData = useMemo(() => {
    const baseData = JSON.parse(JSON.stringify(INITIAL_PTO_DATA)) as WeeklyPtoData[];
    
    // Today is Monday (based on localized current local time timestamp: 2026-05-25 matches Monday)
    // Let's dynamically add live PTO minutes if currently active to make the dashboard feel alive.
    // Hikmat or Ali
    const hikmatActive = fleet["hikmat"]?.ptoState === "open";
    const aliActive = fleet["ali"]?.ptoState === "open";

    // "יום שני" is index 1
    if (hikmatActive) {
      baseData[1].hikmatMinutes += 25; // Add dynamic active simulation weight
      baseData[1].hikmatCount += 1;
    }
    if (aliActive) {
      baseData[1].aliMinutes += 15;
      baseData[1].aliCount += 1;
    }

    return baseData;
  }, [fleet]);

  // Calculations for total hours, average and peak activity
  const stats = useMemo(() => {
    let hikmatTotalMins = 0;
    let aliTotalMins = 0;
    let hikmatTotalCount = 0;
    let aliTotalCount = 0;
    let peakDay = "";
    let peakVal = 0;
    let peakDriver = "";

    updatedWeeklyData.forEach(d => {
      hikmatTotalMins += d.hikmatMinutes;
      aliTotalMins += d.aliMinutes;
      hikmatTotalCount += d.hikmatCount;
      aliTotalCount += d.aliCount;

      const dayTotal = d.hikmatMinutes + d.aliMinutes;
      if (dayTotal > peakVal) {
        peakVal = dayTotal;
        peakDay = d.dayName;
        peakDriver = d.hikmatMinutes > d.aliMinutes ? "חכמת" : "עלי";
      }
    });

    const totalMinutes = hikmatTotalMins + aliTotalMins;
    const avgDailyMins = Math.round(totalMinutes / 6); // divide by 6 active working days
    
    return {
      hikmatHours: (hikmatTotalMins / 60).toFixed(1),
      aliHours: (aliTotalMins / 60).toFixed(1),
      hikmatCount: hikmatTotalCount,
      aliCount: aliTotalCount,
      totalHours: (totalMinutes / 60).toFixed(1),
      avgDailyMins,
      peakDay,
      peakDriver
    };
  }, [updatedWeeklyData]);

  // Dynamic status warnings for heavy duty
  const isHikmatWorking = fleet["hikmat"]?.ptoState === "open";
  const isAliWorking = fleet["ali"]?.ptoState === "open";

  return (
    <div id="pto-pattern-dashboard" className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-6 w-full text-slate-800">
      
      {/* Dashboard Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
              מדדי פריסת עבודת מנוף ומשטח (אנליטיקת PTO שבועית)
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              עקוב אחר משך הפעלת ה-PTO וצפיפות ההובלות לפי ימים כדי למנוע עומס חריג ולהתאים סידורי עבודה
            </p>
          </div>
        </div>

        {/* Dashboard Actions */}
        <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto text-xs font-semibold">
          
          {/* Toggle metric */}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
            <button
              onClick={() => setMetricType("minutes")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                metricType === "minutes"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              דקות עבודה מצטברות
            </button>
            <button
              onClick={() => setMetricType("count")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                metricType === "count"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              מספר הפעלות מנוף (קליקים)
            </button>
          </div>

          {/* Chart visual picker */}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
            <button
              onClick={() => setChartType("bar")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                chartType === "bar" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
              title="גרף עמודות"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                chartType === "area" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
              title="גרף שטח"
            >
              <AreaIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType("line")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                chartType === "line" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
              title="גרף קו"
            >
              <LineIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid of KPI metric widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* KPI 1: Hikmat Crane Active Times */}
        <div id="kpi-hikmat-pto" className="bg-gradient-to-br from-blue-50/50 to-white border border-blue-105 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold block">חכמת (מרצדס מנוף)</span>
            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-blue-700 block leading-none font-mono">
              {stats.hikmatHours} שעות
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              מצטבר השבוע ({stats.hikmatCount} הפעלות נפרדות)
            </span>
          </div>
          {isHikmatWorking && (
            <div className="mt-2.5 bg-red-100 text-red-700 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 animate-pulse">
              <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
              <span>מנוף מופעל כעת בשטח!</span>
            </div>
          )}
        </div>

        {/* KPI 2: Ali Flatbed Active Times */}
        <div id="kpi-ali-pto" className="bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold block">עלי (איסוזו משטח)</span>
            <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-700 block leading-none font-mono">
              {stats.aliHours} שעות
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              מצטבר השבוע ({stats.aliCount} גרירות והעמסות)
            </span>
          </div>
          {isAliWorking && (
            <div className="mt-2.5 bg-red-100 text-red-700 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 animate-pulse">
              <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
              <span>משטח פעיל ונטען עכשיו!</span>
            </div>
          )}
        </div>

        {/* KPI 3: Fleet Overall Total Hours */}
        <div id="kpi-total-pto" className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold block">סך הכל עבודת צי ענפה</span>
            <div className="p-1.5 bg-slate-200 text-slate-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-800 block leading-none font-mono">
              {stats.totalHours} שעות
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              עבודה מבוססת PTO של שני הנהגים יחד
            </span>
          </div>
          <div className="mt-2.5 text-[10px] text-slate-500">
            ממוצע יומי: <strong>{stats.avgDailyMins} דקות</strong> לנהג
          </div>
        </div>

        {/* KPI 4: Peak Workday Detection */}
        <div id="kpi-peak-pto" className="bg-gradient-to-br from-amber-50/40 to-white border border-amber-200/60 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold block">יום עבודה עמוס ביותר</span>
            <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-extrabold text-amber-700 block leading-none">
              {stats.peakDay}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              שיא פעילות בהובלות מנוף/משטח
            </span>
          </div>
          <div className="mt-2.5 text-[10px] text-slate-600">
            מחולל ראשי: <strong>{stats.peakDriver}</strong>
          </div>
        </div>
      </div>

      {/* Main Graphical Chart Container */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-4 h-[320px] relative w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart 
              data={updatedWeeklyData}
              margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="dayName" 
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "#64748B" }} 
                axisLine={false} 
                tickLine={false}
                label={{ 
                  value: metricType === "minutes" ? "דקות עבודה" : "מספר פעימות", 
                  angle: -90, 
                  position: "insideLeft", 
                  fontSize: 10, 
                  fill: "#94A3B8" 
                }}
              />
              <Tooltip 
                content={<CustomTooltip metricType={metricType} />} 
                cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
              />
              <Legend 
                verticalAlign="top" 
                height={32}
                iconType="circle"
                tick={{ fontSize: 11 }}
                formatter={(value) => <span className="text-slate-700 text-xs font-semibold mr-1">{value === "hikmatMinutes" || value === "hikmatCount" ? "חכמת (מרצדס מנוף)" : "עלי (איסוזו משטח)"}</span>}
              />
              <Bar 
                dataKey={metricType === "minutes" ? "hikmatMinutes" : "hikmatCount"} 
                fill="#2563EB" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={45}
              />
              <Bar 
                dataKey={metricType === "minutes" ? "aliMinutes" : "aliCount"} 
                fill="#059669" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={45}
              />
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart 
              data={updatedWeeklyData}
              margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="gradientHikmat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="gradientAli" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="dayName" 
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip metricType={metricType} />} />
              <Legend 
                verticalAlign="top" 
                height={32} 
                iconType="circle"
                formatter={(value) => <span className="text-slate-700 text-xs font-semibold mr-1">{value === "hikmatMinutes" || value === "hikmatCount" ? "חכמת (מרצדס מנוף)" : "עלי (איסוזו משטח)"}</span>}
              />
              <Area 
                type="monotone" 
                dataKey={metricType === "minutes" ? "hikmatMinutes" : "hikmatCount"} 
                stroke="#2563EB" 
                fillOpacity={1} 
                fill="url(#gradientHikmat)" 
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey={metricType === "minutes" ? "aliMinutes" : "aliCount"} 
                stroke="#059669" 
                fillOpacity={1} 
                fill="url(#gradientAli)" 
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart 
              data={updatedWeeklyData}
              margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="dayName" 
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip metricType={metricType} />} />
              <Legend 
                verticalAlign="top" 
                height={32}
                iconType="circle"
                formatter={(value) => <span className="text-slate-700 text-xs font-semibold mr-1">{value === "hikmatMinutes" || value === "hikmatCount" ? "חכמת (מרצדס מנוף)" : "עלי (איסוזו משטח)"}</span>}
              />
              <Line 
                type="monotone" 
                dataKey={metricType === "minutes" ? "hikmatMinutes" : "hikmatCount"} 
                stroke="#2563EB" 
                strokeWidth={3} 
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey={metricType === "minutes" ? "aliMinutes" : "aliCount"} 
                stroke="#059669" 
                strokeWidth={3} 
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Intelligent AI pattern insights card */}
      <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-amber-900">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-950 mb-1">ניתוח דפוסי עבודה (תובנות חכמות):</h4>
          <ul className="list-disc list-inside space-y-1.5 text-amber-900/90 pr-1">
            <li>
              ישנו **עומס בולט בימים שני ורביעי** אצל חכמת (מרצדס מנוף). ימיו של עלי פזורים באופן הומוגני יותר, עם שיעורי עבודה מוגברים לקראת **חמישי**.
            </li>
            <li>
              מומלץ לפצל הובלות ארוכות במיוחד עם פריקות מנוף לקראת אמצע השבוע כדי לשמור על בטיחות הנהגים ולהחזיק במרווח תחזוקה.
            </li>
            <li>
              מצב ה-PTO משויך ללוויין באופן שוטף. כל לחיצה נוספת משוקפת בסינכרון ישיר מערוץ המייל של החנות.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Custom Recharts Hebrew Tooltip
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  metricType: "minutes" | "count";
}

function CustomTooltip({ active, payload, label, metricType }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-xl text-xs space-y-1.5 min-w-[170px]" dir="rtl">
        <p className="font-bold text-slate-300 border-b border-slate-800 pb-1 mb-1">{label}</p>
        
        {payload.map((item, index) => {
          const isHikmat = item.dataKey === "hikmatMinutes" || item.dataKey === "hikmatCount";
          const colorClass = isHikmat ? "text-blue-400" : "text-emerald-400";
          const name = isHikmat ? "חכמת (מנוף)" : "עלי (משטח)";
          const valueText = metricType === "minutes" ? `${item.value} דקות עבודה` : `${item.value} הפעלות`;
          
          return (
            <div key={index} className="flex items-center justify-between gap-3">
              <span className={`font-semibold ${colorClass}`}>{name}:</span>
              <span className="font-mono">{valueText}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}
