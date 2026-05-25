import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, addDoc } from "firebase/firestore";

// Initialize express app
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Local database path with safe Vercel /tmp fallback
const isVercel = !!process.env.VERCEL;
const DB_FILE = isVercel
  ? path.join("/tmp", "fleet_db.json")
  : path.join(process.cwd(), "fleet_db.json");

interface VehicleState {
  id: string; // "hikmat" or "ali"
  name: string;
  vehicle: string;
  driver: string;
  latitude: number;
  longitude: number;
  address: string;
  lastUpdated: string;
  ptoState: "open" | "closed" | "unknown";
  status: string;
  speed: number;
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

interface ActiveRide {
  id: string;
  driverId: string;
  customerName: string;
  customerPhone?: string;
  destinationName: string;
  destinationLatitude: number;
  destinationLongitude: number;
  etaMinutes: number;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  wazeLink?: string;
}

// Initial mock data
const initialFleet: Record<string, VehicleState> = {
  hikmat: {
    id: "hikmat",
    name: "חכמת (מרצדס מנוף)",
    vehicle: "מרצדס מנוף - מספר שילדה 992817",
    driver: "חכמת (Hikmat)",
    latitude: 32.0853,
    longitude: 34.7818,
    address: "רחוב אבן גבירול, תל אביב",
    lastUpdated: new Date().toISOString(),
    ptoState: "closed",
    status: "פעיל",
    speed: 42
  },
  ali: {
    id: "ali",
    name: "עלי (איסוזו משטח)",
    vehicle: "איסוזו משטח - מספר שילדה 882731",
    driver: "עלי (Ali)",
    latitude: 32.1624,
    longitude: 34.8447,
    address: "איזור תעשייה הרצליה פיתוח",
    lastUpdated: new Date().toISOString(),
    ptoState: "closed",
    status: "ממתין לעבודה",
    speed: 0
  }
};

let dbState: { 
  fleet: Record<string, VehicleState>; 
  alerts: AlertLog[];
  activeRides: Record<string, ActiveRide>;
} = {
  fleet: { ...initialFleet },
  alerts: [
    {
      id: "init_1",
      timestamp: new Date().toISOString(),
      vehicle: "مرسيدס كرين",
      driver: "حكمت",
      address: "תחנת מוצא, תל אביב",
      ptoState: "closed",
      type: "location_update",
      message: "המערכת אותחלה בהצלחה. נועה איתורן מוכנה למעקב."
    }
  ],
  activeRides: {
    "ride_ali_demo": {
      id: "ride_ali_demo",
      driverId: "ali",
      customerName: "משה כהן",
      customerPhone: "054-1234567",
      destinationName: "שדרות רוטשילד 30, תל אביב",
      destinationLatitude: 32.0674,
      destinationLongitude: 34.7758,
      etaMinutes: 22,
      status: "active",
      createdAt: "2026-05-25T00:00:00.000Z",
      wazeLink: "https://waze.com/ul?ll=32.0674,34.7758&navigate=yes"
    }
  }
};

// Load from file if exists
try {
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    dbState = JSON.parse(data);
    console.log("Loaded system state from local DB file.");
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2));
  }
} catch (error) {
  console.error("Failed to read/write DB file, using memory DB.", error);
}

const saveLocalDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2));
  } catch (error) {
    console.error("Failed to save state to local DB", error);
  }
};

// Lazy Firebase Setup (If manual credentials are provided or generated)
let firebaseApp: any = null;
let firestoreDb: any = null;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase initialized successfully in Express backend.");
  }
} catch (error) {
  console.log("Firebase not initialized. Running on local DB layer.", error);
}

// Function to sync server write with Web Firestore if available
const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  if (!firestoreDb) return;
  try {
    if (docId) {
      await setDoc(doc(firestoreDb, collectionName, docId), data);
    } else {
      await addDoc(collection(firestoreDb, collectionName), data);
    }
    console.log(`Synced successfully to Firestore: ${collectionName}/${docId || "new"}`);
  } catch (error) {
    console.error("Firestore sync failed:", error);
  }
};

// Lazy GoogleGenAI setup
let aiInstance: GoogleGenAI | null = null;
const getGeminiClient = (): GoogleGenAI => {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not defined in environment variables. Gemini calls will fail.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
};

// OneSignal Push Notification trigger helper
const triggerOneSignalPush = async (alertMessage: string, ptoState: string, driver: string) => {
  const oneSignalAppId = process.env.ONESIGNAL_APP_ID || "MOCK_APP_ID";
  const oneSignalApiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!oneSignalApiKey) {
    console.log("OneSignal push skipped (ONESIGNAL_REST_API_KEY is not configured). Message:", alertMessage);
    return;
  }

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${oneSignalApiKey}`
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        contents: { en: alertMessage, he: alertMessage },
        headings: { en: `Ituran Alert: ${driver}`, he: `התרעת איתורן: ${driver}` },
        subtitle: { en: `PTO is now ${ptoState}`, he: `מצב PTO שונה ל-${ptoState === "open" ? "פתוח" : "סגור"}` },
        data: { driver, ptoState, timestamp: new Date().toISOString() },
        included_segments: ["All"]
      })
    });
    const resData = await response.json();
    console.log("OneSignal push response:", resData);
  } catch (error) {
    console.error("Failed to trigger OneSignal notification:", error);
  }
};

/* Endpoints */

// 0. Rides API: Management endpoints for customer tracking rides
app.get("/api/rides", (req, res) => {
  res.json({ success: true, rides: Object.values(dbState.activeRides || {}) });
});

app.get("/api/rides/:id", (req, res) => {
  const ride = dbState.activeRides ? dbState.activeRides[req.params.id] : null;
  if (!ride) {
    return res.status(404).json({ error: "מעקב נסיעה לא נמצא" });
  }
  const driver = dbState.fleet[ride.driverId];
  res.json({ success: true, ride, driver });
});

app.post("/api/rides", async (req, res) => {
  const { 
    driverId, 
    customerName, 
    customerPhone, 
    destinationName, 
    destinationLatitude, 
    destinationLongitude, 
    etaMinutes 
  } = req.body;

  const id = `ride_${Date.now()}`;
  const dLat = parseFloat(destinationLatitude) || 32.0853;
  const dLng = parseFloat(destinationLongitude) || 34.7818;

  const newRide: ActiveRide = {
    id,
    driverId: driverId || "ali",
    customerName: customerName || "לקוח קצה",
    customerPhone: customerPhone || "",
    destinationName: destinationName || "מיקום כללי",
    destinationLatitude: dLat,
    destinationLongitude: dLng,
    etaMinutes: parseInt(etaMinutes) || 15,
    status: "active",
    createdAt: new Date().toISOString(),
    wazeLink: `https://waze.com/ul?ll=${dLat},${dLng}&navigate=yes`
  };

  if (!dbState.activeRides) {
    dbState.activeRides = {};
  }
  dbState.activeRides[id] = newRide;
  saveLocalDb();

  await syncToFirestore("activeRides", id, newRide);

  res.json({ success: true, ride: newRide });
});

// 1. Webhook Endpoint: Handles Firestore logs and triggers OneSignal API
app.post("/api/webhook", async (req, res) => {
  console.log("Received Webhook Data:", req.body);
  const { time, vehicle, driver, latitude, longitude, address, ptoState, alertType, text } = req.body;

  // Validate drivers
  let matchedDriverId = "";
  if (driver && (driver.toLowerCase().includes("hikmat") || driver.toLowerCase().includes("حكمت") || driver.toLowerCase().includes("חכמת"))) {
    matchedDriverId = "hikmat";
  } else if (driver && (driver.toLowerCase().includes("ali") || driver.toLowerCase().includes("علي") || driver.toLowerCase().includes("עלי"))) {
    matchedDriverId = "ali";
  } else {
    // default to hikmat if unspecified
    matchedDriverId = "hikmat";
  }

  const normalizedPto = ptoState === "open" || ptoState === "opened" ? "open" : "closed";
  const driverName = matchedDriverId === "hikmat" ? "חכמת" : "עלי";
  const vehicleName = matchedDriverId === "hikmat" ? "מרצדס מנוף" : "איסוזו משטח";

  // Parse location coordinates
  const lat = parseFloat(latitude) || dbState.fleet[matchedDriverId].latitude;
  const lng = parseFloat(longitude) || dbState.fleet[matchedDriverId].longitude;

  // Track if this is a location update or a critical PTO alarm
  const isPtoChange = ptoState && (dbState.fleet[matchedDriverId].ptoState !== normalizedPto);
  const typeStr = isPtoChange || alertType === "critical" ? "pto_alert" : "location_update";
  
  // Construct customized notification message
  let displayMessage = text || `עדכון מיקום עבור ${driverName}: נמצא ב-${address || "מיקום לא ידוע"}.`;
  if (isPtoChange) {
    displayMessage = `התרעה קריטית: PTO במשאית של ${driverName} ${normalizedPto === "open" ? "נפתח לעבודה" : "נסגר ועצר"}. מיקום: ${address || "מיקום מעודכן"}.`;
  }

  // Update backend memory state
  const updatedVehicle: VehicleState = {
    ...dbState.fleet[matchedDriverId],
    latitude: lat,
    longitude: lng,
    address: address || dbState.fleet[matchedDriverId].address,
    ptoState: normalizedPto,
    lastUpdated: time || new Date().toISOString(),
    status: normalizedPto === "open" ? "עבודה בשטח (PTO פתוח)" : "בנסיעה / חנייה",
    pulseActive: true // Enable marker ripple/ping
  };

  dbState.fleet[matchedDriverId] = updatedVehicle;

  // Store alert in timeline
  const newAlert: AlertLog = {
    id: `alert_${Date.now()}`,
    timestamp: time || new Date().toISOString(),
    vehicle: vehicle || vehicleName,
    driver: driver || driverName,
    address: address || updatedVehicle.address,
    ptoState: normalizedPto,
    type: isPtoChange ? "critical" : typeStr,
    message: displayMessage
  };

  dbState.alerts.unshift(newAlert);

  // Keep alert logs capped to 100 for storage sanity
  if (dbState.alerts.length > 100) {
    dbState.alerts.pop();
  }

  // Persist locally
  saveLocalDb();

  // Sync state & alert log to Cloud Firestore if initialized
  await syncToFirestore("fleet", matchedDriverId, updatedVehicle);
  await syncToFirestore("alerts", newAlert.id, newAlert);

  // Trigger OneSignal push notifications for critical changes
  if (isPtoChange || alertType === "critical" || normalizedPto === "open") {
    await triggerOneSignalPush(displayMessage, normalizedPto, driverName);
  }

  res.status(200).json({ status: "success", data: updatedVehicle, alert: newAlert });
});

// 2. Chat API triggered by Assistant Noa (Gemini SDK)
app.post("/api/chat", async (req, res) => {
  const { message, chatHistory } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Intercept Navigation Links / Waze ETA links / Address requests
  const mapLinkRegex = /(https?:\/\/[^\s]+)/gi;
  const isMapLink = message.toLowerCase().includes("waze") || message.toLowerCase().includes("google.com/maps") || mapLinkRegex.test(message);
  
  if (isMapLink) {
    let driverId = "ali"; // default
    if (message.includes("חכמת") || message.toLowerCase().includes("hikmat")) {
      driverId = "hikmat";
    }

    let lat = 32.0674;
    let lng = 34.7758;
    let addr = "שדרות רוטשילד 30, תל אביב";

    const coordsMatch = message.match(/(\d{2}\.\d{4,6})\s*,\s*(\d{2}\.\d{4,6})/);
    if (coordsMatch) {
      lat = parseFloat(coordsMatch[1]);
      lng = parseFloat(coordsMatch[2]);
    } else {
      const driver = dbState.fleet[driverId];
      lat = driver.latitude - 0.015;
      lng = driver.longitude + 0.012;
      addr = "יעד לקוח (כתובת מפוענחת)";
    }

    const rideId = `ride_${Date.now()}`;
    const dynamicOrigin = req.headers.origin || req.headers.referer || "http://localhost:3000";
    const cleanOrigin = dynamicOrigin.endsWith('/') ? dynamicOrigin.slice(0, -1) : dynamicOrigin;
    const trackingLink = `${cleanOrigin}/track/${rideId}`;

    const newRide: ActiveRide = {
      id: rideId,
      driverId,
      customerName: "ישראל ישראלי",
      customerPhone: "054-9998888",
      destinationName: addr,
      destinationLatitude: lat,
      destinationLongitude: lng,
      etaMinutes: 18,
      status: "active",
      createdAt: new Date().toISOString(),
      wazeLink: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    };

    if (!dbState.activeRides) {
      dbState.activeRides = {};
    }
    dbState.activeRides[rideId] = newRide;
    saveLocalDb();

    await syncToFirestore("activeRides", rideId, newRide);

    const replyHebrew = `🚙 **נועה זיהתה קישור ניווט חדש!**
יצרתי עבורכם כרטיס מעקב נסיעה חכם בזמן אמת.

👤 **נהג משויך:** ${driverId === "hikmat" ? "חכמת (מרצדס מנוף)" : "עלי (איסוזו משטח)"}
📍 **יעד נסיעה:** ${addr}
⏱️ **זמן הגעה משוער (ETA):** 18 דקות

🔗 **קישור נהג לניווט ב-Waze:**
https://waze.com/ul?ll=${lat},${lng}&navigate=yes

📱 **קישור מעקב לקוח בזמן אמת:**
${trackingLink}

💬 **הודעת WhatsApp מוכנה לשליחה ללקוח:**
\`הנהג שלנו בדרך אליך! למעקב בזמן אמת: ${trackingLink}\`

*(תוכלו ללחוץ על אייקון הווטסאפ לצד המיקום לשיתוף מהיר מהדאשבורד).*`;

    return res.json({ reply: replyHebrew });
  }

  const ai = getGeminiClient();

  // Create highly customized system prompt with real context
  const fleetSummary = Object.values(dbState.fleet)
    .map(v => `${v.driver} שנוהג ב-${v.vehicle}. מיקום אחרון: ${v.address} (${v.latitude}, ${v.longitude}). מצב PTO: ${v.ptoState === "open" ? "פתוח (עובד עם המנוף/משטח)" : "סגור"}. סטטוס: ${v.status}.`)
    .join("\n");

  const recentAlertsStr = dbState.alerts.slice(0, 5)
    .map(a => `[${new Date(a.timestamp).toLocaleTimeString('he-IL')}] ${a.driver}: ${a.message}`)
    .join("\n");

  const systemInstruction = `
את שותפה לניהול צי בשם "נועה" (Noa), מנהלת Fleet חכמה ומקצועית עבור חברת נועה איתורן (Noa Ituran).
תפקידך לסייע למנהל העבודה לעקוב אחרי המשאיות, המנופים ומצב ה-PTO של הנהגים "חכמת" (Hikmat - נוהג במרצדס מנוף) ו"עלי" (Ali - נוהג באיסוזו משטח).
דברי בעברית רהוטה, מקצועית, קצרה ותמציתית מאוד.
יש לך גישה ישירה לצי המכוניות בזמן אמת. להלן מצב הצי הנוכחי:
${fleetSummary}

הודעות והתרעות אחרונות בזמן אמת:
${recentAlertsStr}

ניתוחי הגעה, זמנים וסטטיסטיקות:
- המרחקים ביניהם בדרך כלל נמדדים לפי פקקי גוש דן השוטפים.
- אל תשתמשי בנתונים מומצאים מעבר למצב הצי וההיסטוריה הנתונה.
- אם שואלים לגבי הגעה, תני הערכה מעולה ומנומקת על בסיס המרחקים והעבודות.
- תמיד תגני על בטיחות הנהגים ותדגישי תקינות PTO.
עני תמיד בעברית בלבד ובצורה תמציתית, יעילה ונקודתית ללא פטפטת מיותרת.
`;

  try {
    const formattedHistory = (chatHistory || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    // Generate output with systems instructions and user text
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        ...formattedHistory,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ 
      error: "ג'מיני לא זמין כרגע, פועל במצב לא מקוון נועה.",
      reply: "שלום, חלה שגיאה זמנית בחיבור לשרתי הבינה המלאכותית. הנהגים חכמת ועלי בדרך ומנוטרלים היטב במערכת המפות שלי."
    });
  }
});

// 3. API endpoint for UI coordinates and alerts
app.get("/api/fleet", (req, res) => {
  res.json(dbState);
});

// API reset visual pulse ping for drivers (so radar/ping fades on map)
app.post("/api/fleet/clear-pulse", (req, res) => {
  const { id } = req.body;
  if (dbState.fleet[id]) {
    dbState.fleet[id].pulseActive = false;
    saveLocalDb();
  }
  res.json({ status: "ok" });
});

// Webhook status checklist for test/dashboard purposes
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date(), firebaseConnected: !!firestoreDb });
});

export default app;
