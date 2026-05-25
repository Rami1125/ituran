import React, { useState, useEffect, useRef } from "react";
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
  Info,
  ExternalLink,
  Share2,
  Moon,
  Sun,
  Copy,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import LiveMap from "./components/LiveMap";
import NoaChat from "./components/NoaChat";
import PtoDashboard from "./components/PtoDashboard";
import { VehicleState, AlertLog, ActiveRide, ChatMessage } from "./types";

// Local sound synthesizer and browser-native Audio play to trigger physical alert features
const playSonarTone = (type: "location" | "alarm") => {
  // Mobile Phone vibration pulse pattern for critical PTO alerts
  if (type === "alarm" && "vibrate" in navigator) {
    try {
      // Pulse sequence: vibrate 300ms, pause 100ms, vibrate 300ms, pause 100ms, vibrate 400ms
      navigator.vibrate([300, 100, 300, 100, 400]);
      console.log("[PWA Hardware] Triggered critical PTO alarm physical device vibration");
    } catch (ve) {
      console.warn("Vibration API rejected or ignored by platform constraints:", ve);
    }
  }

  // Attempt to play '/alert.mp3' for alarm, falling back to real synthesizer to bypass autoplay issues
  if (type === "alarm") {
    try {
      const audio = new Audio("/alert.mp3");
      audio.volume = 0.9;
      audio.play()
        .then(() => {
          console.log("[PWA Audio] Playback for alert.mp3 resolved successfully.");
        })
        .catch((audioErr) => {
          console.warn("Browser autoplay blocked /alert.mp3 initially. Falling back to synthesized Web Audio:", audioErr);
          synthesizeSonarTone(type);
        });
    } catch (e) {
      console.warn("HTML5 Audio failed. Falling back to synthesized Web Audio context play:", e);
      synthesizeSonarTone(type);
    }
  } else {
    // Location update plays normal crisp sonar tone
    synthesizeSonarTone(type);
  }
};

// Web Audio backup sound synthesizer
const synthesizeSonarTone = (type: "location" | "alarm") => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    if (type === "alarm") {
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
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      
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

export default function App() {
  const [fleet, setFleet] = useState<Record<string, VehicleState>>({});
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mapTheme, setMapTheme] = useState<"light" | "dark">("light");
  
  // Selection and creation overlays
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);
  const [showRideCreator, setShowRideCreator] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // New ride custom state
  const [newRideDriver, setNewRideDriver] = useState<string>("ali");
  const [newRideCustomer, setNewRideCustomer] = useState<string>("");
  const [newRidePhone, setNewRidePhone] = useState<string>("");
  const [newRideDestName, setNewRideDestName] = useState<string>("");
  const [newRideDestLat, setNewRideDestLat] = useState<string>("32.0674");
  const [newRideDestLng, setNewRideDestLng] = useState<string>("34.7758");
  const [newRideEta, setNewRideEta] = useState<string>("20");
  
  // AI assistant chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "שלום, אני נועה (Noa). מנהלת הצי החכמה שלכם. הדביקו כאן קישור ETA של Waze או Google Maps ואצור מיד קישור מעקב דינמי לשיתוף בווטסאפ ללקוח!",
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
  const [simSpeed, setSimSpeed] = useState("45");
  const [simText, setSimText] = useState("");
  const [simulationExpanded, setSimulationExpanded] = useState(false);
  const [systemInfoExpanded, setSystemInfoExpanded] = useState(false);

  // PWA Add to Home Screen / Install prompt behavior state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS to show customized 'Add to Home Screen' safari helper guide
    const iosDetect = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iosDetect);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic installation prompt popups by default
      e.preventDefault();
      // Store the installation event
      setDeferredPrompt(e);
      // Reveal the beautiful sliding banner to the user
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);

    // Show banner on iOS if loaded within standard browser to assist installation setup
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (iosDetect && !isStandalone) {
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        alert("על מנת להתקין את SabanOS באייפון:\n1. לחצו על לחצן השיתוף (Share) בתחתית דפדפן ה-Safari.\n2. גללו מטה ובחרו ב-'הוסף למסך הבית' (Add to Home Screen)!\n3. אשרו את ההוספה כדי לקבל גישה מלאה.");
      } else {
        alert("תפריט התקנה מקוון זמין ישירות דרך כפתור שלוש הנקודות בדפדפן הנייד שלכם במכשירי Android!");
      }
      return;
    }
    // Show installation popup dialog
    deferredPrompt.prompt();
    // Await user's confirmation
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation challenge response outcome: ${outcome}`);
    // Reset stored event
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const prevFleetRef = useRef<Record<string, VehicleState>>({});

  // Parse path to see if this is raw customer tracking screen
  const pathname = window.location.pathname;
  const isCustomerTrackMode = pathname.includes("/track/");
  const trackRideId = isCustomerTrackMode ? pathname.split("/track/")[1] : null;

  // Single customer tracking ride data
  const [customerRide, setCustomerRide] = useState<ActiveRide | null>(null);
  const [customerDriver, setCustomerDriver] = useState<VehicleState | null>(null);

  const fetchFleetData = async () => {
    try {
      const response = await fetch("/api/fleet");
      const data = await response.json();
      if (data && data.fleet) {
        Object.keys(data.fleet).forEach(driverId => {
          const current = data.fleet[driverId] as VehicleState;
          const prev = prevFleetRef.current[driverId];

          if (prev) {
            const coordChanged = prev.latitude !== current.latitude || prev.longitude !== current.longitude;
            const ptoChanged = prev.ptoState !== current.ptoState;

            if (coordChanged || ptoChanged) {
              if (soundEnabled && !isCustomerTrackMode) {
                playSonarTone(current.ptoState === "open" || ptoChanged ? "alarm" : "location");
              }
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
        setRides(data.activeRides ? Object.values(data.activeRides) : []);

        if (data.chatHistory && data.chatHistory.length > 0) {
          setChatMessages((prev) => {
            const backendMsgs = data.chatHistory;
            const lastPrev = prev[prev.length - 1];
            const lastBackend = backendMsgs[backendMsgs.length - 1];
            if (
              prev.length !== backendMsgs.length ||
              (lastPrev && lastBackend && lastPrev.content !== lastBackend.content)
            ) {
              return backendMsgs;
            }
            return prev;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch fleet coords:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleTrackRide = async () => {
    if (!trackRideId) return;
    try {
      const resp = await fetch(`/api/rides/${trackRideId}`);
      if (resp.ok) {
        const resData = await resp.json();
        setCustomerRide(resData.ride);
        setCustomerDriver(resData.driver);
      }
    } catch (e) {
      console.error("Error fetching customer ride details", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isCustomerTrackMode) {
      fetchSingleTrackRide();
      const intv = setInterval(fetchSingleTrackRide, 4000);
      return () => clearInterval(intv);
    } else {
      fetchFleetData();
      const intv = setInterval(fetchFleetData, 4000);
      return () => clearInterval(intv);
    }
  }, [soundEnabled, pathname]);

  const triggerCopyNotification = (key: string) => {
    setCopyFeedback(key);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

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
            role: m.role || "user",
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
      
      // Update data immediately if Noa parsed and created a ride
      fetchFleetData();
    } catch (error) {
      console.error("Chat failure:", error);
    } finally {
      setAiThinking(false);
    }
  };

  const handleTriggerDailySummary = async () => {
    if (aiThinking) return;
    setAiThinking(true);

    const userEntry: ChatMessage = {
      role: "user",
      content: "הפיקי נא סיכום יומי של פעילות הצי להיום לשעה 18:00.",
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    };

    setChatMessages((prev) => [...prev, userEntry]);

    try {
      const response = await fetch("/api/test-summary", {
        method: "POST"
      });
      const data = await response.json();
      if (data.success && data.data) {
        setChatMessages((prev) => [...prev, data.data]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "סליחה, נתקלתי בבעיה בייצור הסיכום היומי: " + (data.error || "שגיאה לא ידועה"),
            timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }
      fetchFleetData();
    } catch (error) {
      console.error("Test summary generation failure:", error);
    } finally {
      setAiThinking(false);
    }
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      time: new Date().toISOString(),
      vehicle: simDriver === "hikmat" ? "מרצדס מנוף" : "איסוזו משטח",
      driver: simDriver === "hikmat" ? "חכמת" : "עלי",
      latitude: parseFloat(simLatitude),
      longitude: parseFloat(simLongitude),
      address: simAddress,
      speed: parseInt(simSpeed) || 0,
      ptoState: simPto,
      alertType: simPto === "open" ? "critical" : "location_update",
      text: simText || undefined
    };

    try {
      await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      fetchFleetData();
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setLoading(false);
      setSimText("");
    }
  };

  const handleCreateRide = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: newRideDriver,
          customerName: newRideCustomer || "לקוח קצה",
          customerPhone: newRidePhone,
          destinationName: newRideDestName || "כתובת הלקוח",
          destinationLatitude: parseFloat(newRideDestLat) || 32.0674,
          destinationLongitude: parseFloat(newRideDestLng) || 34.7758,
          etaMinutes: parseInt(newRideEta) || 20
        })
      });
      setShowRideCreator(false);
      setNewRideCustomer("");
      setNewRidePhone("");
      setNewRideDestName("");
      fetchFleetData();
    } catch (e) {
      console.error(e);
    }
  };

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

  // ----------------------------------------------------
  // BRANCH 1: Customer View (Read only route /track/:id)
  // ----------------------------------------------------
  if (isCustomerTrackMode) {
    if (loading && !customerRide) {
      return (
        <div dir="rtl" className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
          <div className="text-center space-y-4">
            <RefreshCw className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
            <p className="text-sm font-semibold tracking-wide text-slate-300">יוצר קשר מאובטח עם הלוויין איתורן...</p>
          </div>
        </div>
      );
    }

    if (!customerRide) {
      return (
        <div dir="rtl" className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100 font-sans p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-black text-white mb-2">מעקב משלוח לא פעיל</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              הקישור פג תוקף, הושלם או בוטל על ידי מנהל העבודה. אנא פנה לתמיכה לקבלת קישור מעקב עדכני.
            </p>
            <a href="/" className="inline-block w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-bold transition-all">
              חזרה לדף הבית
            </a>
          </div>
        </div>
      );
    }

    const assignedDriverVal = fleet[customerRide.driverId] || customerDriver;

    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col relative overflow-hidden">
        {/* Simple top glowing strip resembling top track quality */}
        <div className="bg-slate-900 border-b border-slate-850 px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-tight">מעקב הובלה חי של נועה איתורן</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">לקוח: <strong>{customerRide.customerName}</strong></p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-950 border border-slate-800/80 px-3 py-1.5 rounded-xl font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>לוויין משדר חי</span>
          </div>
        </div>

        {/* Dynamic Map and Customer Info Overlay Container */}
        <div className="flex-grow w-full h-[calc(100vh-160px)] relative min-h-0 bg-slate-950 flex flex-col">
          {assignedDriverVal && (
            <LiveMap 
              vehicles={[assignedDriverVal]} 
              selectedVehicleId={assignedDriverVal.id} 
              activeRide={customerRide}
              theme="dark"
            />
          )}

          {/* Floating Premium glass card showing track stats */}
          <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-auto md:max-w-md bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-5 shadow-2xl z-40 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">משאית מנותבת</span>
                <h3 className="text-base font-extrabold text-white mt-1.5">{assignedDriverVal?.driver || "נהג הובלה מקצועי"} בסירטון</h3>
                <p className="text-[11px] text-slate-400 mt-1">רכב: {assignedDriverVal?.vehicle}</p>
              </div>
              <div className="bg-slate-950 px-3 py-2.5 rounded-2xl text-center border border-slate-800 min-w-[70px]">
                <Clock className="w-4 h-4 text-amber-500 mx-auto mb-1 animate-pulse" />
                <span className="text-lg font-black text-white block leading-none">{customerRide.etaMinutes}</span>
                <span className="text-[9px] text-slate-500">דקות הגעה</span>
              </div>
            </div>

            <hr className="border-slate-800" />

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 font-sans">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 block">מיקום נוכחי מעודכן:</span>
                <span className="font-semibold block truncate">📍 {assignedDriverVal?.address || "גוש דן, ישראל"}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 block">מהירות ותנועה:</span>
                <span className="font-semibold block">{assignedDriverVal?.speed || 0} קמ"ש בנסיעה</span>
              </div>
            </div>

            {assignedDriverVal?.ptoState === "open" && (
              <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-2xl flex items-center gap-2.5 text-xs text-red-300">
                <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse shrink-0" />
                <span><strong>עצירה עקב עבודה:</strong> כרגע ה-PTO פתוח והמנוף פועל בשטח. המשאית תמשיך בנתיב עם סיום הפעילות.</span>
              </div>
            )}

            <div className="flex gap-2 text-xs font-bold pt-1">
              <a 
                href={customerRide.wazeLink || "https://waze.com"} 
                target="_blank" 
                rel="no_referrer_or_origin"
                className="flex-grow bg-blue-600 hover:bg-blue-500 text-center text-white py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>נווט אל הנהג ב-Waze</span>
              </a>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  triggerCopyNotification("track_link");
                }}
                className="bg-slate-800 hover:bg-slate-755 text-slate-300 px-4 rounded-xl flex items-center justify-center transition-all border border-slate-700 font-medium"
              >
                {copyFeedback === "track_link" ? "הועתק! ✓" : <Share2 className="w-4 h-4" />}
              </button>
            </div>
            
            <p className="text-[9px] text-slate-500 text-center">מערכת קשורה איתורן. כל הזכויות שמורות לחברה.</p>
          </div>
        </div>

        {/* Footer info banner */}
        <footer className="bg-slate-900 border-t border-slate-850 py-3 text-xs text-center text-slate-400 capitalize">
          Noa Ituran - Public Encrypted Live Tracking Layer v1.2
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // BRANCH 2: Complete Manager Dashboard (RTL Hebrew)
  // ----------------------------------------------------
  const vehiclesList = Object.values(fleet) as VehicleState[];

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
      
      {/* Alert Banner for system state (PTO critical warnings) */}
      <AnimatePresence>
        {vehiclesList.some(v => v.ptoState === "open") && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-600 text-white font-medium py-3 px-6 text-center flex items-center justify-center gap-3 text-sm tracking-wide shadow-md shrink-0 relative z-50 animate-pulse"
          >
            <ShieldAlert className="w-5 h-5 animate-bounce" />
            <span>התרעת PTO פעילה: משאית של <strong>{vehiclesList.find(v => v.ptoState === "open")?.driver}</strong> פתוחה ועובדת כעת בשטח!</span>
            <span className="hidden md:inline bg-red-850 px-2 py-0.5 rounded text-xs">קריטי</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white px-6 py-4 shadow-lg border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-2xl shadow-inner text-white flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">נועה איתורן</h1>
              <span className="bg-slate-800 text-blue-400 px-2 py-0.5 rounded-full text-[10px] font-mono border border-blue-500/10">v1.2</span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">ניהול צי חכם, התרעות PTO וצ'אט סיועה של "נועה" (100% מפות חינם)</p>
          </div>
        </div>

        {/* Global Action strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            onClick={() => setMapTheme(mapTheme === "light" ? "dark" : "light")}
            className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-755 text-slate-300 rounded-xl transition-all"
            title={mapTheme === "light" ? "החלף למפת כהה" : "החלף למפת בהיר"}
          >
            {mapTheme === "light" ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
              soundEnabled 
                ? "bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-755" 
                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400"
            }`}
            title={soundEnabled ? "השתק צלילי איתורן" : "הפעל צלילי איתורן"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setSystemInfoExpanded(!systemInfoExpanded)}
            className="bg-slate-800 hover:bg-slate-755 border border-slate-700 text-slate-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer font-semibold"
          >
            <Info className="w-4 h-4 text-slate-400" />
            <span>פרטי פלטפורמה (Apps Script)</span>
          </button>

          <button
            onClick={() => setSimulationExpanded(!simulationExpanded)}
            className="bg-slate-800 border border-slate-700 hover:bg-slate-755 text-slate-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer font-semibold"
          >
            <Terminal className="w-4 h-4" />
            <span>סביבת סימולציה</span>
          </button>

          <button
            onClick={() => setShowRideCreator(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg hover:shadow-blue-900/10 transition-all cursor-pointer border-t border-white/25"
          >
            <Plus className="w-4 h-4" />
            <span>פתח מעקב לקוח חדש</span>
          </button>

          <button
            onClick={fetchFleetData}
            className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-755 text-slate-300 rounded-xl transition-all"
            title="רענן נתונים"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 px-3.5 py-2.5 rounded-xl text-xs font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-300">לוויין מקושר</span>
          </div>
        </div>
      </header>

      {/* Main Container Grid */}
      <div className="max-w-[1700px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-84px)]">
        
        {/* Apps Script Guide */}
        {systemInfoExpanded && (
          <div className="col-span-12 bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-sm text-slate-700 relative overflow-hidden transition-all">
            <button 
              onClick={() => setSystemInfoExpanded(false)}
              className="absolute left-4 top-4 text-blue-500 hover:text-blue-700 text-xs font-bold font-mono bg-blue-100/60 hover:bg-blue-100 px-2 py-1 rounded-lg cursor-pointer"
            >
              × סגור מדריך
            </button>
            <h3 className="text-base font-bold text-blue-900 mb-2 flex items-center gap-2">
              <Info className="w-5 h-5" />
              הוראות להטמעת Google Apps Script ב-Gmail לזיהוי Email מ-Ituran
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed text-xs">
              <div>
                <ol className="list-decimal list-inside space-y-2">
                  <li>פתחו את <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-semibold">Google Apps Script Console</a>.</li>
                  <li>צרו פרויקט חדש והדביקו את קוד הסקריפט מתוך הקובץ <strong className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">Code.gs</strong> שמצוי בתיקיית השורש.</li>
                  <li>עדכנו את המשתנה <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">API_WEBHOOK_URL</code> עם הכתובת הבאה:</li>
                  <span className="block mt-1 bg-slate-100 hover:bg-slate-200 p-2 rounded text-slate-700 select-all font-mono break-all text-center">
                    {window.location.origin}/api/webhook
                  </span>
                </ol>
              </div>
              <div className="space-y-2">
                <ol className="list-decimal list-inside space-y-2" start={4}>
                  <li>הגדירו טריגר (Trigger) בתוך ה-Apps Script שרץ פעם ב-5 דקות עבור הפונקציה <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">parseIturanEmails</code>.</li>
                  <li>הסקריפט יקרא מיילים לא קרואים מ- <code className="bg-blue-100 text-red-500 px-1 py-0.5 font-mono">call@ituran.info</code> המכילים את המילים "חכמת", "עלי", "PTO פתוח" ויעדכן את הסמן החי במפה מיד!</li>
                </ol>
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
                  <h3 className="font-bold text-base">סימולטור אירועי איתורן (שינוי מיקום / PTO)</h3>
                </div>
                <button 
                  onClick={() => setSimulationExpanded(false)}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg text-sm transition-all cursor-pointer"
                >
                  הסתר סימולטור ×
                </button>
              </div>

              <form onSubmit={handleSimulateWebhook} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Driver */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block font-medium">1. נהג מטרה:</label>
                  <select 
                    value={simDriver} 
                    onChange={(e) => {
                      const val = e.target.value as "hikmat" | "ali";
                      setSimDriver(val);
                      if (val === "hikmat") {
                        setSimLatitude("32.0853");
                        setSimLongitude("34.7818");
                        setSimAddress("רחוב אבן גבירול, תל אביב");
                        setSimSpeed("45");
                      } else {
                        setSimLatitude("32.1624");
                        setSimLongitude("34.8447");
                        setSimAddress("איזור תעשייה הרצליה פיתוח");
                        setSimSpeed("0");
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="hikmat">חכמת - מרצדס מנוף</option>
                    <option value="ali">עלי - איסוזו משטח</option>
                  </select>
                </div>

                {/* Preset positions */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block font-medium">2. בחירת נקודה מוגדרת במפה:</label>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("telaviv")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono cursor-pointer"
                    >
                      שדרות רוטשילד
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("herzliya")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono cursor-pointer"
                    >
                      הרצליה פיתוח
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("haifa")}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono cursor-pointer"
                    >
                      נמל חיפה
                    </button>
                    <button 
                      type="button" 
                      onClick={() => applyPresetCoords("rishon")}
                      className="bg-slate-805 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded-lg border border-slate-700/60 transition-all font-mono cursor-pointer"
                    >
                      ראשון לציון
                    </button>
                  </div>
                </div>

                {/* PTO Toggle */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 block font-medium">3. מצב מנוף בשטח (PTO):</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSimPto("open")}
                      className={`py-2 rounded-xl text-center font-bold border transition-all cursor-pointer ${
                        simPto === "open"
                          ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-500/10"
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
                      }`}
                    >
                      🔴 עובד (פתוח)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimPto("closed")}
                      className={`py-2 rounded-xl text-center font-bold border transition-all cursor-pointer ${
                        simPto === "closed"
                          ? "bg-slate-850 border-emerald-600 text-emerald-400"
                          : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400"
                      }`}
                    >
                      🟢 סגור
                    </button>
                  </div>
                </div>

                {/* Submit trigger inside simulator */}
                <div className="flex flex-col justify-end">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-950/10 cursor-pointer text-xs"
                  >
                    שדר אירוע איתורן חי ➔
                  </button>
                </div>

                {/* Coords */}
                <div className="space-y-1">
                  <label className="text-slate-400 block text-[10px]">קו רוחב (Latitude):</label>
                  <input type="text" value={simLatitude} onChange={(e) => setSimLatitude(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block text-[10px]">קו אורך (Longitude):</label>
                  <input type="text" value={simLongitude} onChange={(e) => setSimLongitude(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block text-[10px]">מהירות (קמ"ש):</label>
                  <input type="number" value={simSpeed} onChange={(e) => setSimSpeed(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block text-[10px]">כתובת פיזית:</label>
                  <input type="text" value={simAddress} onChange={(e) => setSimAddress(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-medium" />
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Create Ride Modal overlay */}
        {showRideCreator && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">יצירת כרטיס מעקב פומבי ללקוח קצה</h3>
                <button 
                  onClick={() => setShowRideCreator(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreateRide} className="space-y-4 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold">שייך נהג למשימה:</label>
                    <select 
                      value={newRideDriver} 
                      onChange={(e) => setNewRideDriver(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none"
                    >
                      <option value="ali">עלי - איסוזו משטח</option>
                      <option value="hikmat">חכמת - מרצדס מנוף</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold">שם הלקוח:</label>
                    <input 
                      type="text" 
                      placeholder="לדוגמא: אברהם כהן"
                      value={newRideCustomer}
                      onChange={(e) => setNewRideCustomer(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold">טלפון לקוח (עבור WhatsApp):</label>
                    <input 
                      type="text" 
                      placeholder="054-XXXXXXX"
                      value={newRidePhone}
                      onChange={(e) => setNewRidePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold">זמן הגעה מוערך (דקות ל-ETA):</label>
                    <input 
                      type="number" 
                      value={newRideEta}
                      onChange={(e) => setNewRideEta(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono" 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold">שם כתובת היעד (עברית):</label>
                  <input 
                    type="text" 
                    placeholder="לדוגמא: שדרות בנימין 12, נתניה"
                    value={newRideDestName}
                    onChange={(e) => setNewRideDestName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono text-[11px] text-slate-500">
                  <div className="space-y-1">
                    <label className="font-bold">יעד קו רוחב LAT:</label>
                    <input type="text" value={newRideDestLat} onChange={(e) => setNewRideDestLat(e.target.value)} className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5" />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold">יעד קו אורך LNG:</label>
                    <input type="text" value={newRideDestLng} onChange={(e) => setNewRideDestLng(e.target.value)} className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5" />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg text-xs cursor-pointer"
                >
                  צור קישור מעקב ושדר כעת
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Column 1: Live Interactive Tracking Map */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-[550px] lg:h-[650px]">
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col flex-grow overflow-hidden relative">
            
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 absolute"></span>
                <h2 className="text-sm font-bold text-slate-800">מפת איתורן לניהול צי חכם - {mapTheme === "light" ? "מפה בהירה" : "מפת לילה"}</h2>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                מערכת שילוב: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-800 font-semibold select-none">עברית RTL</span>
              </div>
            </div>

            {/* Premium free Leaflet Map wrapper */}
            <div className="flex-grow w-full rounded-2xl overflow-hidden relative bg-slate-100 border border-slate-200 min-h-0">
              <LiveMap 
                vehicles={vehiclesList} 
                selectedVehicleId={selectedVehicleId}
                onVehicleSelect={(v) => setSelectedVehicleId(v.id)}
                theme={mapTheme}
              />

              {loading && (
                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all pointer-events-none">
                  <div className="bg-white/95 px-4 py-2.5 rounded-2xl shadow-lg border border-slate-200/50 flex items-center gap-3 text-xs font-semibold text-slate-900">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>מתחבר ללוויין איתורן...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick controllers for drivers */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs shrink-0">
              {vehiclesList.map(v => {
                const isPto = v.ptoState === "open";
                return (
                  <div 
                    key={v.id} 
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all ${
                      selectedVehicleId === v.id ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        v.id === "hikmat" ? "bg-blue-600" : "bg-emerald-600"
                      }`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                      </div>
                      <span className="font-bold text-slate-700">{v.driver}:</span>
                    </div>
                    <span className="bg-slate-200/60 px-2 py-0.5 rounded text-slate-600 text-[10px] font-mono select-all">
                      {v.latitude?.toFixed(4)}, {v.longitude?.toFixed(4)}
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      isPto ? "bg-red-100 text-red-700 animate-pulse" : "bg-slate-200/55 text-slate-600"
                    }`}>
                      {isPto ? "מנוף פתוח 🛠️" : "בנסיעה 🚚"}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Quick Active Customer Rides Tracking Panel inside dashboard */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm shrink-0 space-y-3.5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <History className="w-4.5 h-4.5 text-blue-600" />
                רשימת נסיעות לקוח פעילות וקישורי מעקב WhatsApp
              </h3>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-bold">
                {rides.length} פעילות
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[140px] overflow-y-auto">
              {rides.length === 0 ? (
                <div className="col-span-2 text-center text-slate-400 text-xs py-4">
                  אין כרטיסי לקוח פעילים. השתמשו בכפתור "פתח מעקב לקוח חדש" או הדביקו קישור ETA בצ'אט של נועה.
                </div>
              ) : (
                rides.map(r => {
                  const trackingUrl = `${window.location.origin}/track/${r.id}`;
                  const waMessage = `הנהג שלנו ${r.driverId === "hikmat" ? "חכמת" : "עלי"} בדרך אליך! למעקב בזמן אמת: ${trackingUrl}`;
                  const waLink = `https://wa.me/${r.customerPhone ? r.customerPhone.replace(/[^0-9]/g, "") : ""}?text=${encodeURIComponent(waMessage)}`;

                  return (
                    <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs leading-relaxed flex flex-col justify-between space-y-2 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-extrabold text-slate-900">{r.customerName} ({r.customerPhone || "ללא טלפון"})</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">📍 {r.destinationName}</p>
                          <span className="text-[9px] text-slate-400 block mt-1 font-mono">נהג: {r.driverId === "hikmat" ? "חכמת" : "עלי"} | ETA: {r.etaMinutes} דקות</span>
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(trackingUrl);
                            triggerCopyNotification(r.id);
                          }}
                          className="bg-white border border-slate-200/85 hover:bg-slate-100 p-1.5 rounded-lg text-slate-500 tracking-tight text-[10px] flex items-center gap-1 transition-all cursor-pointer font-bold shrink-0"
                        >
                          {copyFeedback === r.id ? "הועתק! ✓" : <><Copy className="w-3 h-3" /> העתק קישור</>}
                        </button>
                      </div>

                      <div className="flex gap-2 text-[10px] pt-1 border-t border-slate-150">
                        <a 
                          href={waLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-grow bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-center flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>שתף ל-WhatsApp</span>
                        </a>
                        <a 
                          href={`/track/${r.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-200/70 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-1.5 rounded-lg flex items-center justify-center shrink-0"
                          title="תצוגת לקוח חי"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Column 2: Assistant panel, alerts logs feed */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-[550px] lg:h-[650px]">
          
          {/* AI Assistant Chat Widget "Noa" */}
          <div className="flex flex-col flex-grow min-h-0">
            <NoaChat 
              chatMessages={chatMessages}
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              aiThinking={aiThinking}
              onSendMessage={handleSendMessage}
              chatOpen={chatOpen}
              setChatOpen={setChatOpen}
              onTriggerDailySummary={handleTriggerDailySummary}
            />
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
                        
                        {al.address && (
                          <div className={`mt-1 text-[9px] flex items-center gap-0.5 ${
                            isCritical ? "text-red-700" : "text-slate-400"
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

        {/* PTO Patterns Weekly Analysis Dashboard */}
        <div className="col-span-12 mt-4">
          <PtoDashboard fleet={fleet} />
        </div>

      </div>

      {/* Dynamic PWA Mobile Add to Home Screen Glass Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-3xl p-5 shadow-2xl z-50 text-white flex flex-col gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg">
                  <Truck className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white">התקן את אפליקציית SabanOS</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">קבלו התרעות פוש בזמן אמת, צלילים וויברציות ישירות למכשיר!</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInstallBanner(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold p-1 cursor-pointer"
              >
                ×
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={handleInstallClick}
                className="flex-grow bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer shadow-md border-t border-white/10"
              >
                <span>התקן כעת</span>
              </button>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="bg-slate-800 hover:bg-slate-755 text-slate-300 font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer border border-slate-705"
              >
                מאוחר יותר
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
