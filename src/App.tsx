import React, { useState, useEffect, useRef } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { 
  Truck, 
  Send, 
  Bell, 
  MapPin, 
  MessageSquare, 
  ShieldAlert, 
  Clock, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Cpu, 
  Terminal, 
  AlertTriangle, 
  CheckCircle,
  History,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Google Maps Platform API key injection
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  "";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "YOUR_API_KEY";

interface VehicleState {
  id: string;
  name: string;
  vehicle: string;
  driver: string;
  latitude: number;
  longitude: number;
  address: string;
  lastUpdated: string;
  ptoState: "open" | "closed" | "unknown";
  status: string;
  pulseActive?: boolean;
}

interface AlertLog {
  id: string;
  timestamp: string;
  vehicle: string;
  driver: string;
  address: string;
  ptoState: string;
  type: "location_update" | "pto_alert" | "critical";
  message: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Map custom styling for a premium tracking experience (Slightly warm/dark silver theme)
const mapStyles = [
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9e9e9" }, { lightnes: 17 }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f5f5f5" }, { lightness: 20 }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }, { lightness: 17 }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#ffffff" }, { lightness: 29 }, { weight: .2 }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }, { lightness: 18 }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#ffffff" }, { lightness: 16 }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#f5f5f5" }, { lightness: 21 }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#f5f5f5" }, { lightness: 19 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#fcfcfc" }, { lightness: 17 }, { weight: 1.2 }] }
];

// Local sound synthesizer to play pristine audio alerts without loading static sound files (prevents network and files error)
const playSonarTone = (type: "location" | "alarm") => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    if (type === "alarm") {
      // Alarm/Alarm Siren Sound (Dual beep frequency)
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.61);
    } else {
      // standard water droplet/radar ping (High quality frequency chime)
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // Perfect high C6 note
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.81);
    }
  } catch (err) {
    console.warn("Unable to play synthesized audio alert", err);
  }
};

/**
 * Controller Component to dynamically reposition/fit map view to active vehicles
 */
function MapViewHandler({ fleet }: { fleet: Record<string, VehicleState> }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !fleet) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    (Object.values(fleet) as VehicleState[]).forEach(v => {
      if (v.latitude && v.longitude) {
        bounds.extend({ lat: v.latitude, lng: v.longitude });
        hasCoords = true;
      }
    });

    if (hasCoords) {
      // Pan with offset padding to view both drivers comfortably
      map.fitBounds(bounds, { top: 80, bottom: 80, left: 80, right: 80 });
    }
  }, [map, fleet]);

  return null;
}

export default function App() {
  const [fleet, setFleet] = useState<Record<string, VehicleState>>({});
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // AI assistant chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "שלום, אני נועה (Noa). מנהלת הצי החכמה שלכם. כיצד אוכל לסייע במעקב וסנכרון המשאיות של חכמת ועלי היום?",
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [aiThinking, setAiThinking] = useState(false);

  // Manual Sandbox simulation form state
  const [simDriver, setSimDriver] = useState<"hikmat" | "ali">("hikmat");
  const [simLatitude, setSimLatitude] = useState("32.0853");
  const [simLongitude, setSimLongitude] = useState("34.7818");
  const [simAddress, setSimAddress] = useState("רחוב אבן גבירול, תל אביב");
  const [simPto, setSimPto] = useState<"open" | "closed">("closed");
  const [simText, setSimText] = useState("");
  const [simulationExpanded, setSimulationExpanded] = useState(false);
  const [systemInfoExpanded, setSystemInfoExpanded] = useState(false);

  const prevFleetRef = useRef<Record<string, VehicleState>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fetch coordinates and timeline alerts
  const fetchFleetData = async () => {
    try {
      const response = await fetch("/api/fleet");
      const data = await response.json();
      if (data && data.fleet) {
        // Detect updates to trigger audio chime and pulsing map animations
        Object.keys(data.fleet).forEach(driverId => {
          const current = data.fleet[driverId] as VehicleState;
          const prev = prevFleetRef.current[driverId];

          if (prev) {
            // Check if coordinates or PTO state was changed
            const coordChanged = prev.latitude !== current.latitude || prev.longitude !== current.longitude;
            const ptoChanged = prev.ptoState !== current.ptoState;

            if (coordChanged || ptoChanged) {
              if (soundEnabled) {
                playSonarTone(current.ptoState === "open" || ptoChanged ? "alarm" : "location");
              }
              // Clear server-side visual ping pulse after 5 seconds
              setTimeout(() => {
                fetch("/api/fleet/clear-pulse", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: driverId })
                });
              }, 6000);
            }
          }
        });

        prevFleetRef.current = data.fleet;
        setFleet(data.fleet);
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error("Failed to fetch fleet coords:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
    // Poll every 4 seconds to simulate active tracking updates
    const interval = setInterval(fetchFleetData, 4000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  // Handle asking AI Assistant Noa
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || aiThinking) return;

    if (!customText) {
      setInputMessage("");
    }

    const newMessage: ChatMessage = {
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    };

    setChatMessages(prev => [...prev, newMessage]);
    setAiThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          chatHistory: chatMessages.slice(-10).map(m => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content
          }))
        })
      });

      const data = await response.json();
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply || "נועה לא זמינה כרגע.",
        timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
      }]);
    } catch (error) {
      console.error("Chat failure:", error);
    } finally {
      setAiThinking(false);
    }
  };

  // Submit mock location webhook simulator (Extremely awesome for testing without actual email trigger)
  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Build mock payload corresponding to Apps Script parser outputs
    const payload = {
      time: new Date().toISOString(),
      vehicle: simDriver === "hikmat" ? "מרצדס מנוף" : "איסוזו משטח",
      driver: simDriver === "hikmat" ? "חכמת" : "עלי",
      latitude: parseFloat(simLatitude),
      longitude: parseFloat(simLongitude),
      address: simAddress,
      ptoState: simPto,
      alertType: simPto === "open" ? "critical" : "location_update",
      text: simText || undefined
    };

    try {
      const response = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const resData = await response.json();
      console.log("Simulated webhook outcome:", resData);
      
      // Update ui instantly
      fetchFleetData();
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setLoading(false);
      setSimText("");
    }
  };

  // Quick Preset Telemeters coords to Israel regions
  const applyPresetCoords = (preset: "telaviv" | "herzliya" | "haifa" | "rishon") => {
    if (preset === "telaviv") {
      setSimLatitude((32.0853 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimLongitude((34.7818 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimAddress("תל אביב - שדרות רוטשילד");
    } else if (preset === "herzliya") {
      setSimLatitude((32.1624 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimLongitude((34.8447 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimAddress("הרצליה פיתוח - רחוב מדינת היהודים");
    } else if (preset === "haifa") {
      setSimLatitude((32.7940 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimLongitude((34.9896 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimAddress("חיפה - איזור נמל ושדרות המגינים");
    } else if (preset === "rishon") {
      setSimLatitude((31.9730 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimLongitude((34.7925 + (Math.random() - 0.5) * 0.01).toFixed(5));
      setSimAddress("ראשון לציון - אזור התעשייה החדש");
    }
  };

  // Predefined suggestion triggers for Assistant Panel
  const chatPlaceholders = [
    { text: "איפה חכמת כרגע?", prompt: "איפה חכמת כרגע ומה המצב של המרצדס שלו?" },
    { text: "מה ההבדל בין חכמת לעלי?", prompt: "תני לי סקירה מקוצרת והשוואה בין הנהגים חכמת ועלי והמשאיות שלהם." },
    { text: "מתי עלי יסיים את ההובלה?", prompt: "על בסיס המיקום הנוכחי של עלי, מתי להערכתך הוא יסיים את עבודת ההובלה ויהיה זמין?" },
    { text: "האם יש התרעות PTO פתוח?", prompt: "בדקי אם יש התרעות חריגות או מצב שבו ה-PTO פתוח בשטח כרגע." }
  ];

  if (!hasValidKey) {
    return (
      <div dir="rtl" className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100 font-sans p-6">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
          <div className="inline-flex p-4 rounded-full bg-blue-500/10 text-blue-400 mb-2">
            <Cpu className="w-12 h-12 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">מפתח גוגל מפות (Google Maps Key) נדרש</h2>
          
          <div className="space-y-4 text-right bg-slate-950 p-6 rounded-2xl text-slate-300 border border-slate-800/60 leading-relaxed text-sm">
            <p className="font-semibold text-white">שלב 1:</p>
            <p className="text-xs">
              עליכם להשיג מפתח פלטפורמה של גוגל מפות:{" "}
              <a 
                href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline transition-colors font-medium break-all"
              >
                https://console.cloud.google.com/google/maps-apis/start
              </a>
            </p>
            
            <p className="font-semibold text-white pt-2">שלב 2: הגדירו את המפתח בסביבה:</p>
            <ul className="list-decimal list-inside space-y-1.5 text-xs text-slate-400 pl-2">
              <li>בפינה הימנית-עליונה, פתחו את תפריט ההגדרות (⚙️ אייקון גלגל השיניים)</li>
              <li>בחרו בלשונית <strong className="text-blue-400">Secrets</strong></li>
              <li>הוסיפו משתנה חדש בשם: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-red-400 font-mono">GOOGLE_MAPS_PLATFORM_KEY</code></li>
              <li>הדביקו את מפתח ה-API שקיבלתם ולחצו על <strong className="text-white">Enter</strong></li>
            </ul>
          </div>
          <p className="text-xs text-slate-500">נועה איתורן תיבנה מחדש ותתחיל לפעול באופן אוטומטי מייד עם הזנת המפתח.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
      
      {/* Dynamic Alert Banner for system state (PTO critical warnings) */}
      <AnimatePresence>
        {(Object.values(fleet) as VehicleState[]).some(v => v.ptoState === "open") && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-600 text-white font-medium py-3 px-6 text-center flex items-center justify-center gap-3 text-sm tracking-wide shadow-md shrink-0 relative z-50"
          >
            <ShieldAlert className="w-5 h-5 animate-bounce" />
            <span>התרעת PTO פעילה: משאית של <strong>{(Object.values(fleet) as VehicleState[]).find(v => v.ptoState === "open")?.driver}</strong> פתוחה ועובדת כעת בשטח!</span>
            <span className="hidden md:inline bg-red-800 px-2 py-0.5 rounded text-xs animate-pulse">קריטי</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white px-6 py-4 shadow-lg border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-2xl shadow-inner text-white flex items-center justify-center">
            <Truck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">נועה איתורן</h1>
              <span className="bg-slate-800 text-blue-400 px-2 py-0.5 rounded-full text-[10px] font-mono border border-blue-500/10">Noa Ituran v1.2</span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">מערכת איתורן לניהול צי חכם, התרעות PTO וצ'אט סיועה של "נועה"</p>
          </div>
        </div>

        {/* System telemetry dashboard row */}
        <div className="flex items-center gap-3 flex-wrap">
          
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              soundEnabled 
                ? "bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-750" 
                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400"
            }`}
            title={soundEnabled ? "השתק צלילי איתורן" : "הפעל צלילי איתורן"}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setSystemInfoExpanded(!systemInfoExpanded)}
            className="bg-slate-800 hover:bg-slate-755 border border-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all"
          >
            <Info className="w-4 h-4 text-slate-400" />
            <span>פרטי פלטפורמה (Apps Script)</span>
          </button>

          <button
            onClick={() => setSimulationExpanded(!simulationExpanded)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/15 border-t border-blue-400/20 transition-all cursor-pointer"
          >
            <Terminal className="w-4 h-4 animate-bounce" />
            <span>סביבת סימולציה ומבחן</span>
          </button>

          <button
            onClick={fetchFleetData}
            className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-755 text-slate-300 rounded-xl transition-all"
            title="רענן נתונים"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 px-3.5 py-2 rounded-xl text-xs font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-300">חיבור איתורן קשיר</span>
          </div>
        </div>
      </header>

      {/* Main Container Grid */}
      <div className="max-w-[1700px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-84px)]">
        
        {/* Dynamic Guide Info Box on Demand */}
        {systemInfoExpanded && (
          <div className="col-span-12 bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-sm text-slate-700 relative overflow-hidden transition-all">
            <button 
              onClick={() => setSystemInfoExpanded(false)}
              className="absolute left-4 top-4 text-blue-500 hover:text-blue-700 text-xs font-bold font-mono bg-blue-100/60 hover:bg-blue-100 px-2 py-1 rounded-lg"
            >
              × סגור מדריך
            </button>
            <h3 className="text-base font-bold text-blue-900 mb-2 flex items-center gap-2">
              <Info className="w-5 h-5" />
              הוראות להטמעת Google Apps Script ב-Gmail
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed text-xs">
              <div>
                <ol className="list-decimal list-inside space-y-2">
                  <li>כנסו ל- <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-semibold">Google Apps Script Console</a>.</li>
                  <li>צרו פרויקט חדש והדביקו את קוד הסקריפט מתוך הקובץ <strong className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">Code.gs</strong> (מצוי בתיקיית השורש של פרויקט זה).</li>
                  <li>עדכנו את המשתנה <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">API_WEBHOOK_URL</code> עם כתובת פרויקט ההתפתחות המוצגת שלכם:</li>
                  <span className="block mt-1 bg-slate-100 hover:bg-slate-200 p-2 rounded text-slate-700 select-all font-mono break-all text-center selection:bg-blue-300">
                    {window.location.origin}/api/webhook
                  </span>
                </ol>
              </div>
              <div className="space-y-2">
                <ol className="list-decimal list-inside space-y-2" start={4}>
                  <li>הגדירו הפעלה מתוזמנת (Trigger) בתוך ה-Apps Script שרצה פעם ב-5 דקות עבור הפונקציה <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">parseIturanEmails</code>.</li>
                  <li>שלחו לעצמכם אימייל בדיקה מכתובת המוגדרת ל- <code className="bg-blue-100 text-red-500 px-1 py-0.5 font-mono">call@ituran.info</code> המכיל את מילות המפתח: "חכמת", "PTO פתוח" וראו את הראדאר מעדכן בזמן אמת!</li>
                </ol>
                <div className="bg-blue-100/80 p-3 rounded-2xl border border-blue-200 text-[11px] text-blue-950">
                  💡 <strong>הערה:</strong> בשל דרישות אבטחת מידע, השרת של נועה איתורן כולל כבר מסד נתונים מקומי מלא וגיבוי של Firestore שמופעל ברקע ישירות, עם תמיכה מלאה בהתרעות OneSignal בהתאם לקונפיגורציית ה-App ID.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Webhook Sandbox simulation form */}
        {simulationExpanded && (
          <div className="col-span-12">
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-2.5 text-white">
                  <Terminal className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-base">סימולטור אירועי איתורן ומשלוח webhook</h3>
                </div>
                <button 
                  onClick={() => setSimulationExpanded(false)}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg text-sm transition-all"
                >
                  הסתר סימולטור ×
                </button>
              </div>

              <form onSubmit={handleSimulateWebhook} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                
                {/* Driver */}
                <div className="space-y-1.5 col-span-1">
                  <label className="text-slate-400 block font-medium">1. נהג וכלי רכב ליעד בדיקה:</label>
                  <select 
                    value={simDriver} 
                    onChange={(e) => {
                      const val = e.target.value as "hikmat" | "ali";
                      setSimDriver(val);
                      // load default driver preset location
                      if (val === "hikmat") {
                        setSimLatitude("32.0853");
                        setSimLongitude("34.7818");
                        setSimAddress("רחוב אבן גבירול, תל אביב");
                      } else {
                        setSimLatitude("32.1624");
                        setSimLongitude("34.8447");
                        setSimAddress("איזור תעשייה הרצליה פיתוח");
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="hikmat">חכמת - מרצדס מנוף (Hikmat)</option>
                    <option value="ali">עלי - איסוזו משטח (Ali)</option>
                  </select>
                </div>

                {/* Coords Lat Lng presets */}
                <div className="space-y-1.5 col-span-1">
                  <label className="text-slate-400 block font-medium">2. בחירה מהירה של נקודה במפה:</label>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("telaviv")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono"
                    >
                      רוטשילד ת"א
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("herzliya")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono"
                    >
                      הרצליה פיתוח
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("haifa")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono"
                    >
                      נמל חיפה
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("rishon")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono"
                    >
                      ראשון לציון
                    </button>
                  </div>
                </div>

                {/* PTO Switcher state */}
                <div className="space-y-1.5 col-span-1">
                  <label className="text-slate-400 block font-medium font-semibold">3. מצב כוח מנוף / PTO:</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSimPto("open")}
                      className={`py-2 rounded-xl text-center font-bold tracking-wide transition-all border ${
                        simPto === "open"
                          ? "bg-red-600 border-red-500 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
                      }`}
                    >
                      🔴 פתוח / עובד בשטח
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimPto("closed")}
                      className={`py-2 rounded-xl text-center font-bold tracking-wide transition-all border ${
                        simPto === "closed"
                          ? "bg-slate-850 border-emerald-600 text-emerald-400"
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
                      }`}
                    >
                      🟢 סגור / בנסיעה
                    </button>
                  </div>
                </div>

                {/* Submit trigger inside simulator */}
                <div className="col-span-1 flex flex-col justify-end">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-900/10 cursor-pointer"
                  >
                    שדר אירוע Webhook ➔
                  </button>
                </div>

                {/* Lat coordinates input */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">קו רוחב (Latitude):</label>
                  <input 
                    type="text" 
                    value={simLatitude}
                    onChange={(e) => setSimLatitude(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono" 
                  />
                </div>

                {/* Lng coordinates input */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">קו אורך (Longitude):</label>
                  <input 
                    type="text" 
                    value={simLongitude}
                    onChange={(e) => setSimLongitude(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono" 
                  />
                </div>

                {/* Address text */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">כתובת מיקום פיזי (עברית):</label>
                  <input 
                    type="text" 
                    value={simAddress}
                    onChange={(e) => setSimAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium" 
                  />
                </div>

                {/* Customize alerts text message inside test tool */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">טקסט התראה מותאם (אופציונלי):</label>
                  <input 
                    type="text" 
                    placeholder="השאירו ריק לעדכון רגיל..."
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600" 
                  />
                </div>

              </form>
            </motion.div>
          </div>
        )}

        {/* Column 1: Live Interactive Tracking Map */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-[550px] lg:h-[650px]">
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col flex-grow overflow-hidden relative">
            
            {/* Map title header widget */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 absolute"></span>
                <h2 className="text-sm font-bold text-slate-800">מפת מעקב איתורן חיה - צי רכב</h2>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                שנה שפה: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-800 font-semibold select-none">עברית (IW)</span>
              </div>
            </div>

            {/* Google map iframe wrapper */}
            <div className="flex-grow w-full rounded-2xl overflow-hidden relative bg-slate-100 border border-slate-200 min-h-0">
              <APIProvider apiKey={API_KEY} version="weekly" language="iw">
                <Map
                  defaultCenter={{ lat: 32.0853, lng: 34.7818 }}
                  defaultZoom={11}
                  mapId="NOA_ITURAN_MAP"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: "100%", height: "100%" }}
                  options={{
                    styles: mapStyles,
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: true
                  }}
                >
                  {/* Dynamic drivers markers */}
                  {(Object.values(fleet) as VehicleState[]).map((drv) => {
                    if (!drv.latitude || !drv.longitude) return null;
                    const isHikmat = drv.id === "hikmat";
                    const isPtoOpen = drv.ptoState === "open";
                    
                    return (
                      <AdvancedMarker
                        key={drv.id}
                        position={{ lat: drv.latitude, lng: drv.longitude }}
                        title={`${drv.driver} - ${drv.ptoState === "open" ? "PTO פתוח" : "סגור"}`}
                      >
                        {/* Interactive dynamic visual radar with pulse ripple effect if location ping is active */}
                        <div className="relative flex items-center justify-center">
                          
                          {/* Radial Pulse Wave Animation (Ituran style) */}
                          {(drv.pulseActive || isPtoOpen) && (
                            <div className={`absolute rounded-full animate-ping duration-1000 ${
                              isPtoOpen ? "w-24 h-24 bg-red-500/30 border border-red-500" : "w-16 h-16 bg-blue-500/25 border border-blue-500"
                            }`} />
                          )}
                          
                          {/* Inner custom styled indicator block (Ituran inspired deep/light blue flags) */}
                          <div className={`shadow-xl px-3.5 py-2.5 rounded-2xl text-[11px] font-bold text-white flex flex-col items-center gap-1 border border-white/40 justify-center transition-all ${
                            isPtoOpen 
                              ? "bg-red-600 animate-bounce" 
                              : isHikmat 
                                ? "bg-[#00509E]" // Ituran classic deep blue
                                : "bg-[#00AEEF] text-slate-900" // Light blue for Ali
                          }`}>
                            <div className="flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">{drv.driver === "חכמת" ? 'حكمت (חכמת)' : 'علي (עלי)'}</span>
                            </div>
                            
                            {/* Short Badge indicating state */}
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-0.5 mt-0.5 ${
                              isPtoOpen ? "bg-red-800 text-white" : "bg-white/20"
                            }`}>
                              {isPtoOpen ? "🔧 PTO פתוח!" : "🚚 בנסיעה"}
                            </span>
                          </div>

                          {/* Dynamic pointer pin pointing exactly to target point */}
                          <div className={`w-3 h-3 rotate-45 border-r border-b border-white/50 -mt-1.5 ${
                            isPtoOpen ? "bg-red-600" : isHikmat ? "bg-[#00509E]" : "bg-[#00AEEF]"
                          }`} />
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* Auto fitting map bound on fleet changes */}
                  <MapViewHandler fleet={fleet} />
                </Map>
              </APIProvider>

              {/* Loader layout overlay */}
              {loading && (
                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all">
                  <div className="bg-white/90 px-4 py-2.5 rounded-2xl shadow-lg border border-slate-200/50 flex items-center gap-3 text-xs font-semibold text-slate-900">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>קושר עם לוויין איתורן...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick map status control strip */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs shrink-0">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#00509E] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                  </div>
                  <span className="font-semibold text-slate-700">חכמת מרצדס:</span>
                </div>
                <span className="bg-slate-200/60 px-2 py-0.5 rounded text-slate-600 text-[10px] font-mono select-all">
                  {fleet.hikmat?.latitude?.toFixed(4)}, {fleet.hikmat?.longitude?.toFixed(4)}
                </span>
                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  fleet.hikmat?.ptoState === "open" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {fleet.hikmat?.ptoState === "open" ? "מנוף עובד ⚒️" : "מנוף סגור 🚚"}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#00AEEF] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                  </div>
                  <span className="font-semibold text-slate-700">עלי איסוזו:</span>
                </div>
                <span className="bg-slate-200/60 px-2 py-0.5 rounded text-slate-600 text-[10px] font-mono select-all">
                  {fleet.ali?.latitude?.toFixed(4)}, {fleet.ali?.longitude?.toFixed(4)}
                </span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">
                  חנייה / בדרך ✔️
                </span>
              </div>
            </div>

          </div>

          {/* Quick Stats overview panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            
            <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400">סה"כ משאיות בצי</h3>
                  <p className="text-2xl font-black text-slate-800 mt-1">2 משאיות</p>
                </div>
                <Truck className="w-8 h-8 text-blue-600/30 absolute left-4 bottom-4" />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">מעקב חכמת (מרצדס) + עלי (איסוזו)</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400">מכשירי איור פתוחים</h3>
                  <p className="text-2xl font-black text-slate-800 mt-1">2 מכשירים</p>
                </div>
                <Cpu className="w-8 h-8 text-emerald-600/30 absolute left-4 bottom-4" />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">מוגדרים פוליגונים לראדאר פנימי</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400">אירועים שנרשמו</h3>
                  <p className="text-2xl font-black text-slate-800 mt-1">{alerts.length} התרעות</p>
                </div>
                <Bell className="w-8 h-8 text-amber-600/30 absolute left-4 bottom-4" />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">סריקת אימיליים מ-call@ituran</p>
            </div>

          </div>

        </div>

        {/* Column 2: Assistant panel, alerts logs feed */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-[550px] lg:h-[650px]">
          
          {/* AI Assistant Chat Widget "Noa" */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col flex-grow overflow-hidden relative">
            
            {/* AI Assistant Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500 text-white font-serif font-black flex items-center justify-center animate-pulse">
                  N
                </div>
                <div>
                  <h3 className="font-bold text-xs">עוזרת הצי החכמה "נועה"</h3>
                  <span className="text-[10px] text-blue-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    מחובר לג'מיני 3.5 פלאש
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className="bg-slate-800 hover:bg-slate-700/60 transition-colors p-1.5 rounded-lg text-slate-300"
                  title="הנחיות צ'אט"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* AI Conversation screen */}
            <div className="flex-grow overflow-y-auto p-4 bg-slate-50 space-y-3.5 min-h-0">
              {chatMessages.map((msg, i) => {
                const isAssistant = msg.role === "assistant";
                return (
                  <div key={i} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs shadow-sm leading-relaxed ${
                      isAssistant 
                        ? "bg-white text-slate-800 border border-slate-200 rounded-tr-none" 
                        : "bg-blue-600 text-white rounded-tl-none"
                    }`}>
                      <p className="whitespace-pre-line font-medium">{msg.content}</p>
                      <div className={`text-[9px] mt-1 text-left ${isAssistant ? "text-slate-400" : "text-blue-200"}`}>
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                );
              })}

              {aiThinking && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-500 border border-slate-200 rounded-2xl p-3 text-xs rounded-tr-none flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-100"></span>
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-200"></span>
                    <span className="text-[10px] pr-1">נועה מחשבת נתיב והגעה...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Chips to communicate with Noa easily */}
            <div className="p-2 border-t border-slate-100 bg-white overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 select-none scrollbar-none">
              {chatPlaceholders.map((pt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(pt.prompt)}
                  disabled={aiThinking}
                  className="bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-[10px] px-2.5 py-1.5 rounded-xl border border-slate-200/50 hover:border-blue-400 transition-all shrink-0 cursor-pointer font-medium"
                >
                  {pt.text}
                </button>
              ))}
            </div>

            {/* Chat Input form */}
            <div className="p-3 border-t border-slate-100 bg-white shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="שאלו את נועה על מצב הצי או הערכת זמנים..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  disabled={aiThinking}
                  className="flex-grow bg-slate-100 placeholder-slate-400 rounded-xl px-4 py-2 text-xs border border-transparent focus:outline-none focus:bg-white focus:border-blue-500 text-slate-800 font-medium"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || aiThinking}
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center shadow-md shadow-blue-500/10"
                >
                  <Send className="w-4 h-4 translate-x-[-1px]" />
                </button>
              </div>
            </div>

          </div>

          {/* Chronological Alert timeline logs */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col h-[280px] shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-bold text-slate-800">היסטוריית אירועים ועדכונים (איתורן)</h3>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-mono">
                {alerts.length} רשומות
              </span>
            </div>

            {/* Logs List SCROLLABLE */}
            <div className="flex-grow overflow-y-auto space-y-3 min-h-0 pr-1">
              {alerts.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  ממתין להתראות ועדכוני מיקום מרשת אימייל...
                </div>
              ) : (
                alerts.map((al) => {
                  const isCritical = al.type === "critical";
                  const isPto = al.type === "pto_alert";
                  const timestampStr = new Date(al.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
                  
                  return (
                    <div 
                      key={al.id} 
                      className={`p-3 rounded-2xl border transition-all text-xs leading-relaxed flex items-start gap-2.5 ${
                        isCritical 
                          ? "bg-red-50 border-red-200 text-red-900" 
                          : isPto
                            ? "bg-amber-50 border-amber-200 text-amber-900"
                            : "bg-slate-50 border-slate-100 text-slate-700"
                      }`}
                    >
                      {/* Badge indicator icon represent event */}
                      <div className="mt-0.5 shrink-0">
                        {isCritical ? (
                          <ShieldAlert className="w-4 h-4 text-red-600" />
                        ) : isPto ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        ) : (
                          <MapPin className="w-4 h-4 text-blue-500 animate-pulse" />
                        )}
                      </div>

                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-bold">
                            {al.driver === "חכמת" ? "חכמת" : al.driver === "עלי" ? "עלי" : al.driver}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono flex items-center gap-0.5">
                            <Clock className="w-3 h-3 text-slate-350" />
                            {timestampStr}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed">{al.message}</p>
                        
                        {/* Address element */}
                        {al.address && (
                          <div className={`mt-1 text-[9px] flex items-center gap-0.5 ${
                            isCritical ? "text-red-700" : "text-slate-450"
                          }`}>
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{al.address}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
