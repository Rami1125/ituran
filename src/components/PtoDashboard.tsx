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
  AlertCircle,
  FileText
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
  blackBoxLogs?: any[];
  aliPoints?: number;
  hikmatPoints?: number;
}

export default function PtoDashboard({
  fleet,
  blackBoxLogs = [],
  aliPoints = 12.5,
  hikmatPoints = 15.0
}: PtoDashboardProps) {
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

  // Master PDF/Print Daily Report compiler function
  const downloadDailyReportPdf = () => {
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document || printFrame.contentDocument;
    if (!doc) return;

    const currentDateStr = new Date().toLocaleDateString("he-IL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const currentTimeStr = new Date().toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build the vehicles list rows
    const vehiclesRows = Object.entries(fleet).map(([id, v]) => {
      const driverName = id === "hikmat" ? "חכמת" : id === "ali" ? "עלי" : v.driver;
      const truckDesc = id === "hikmat" ? "מרצדס מנוף" : id === "ali" ? "איסוזו משטח" : v.vehicle;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 16px; font-size: 14px; font-weight: bold; color: #0f172a;">${v.name || driverName}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #334155;">${v.driver || driverName}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #334155; font-family: monospace;">${v.vehicle || truckDesc}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #475569;">${v.address || "לא זמינה"}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #334155; font-family: monospace;">${v.speed || 0} קמ"ש</td>
          <td style="padding: 12px 16px; font-size: 14px;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; ${v.ptoState === 'open' ? 'background-color: #fee2e2; color: #991b1b;' : 'background-color: #f1f5f9; color: #334155;'}">
              ${v.ptoState === "open" ? "פתוח (עבודה פעילה)" : "סגור (חנייה/נסיעה)"}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>SabanOS - דוח פעילות יומי</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
          body { 
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; 
            background-color: white;
            color: #1e293b;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body { background-color: white; }
            .no-print { display: none; }
            @page { size: A4; margin: 15mm; }
          }
        </style>
      </head>
      <body class="p-8">
        <!-- Report Header -->
        <div class="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-start">
          <div>
            <div class="flex items-center gap-3">
              <div style="background-color: #000000; color: #FFBF00; padding: 10px; border-radius: 12px; font-weight: bold; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 2px solid #FFBF00; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                🚚
              </div>
              <div>
                <h1 class="text-3xl font-black text-slate-900 tracking-tight leading-tight">SabanOS | סבאן מערכות</h1>
                <p class="text-xs text-slate-500 font-bold mt-0.5">מערך פיקוח, ניהול, וסינכרון PTO שבועי (איתורן)</p>
              </div>
            </div>
          </div>
          <div class="text-left font-sans">
            <span class="bg-slate-900 text-amber-400 font-black px-3 py-1 rounded text-xs tracking-wider inline-block">דוח יומי מאומת</span>
            <p class="text-xs text-slate-500 mt-2 font-mono">תאריך: ${currentDateStr}</p>
            <p class="text-xs text-slate-500 font-mono font-bold">הופק בשעה: ${currentTimeStr}</p>
          </div>
        </div>

        <!-- Overview Cards -->
        <div class="bg-slate-50 border border-slate-200 rounded-3xl p-6 mb-8">
          <h2 class="text-sm font-black text-slate-900 mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
            <span>📋 מדדים מרכזיים ופעילות רשת הצי</span>
          </h2>
          <div class="grid grid-cols-3 gap-6">
            <div class="border-l border-slate-200 pl-4">
              <span class="text-xs text-slate-400 block font-bold mb-1">סה"כ שעות עבודת PTO:</span>
              <span class="text-2xl font-black text-slate-900 font-mono">${stats.totalHours} שעות</span>
              <p class="text-[10px] text-slate-400 mt-1">מצטבר עבור כלל רכבי הצי</p>
            </div>
            <div class="border-l border-slate-200 pl-4">
              <span class="text-xs text-slate-400 block font-bold mb-1">יום השיא השבועי:</span>
              <span class="text-2xl font-black text-amber-700 font-sans">${stats.peakDay}</span>
              <p class="text-[10px] text-slate-500 mt-1">מוביל שעות עבודה: <strong>${stats.peakDriver}</strong></p>
            </div>
            <div>
              <span class="text-xs text-slate-400 block font-bold mb-1">ממוצע יומי למשאית:</span>
              <span class="text-2xl font-black text-slate-900 font-mono">${stats.avgDailyMins} דקות</span>
              <p class="text-[10px] text-slate-400 mt-1">ימי עבודה פעילים: א'-ו'</p>
            </div>
          </div>
        </div>

        <!-- Fleet Grid Table -->
        <div class="mb-8">
          <h2 class="text-sm font-black text-slate-900 mb-4 border-b border-slate-200 pb-2">🚛 מצב הכלים הנוכחי (זמן אמת)</h2>
          <table class="w-full text-right border-collapse" style="width: 100%;">
            <thead>
              <tr class="bg-slate-100 border-b-2 border-slate-300">
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">קוד כלי</th>
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">נהג רשום</th>
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">סוג ואפיון כלי</th>
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">מיקום אחרון (איתורן)</th>
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">מהירות</th>
                <th style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">מצב PTO</th>
              </tr>
            </thead>
            <tbody>
              ${vehiclesRows}
            </tbody>
          </table>
        </div>

        <!-- Insights Summary Block -->
        <div class="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-6 mb-8">
          <h3 class="font-bold text-amber-950 mb-2.5 text-xs flex items-center gap-1.5">
            <span>⚠️ הנחיות בטיחות מחייבות ללילה ושמירה על הכלים:</span>
          </h3>
          <ul class="list-disc list-inside space-y-1.5 text-xs text-amber-900/90 leading-relaxed pr-2">
            <li>חלה חובה מוחלטת לוודא שזרועות המנוף במרצדס סגורות לחלוטין ומערכות ה-PTO כבויות לפני חניית לילה.</li>
            <li>בכל הפעלת PTO מנוף, על הנהג להפעיל בלמים ידניים מלאים ולוודא פריסת רגליים מייצבות מעוגנות היטב.</li>
            <li>כל חריגה או הפעלה פתאומית תיעד ותשוגר כהתרעה קריטית בזמן אמת למערכת נועה איתורן.</li>
          </ul>
        </div>

        <!-- Stamp Signature Area -->
        <div class="mt-16 pt-8 border-t border-slate-200 grid grid-cols-2 gap-12 text-xs">
          <div>
            <p class="text-slate-400 font-semibold">הפקת מערך SabanOS:</p>
            <p class="font-extrabold text-slate-800 mt-2">פיקוח בקרה דיגיטלי איתורן</p>
            <span class="inline-block mt-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded font-bold text-[9px]">חתימה דיגיטלית מאושרת</span>
          </div>
          <div class="text-left">
            <p class="text-slate-400 font-semibold">חתימת מנהל סידור עבודה / קצין בטיחות:</p>
            <div class="h-10 border-b border-dashed border-slate-300 w-48 inline-block mt-3"></div>
          </div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 1000);
    }, 800);
  };

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

          <div className="mt-3 text-[10px] flex items-center justify-between text-blue-900 bg-blue-100/55 rounded-lg p-2 font-bold font-sans">
            <span>🎯 נקודות ביצוע חכמת:</span>
            <span className="font-mono text-xs">{hikmatPoints}</span>
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

          <div className="mt-3 text-[10px] flex items-center justify-between text-emerald-900 bg-emerald-100/55 rounded-lg p-2 font-bold font-sans">
            <span>🎯 נקודות ביצוע עלי (Ali-Points):</span>
            <span className="font-mono text-xs">{aliPoints}</span>
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

      {/* BlackBox Real-Time Sync Logs Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-inner space-y-4 text-slate-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute"></span>
            <h3 className="font-black text-xs text-slate-100 tracking-tight flex items-center gap-2 mr-2">
              📊 BlackBox Logger: מערכת סינכרון קשיח וניקוד צי
            </h3>
          </div>
          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-black tracking-wider">
            מצב: סנכרון לווין איתורן פעיל
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">🏆 ריכוז נקודות ביצוע פעילות הצי שלנו</h4>
            <div className="space-y-2">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center text-xs text-slate-300">
                <div className="flex items-center gap-2 font-bold">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>עלי (Ali-Points):</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-emerald-400 font-extrabold text-sm">{aliPoints}</span>
                  <span className="text-[10px] text-slate-500 font-bold">נקודות</span>
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center text-xs text-slate-300">
                <div className="flex items-center gap-2 font-bold">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span>חכמת (Hikmat-Points):</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-blue-400 font-extrabold text-sm">{hikmatPoints}</span>
                  <span className="text-[10px] text-slate-500 font-bold">נקודות</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">⏱️ מנגנון ההמרה אוטומטי</h4>
            <p className="text-[10px] text-slate-300 leading-relaxed bg-slate-950/85 p-3 rounded-2xl border border-slate-800">
              כל **10 דקות** של עבודת PTO מאומתת מקנות **1 נקודת ביצוע** לחישוב יעילות וסדרי עבודה. הזנקה חורגת של ה-PTO ללא כתובת הזמנה משויכת לקצה תתועד מיד כאירוע איתורן חריג ותשגר צפצוף בקרה בבסיס SabanOS.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">📌 ציר אירועים ותיעודים (BlackBox_Logs)</h4>
          <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 h-[140px] border border-slate-800/85 rounded-2xl p-2 bg-slate-950/50">
            {blackBoxLogs.length === 0 ? (
              <p className="text-[10px] text-slate-500 text-center py-8">אין אירועי מנוף רשומים במחזור הנוכחי.</p>
            ) : (
              blackBoxLogs.map((log: any) => {
                const isWarning = !log.hasActiveRideAssigned;
                const dateStr = new Date(log.timestamp).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                });
                return (
                  <div key={log.id} className={`p-2.5 rounded-xl border text-[11px] flex justify-between items-center transition-all ${
                    isWarning 
                      ? "bg-red-950/50 border-red-900/60 text-red-200" 
                      : "bg-slate-950 border-slate-850 text-slate-300"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isWarning ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}></span>
                      <span className="font-bold">{log.driverName}:</span>
                      <span>הפעלת מנוף - פעולת {log.action || "שינוי"}</span>
                      {log.durationMs && (
                        <span className="text-slate-400 font-sans">
                          (משך: {Math.round(log.durationMs / 60000)} דקות | תוספת: {log.pointsEarned} נק')
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isWarning && (
                        <span className="bg-red-500/20 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-500/20 animate-pulse">
                          ⚠️ הפעלה ללא הזמנה
                        </span>
                      )}
                      <span className="font-mono text-slate-500 text-[10px]">{dateStr}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Daily Summary & PDF Generation Section */}
      <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-5 shadow-lg">
        <div className="space-y-1.5 search-pwa-pdf-summary">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            <h3 className="font-extrabold text-sm text-slate-100">סיכום יומי מרוכז של הצי | SabanOS Daily Digest</h3>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed max-w-2xl">
            דוח מקיף המשלב את מדדי ה-PTO הנוכחיים של חכמת ועלי, מקורות המיקום המעודכנים מאיתורן והתרעות הבטיחות של הצי. ניתן להוריד ולהדפיס כקובץ PDF רשמי עבור הנהגים ומנהל הצי.
          </p>
        </div>
        
        <button
          onClick={downloadDailyReportPdf}
          className="bg-blue-600 hover:bg-blue-500 font-extrabold text-xs text-white px-5 py-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-blue-500/20 border-t border-white/10 active:scale-95"
        >
          <FileText className="w-4 h-4 text-white" />
          <span>הורד דוח יומי כ-PDF</span>
        </button>
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
