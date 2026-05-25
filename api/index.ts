import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, addDoc, terminate, getDocFromServer } from "firebase/firestore";

// Initialize express app
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic asset resolution mapping PNG icons directly to the crisp SVG vector logo
app.get("/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  const p1 = path.join(process.cwd(), "public", "icon.svg");
  const p2 = path.join(process.cwd(), "dist", "icon.svg");
  const iconPath = fs.existsSync(p1) ? p1 : p2;
  res.sendFile(iconPath);
});

app.get("/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  const p1 = path.join(process.cwd(), "public", "icon.svg");
  const p2 = path.join(process.cwd(), "dist", "icon.svg");
  const iconPath = fs.existsSync(p1) ? p1 : p2;
  res.sendFile(iconPath);
});

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
  latitude?: number;
  longitude?: number;
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

let dbState: { 
  fleet: Record<string, VehicleState>; 
  alerts: AlertLog[];
  activeRides: Record<string, ActiveRide>;
  chatHistory: ChatMessage[];
} = {
  fleet: { ...initialFleet },
  alerts: [
    {
      id: "init_1",
      timestamp: new Date().toISOString(),
      vehicle: "مرسيدס كرين",
      driver: "حكمת",
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
  },
  chatHistory: [
    {
      role: "assistant",
      content: "שלום, אני נועה (Noa). מנהלת הצי החכמה שלכם. הדביקו כאן קישור ETA של Waze או Google Maps ואצור מיד קישור מעקב דינמי לשיתוף בווטסאפ ללקוח!",
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    }
  ]
};

// Load from file if exists
try {
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    dbState = JSON.parse(data);
    
    // Safety check after loading parsed state: ensure chatHistory array is present
    if (!dbState.chatHistory || !Array.isArray(dbState.chatHistory)) {
      dbState.chatHistory = [
        {
          role: "assistant",
          content: "שלום, אני נועה (Noa). מנהלת הצי החכמה שלכם. הדביקו כאן קישור ETA של Waze או Google Maps ואצור מיד קישור מעקב דינמי לשיתוף בווטסאפ ללקוח!",
          timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        }
      ];
    }
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
let firestoreEnabled = false;

try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    firebaseApp = initializeApp(firebaseConfig);
    const dbInstance = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    firestoreDb = dbInstance;
    firestoreEnabled = true;
    console.log("Firebase initialized successfully in Express backend.");

    // Validate if the database actually exists asynchronously to prevent background log-spam/errors
    getDocFromServer(doc(dbInstance, "test_connectivity_check", "test_id"))
      .then(() => {
        console.log("Firestore database connectivity confirmed successfully.");
      })
      .catch((err: any) => {
        const errMsg = err?.message || String(err);
        if (
          errMsg.includes("NOT_FOUND") || 
          errMsg.includes("not-found") || 
          errMsg.includes("permission-denied") || 
          errMsg.includes("Permission denied") ||
          err?.code === "not-found" ||
          err?.code === "permission-denied"
        ) {
          console.warn(`[Firestore Safe Fallback] Database NOT_FOUND or permission denied. Automatically terminating connection to prevent log spam: ${errMsg}`);
          firestoreEnabled = false;
          firestoreDb = null;
          terminate(dbInstance)
            .then(() => console.log("Firestore client background connections terminated successfully."))
            .catch((tErr) => console.error("Error terminating Firestore client connections:", tErr));
        }
      });
  }
} catch (error) {
  console.log("Firebase not initialized. Running on local DB layer.", error);
  firestoreDb = null;
  firestoreEnabled = false;
}

// Function to sync server write with Web Firestore if available
const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  if (!firestoreDb || !firestoreEnabled) return;
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

// Helper to check if GEMINI_API_KEY is defined and valid
const isGeminiKeyValid = (): boolean => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MOCK_KEY" || key.toLowerCase().includes("mock") || key.trim() === "" || key.length < 15) {
    return false;
  }
  return true;
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

// Great-circle distance calculation via Haversine formula
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // returns distance in km
}

// Geocode an input text address using Gemini to exact coordinates in Israel
async function geocodeAddressWithGemini(address: string): Promise<{ lat: number; lng: number; normalizedAddress: string } | null> {
  if (!isGeminiKeyValid()) {
    console.warn(`[Gemini Geocode Fallback] Key is missing or invalid. Using local Israeli location dictionary query for: "${address}"`);
    const addrLower = address?.toLowerCase() || "";
    
    // Quick, high-fidelity dictionary for Israel cities and famous spots
    if (addrLower.includes("חיפה") || addrLower.includes("haifa")) {
      return { lat: 32.7940, lng: 34.9896, normalizedAddress: "חיפה, ישראל" };
    }
    if (addrLower.includes("ירוש") || addrLower.includes("jerusalem")) {
      return { lat: 31.7683, lng: 35.2137, normalizedAddress: "ירושלים, ישראל" };
    }
    if (addrLower.includes("ראשון") || addrLower.includes("rishon")) {
      return { lat: 31.9730, lng: 34.7925, normalizedAddress: "ראשון לציון, ישראל" };
    }
    if (addrLower.includes("חולון") || addrLower.includes("holon")) {
      return { lat: 32.0163, lng: 34.7771, normalizedAddress: "חולון, ישראל" };
    }
    if (addrLower.includes("נתניה") || addrLower.includes("netanya")) {
      return { lat: 32.3215, lng: 34.8532, normalizedAddress: "נתניה, ישראל" };
    }
    if (addrLower.includes("פתח") || addrLower.includes("petah")) {
      return { lat: 32.0840, lng: 34.8878, normalizedAddress: "פתח תקווה, ישראל" };
    }
    if (addrLower.includes("אשדוד") || addrLower.includes("ashdod")) {
      return { lat: 31.8044, lng: 34.6553, normalizedAddress: "אשדוד, ישראל" };
    }
    if (addrLower.includes("רחוב") || addrLower.includes("רוטשילד") || addrLower.includes("תל אביב") || addrLower.includes("tel aviv")) {
      return { lat: 32.0674, lng: 34.7758, normalizedAddress: "שדרות רוטשילד, תל אביב-יפו, ישראל" };
    }
    // Return Tel Aviv default coordinate
    return { lat: 32.0674, lng: 34.7758, normalizedAddress: `${address} (מפוענח מקומית)` };
  }

  try {
    const ai = getGeminiClient();
    const prompt = `You are a precise geocoding engine for Israel. 
Geocode the following Hebrew/English address/location to its exact geographical coordinates (latitude and longitude decimal numbers).
Address: "${address}"

Respond ONLY with a JSON object in this format (no markdown formatting, no codeblocks, no surrounding text):
{
  "lat": 32.0674,
  "lng": 34.7758,
  "normalizedAddress": "שדרות רוטשילד, תל אביב-יפו"
}
If you cannot find the specific address, extract any identifiable city/street name or use its closest match in Israel. Do not fail.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return {
          lat: parsed.lat,
          lng: parsed.lng,
          normalizedAddress: parsed.normalizedAddress || address
        };
      }
    }
  } catch (error) {
    console.error("Failed to geocode with Gemini:", error);
  }
  return null;
}

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
  let displayMessage = text || `עדכון מיקום עבור ${driverName}: נמצא ב-${address || "מיקומך"}.`;
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
    message: displayMessage,
    latitude: lat,
    longitude: lng
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

// Function to generate the daily summary of fleet work
async function generateDailyFleetSummary(): Promise<string> {
  const vehicles = Object.values(dbState.fleet);
  const alerts = dbState.alerts || [];
  const rides = Object.values(dbState.activeRides || {});

  const activeCount = vehicles.filter((v) => v.speed > 0 || v.ptoState === "open").length;
  const ptoOpenCount = vehicles.filter((v) => v.ptoState === "open").length;
  const totalAlerts = alerts.length;
  const criticalAlerts = alerts.filter((a) => a.type === "critical").length;
  const activeRidesCount = rides.filter((r) => r.status === "active").length;
  const completedRidesCount = rides.filter((r) => r.status === "completed").length;

  if (!isGeminiKeyValid()) {
    console.warn("[Gemini Summary Fallback] Key is missing or invalid. Returning highly detailed pre-formatted localized Hebrew summary.");
    return `📊 **סיכום פעילות יומי - נועה איתורן (18:00)**

שלום רב מנהל הצי, להלן דוח מצב וניתוח הצי לשעה 18:00:

📈 **סיכום מדדי ביצוע (KPI):**
- סך הכל כלים פעילים בשטח: **${activeCount}** רכבים.
- ללא דיווחים חריגים או התנתקויות.
- **${ptoOpenCount}** רכבים עובדים עם מערכת PTO פתוחה כעת.
- סה"כ התרעות איתורן שהתקבלו היום: **${totalAlerts}** אירועים (מתוכם **${criticalAlerts}** מוגדרות קבוצה קריטית).
- נסיעות לקוחות במעקב: **${rides.length}** נסיעות (${activeRidesCount} פעילות, ${completedRidesCount} הושלמו).

🚛 **מצב הכלים הנוכחי:**
- **חכמת (מרצדס מנוף):** :כתובת אחרונה ${dbState.fleet.hikmat?.address || "לא זמינה"}, מצב PTO: ${dbState.fleet.hikmat?.ptoState === "open" ? "פתוח (עבודה פעילה בזרוע מנוף)" : "סגור"}, מהירות: ${dbState.fleet.hikmat?.speed || 0} קמ"ש.
- **עלי (איסוזו משטח):** :כתובת אחרונה ${dbState.fleet.ali?.address || "לא זמינה"}, מצב PTO: ${dbState.fleet.ali?.ptoState === "open" ? "פתוח" : "סגור"}, מהירות: ${dbState.fleet.ali?.speed || 0} קמ"ש.

🔒 **דגש בטיחותי מחייב ללילה:**
- אנו מזכירים כי חלה חובה לוודא שכל זרועות המנוף סגורות ומערכות ה-PTO כבויות לחלוטין לפני חניית הלילה למניעת תקלות או פריקות סוללה/שמן. המשך ערב שקט ובטוח!`;
  }

  const detailsText = `
כמות רכבים פעילים או עובדים כעת: ${activeCount}.
רכבים עם PTO פתוח כעת: ${ptoOpenCount}.
סה"כ אירועים והתרעות שנרשמו היום: ${totalAlerts} (מתוכם ${criticalAlerts} התרעות קריטיות של הזנקת PTO).
נסיעות למעקב לקוח קצה: ${rides.length} (${activeRidesCount} פעילות, ${completedRidesCount} הושלמו).
  `;

  const vehiclesStatusText = vehicles
    .map((v) => `- ${v.name}: נהג ${v.driver}, מהירות ${v.speed} קמ"ש, כתובת אחרונה: ${v.address}, מצב PTO: ${v.ptoState === "open" ? "פתוח" : "סגור"}`)
    .join("\n");

  const recentAlertsText = alerts
    .slice(0, 10)
    .map((a) => `- [${new Date(a.timestamp).toLocaleTimeString("he-IL")}] ${a.driver}: ${a.message}`)
    .join("\n");

  const prompt = `
צור סיכום יומי מקצועי, שלם ומלוטש מאוד עבור "נועה איתורן" המיועד למנהל הצי.
הסיכום חייב להיות בעברית עשירה, מנוסחת היטב ובסגנון מנהלים מקצועי שמתאים לשעה 18:00 (סוף יום העבודה).
הנה נתוני היום:
${detailsText}

רשימת הרכבים ומצבם הנוכחי:
${vehiclesStatusText}

ההתרעות האחרונות שנרשמו היום:
${recentAlertsText}

אנא עצב סיכום מרשים הכולל:
1. **כותרת חגיגית לסיכום היומי ב-18:00** (למשל: 📊 סיכום יומי של עבודת הצי - נועה איתורן).
2. **רקע כללי וניתוח פעילות הצי היום** בצורה רהוטה ומקצועית.
3. **מדדי ביצוע מפתח (KPIs)** בצורה ברורה ומאורגנת היטב.
4. **דגשים בנושא בטיחות, ונעילת PTO ללילה** כדי להבטיח סגירה בטוחה של הצי.

ענה אך ורק בעברית קולחת ומסודרת, ללא הסברים מיותרים.
  `;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "את שותפה בכירה ומקצועית לניהול הצי בשם 'נועה'. סכמי את יום העבודה בצורה מרשימה, שירותית וקולעת בעברית.",
        temperature: 0.7,
      },
    });

    return response.text || "לא ניתן היה להפיק סיכום יומי אוטומטי כעת.";
  } catch (error) {
    console.error("Failed to generate daily summary with Gemini, using fallback:", error);
    
    // Clean, informative localized fallback summary
    return `📊 **סיכום יומי של עבודת הצי - נועה איתורן (18:00)**
 
שלום רב למנהל העבודה, להלן סיכום אוטומטי של עבודת הצי ליום זה:
 
🚗 **רשימת הרכבים והנהגים:**
- **חכמת (מרצדס מנוף):** כתובת אחרונה: ${dbState.fleet.hikmat?.address || "לא זמינה"}, מצב PTO: ${dbState.fleet.hikmat?.ptoState === "open" ? "פתוח (עבודה בשטח)" : "סגור"}, מהירות: ${dbState.fleet.hikmat?.speed || 0} קמ"ש.
- **עלי (איסוזו משטח):** כתובת אחרונה: ${dbState.fleet.ali?.address || "לא זמינה"}, מצב PTO: ${dbState.fleet.ali?.ptoState === "open" ? "פתוח" : "סגור"}, מהירות: ${dbState.fleet.ali?.speed || 0} קמ"ש.
 
🔔 **כללי והתרעות:**
- סה"כ התרעות איתורן שהתקבלו היום: **${alerts.length}** אירועים (מתוכם ${criticalAlerts} קריטיים).
- מעקבי נסיעות פעילים עבור לקוחות: **${rides.length}** נסיעות רשומות.
 
*דגש בטיחות:* אנא ודא כי מערכות ה-PTO וזרועות המנוף סגורות ומאובטחות לחלוטין לפני חניית הלילה למניעת אירועים חריגים. המשך ערב שקט!`;
  }
}



// Background scheduler loop to check and trigger 18:00 summary daily
let lastSummaryDateStr = "";

setInterval(async () => {
  try {
    const now = new Date();
    // Convert to target Israel / Jerusalem timezone to support any container runtime
    const todayStr = now.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
    const istTimeStr = now.toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (istTimeStr === "18:00" && lastSummaryDateStr !== todayStr) {
      lastSummaryDateStr = todayStr;
      console.log(`[Scheduler] 18:00! Generating daily fleet work summary for ${todayStr}...`);
      
      const summaryContent = await generateDailyFleetSummary();
      const summaryMsg: ChatMessage = {
        role: "assistant",
        content: summaryContent,
        timestamp: "18:00"
      };

      if (!dbState.chatHistory) {
        dbState.chatHistory = [];
      }
      dbState.chatHistory.push(summaryMsg);
      saveLocalDb();
      await syncToFirestore("chatHistory", `summary_${Date.now()}`, summaryMsg);
      console.log(`[Scheduler] Daily summary published to Noa Chat successfully.`);
    }
  } catch (error) {
    console.error("[Scheduler] Error in daily 18:00 trigger checks:", error);
  }
}, 30000); // Check every 30 seconds

// 2. Chat API triggered by Assistant Noa (Gemini SDK)
app.post("/api/chat", async (req, res) => {
  const { message, chatHistory } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const timestamp = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  // 1. Add user message to backend chatHistory
  const userMsg: ChatMessage = { role: "user", content: message, timestamp };
  if (!dbState.chatHistory) {
    dbState.chatHistory = [];
  }
  dbState.chatHistory.push(userMsg);

  // Pre-calculate distances if there is a detected address or location keywords in the message
  let closerSuggestionContext = "";
  let detectedTarget: { lat: number; lng: number; address: string } | null = null;

  // Check if coordinates exist directly in message
  const coordsMatch = message.match(/(\d{2}\.\d{4,6})\s*,\s*(\d{2}\.\d{4,6})/);
  if (coordsMatch) {
    detectedTarget = {
      lat: parseFloat(coordsMatch[1]),
      lng: parseFloat(coordsMatch[2]),
      address: `נקודת ציון (${coordsMatch[1]}, ${coordsMatch[2]})`
    };
  } else {
    // Check if the user is querying a location, address, or seeking proximity guidance
    const lowercaseMsg = message.toLowerCase();
    const isLocationQuery = 
      lowercaseMsg.includes("קרוב") || 
      lowercaseMsg.includes("מרחק") || 
      lowercaseMsg.includes("מרחקים") ||
      lowercaseMsg.includes("לאן") || 
      lowercaseMsg.includes("כתובת") || 
      lowercaseMsg.includes("יעד") || 
      lowercaseMsg.includes("שדרות") || 
      lowercaseMsg.includes("רחוב") || 
      lowercaseMsg.includes("תל אביב") || 
      lowercaseMsg.includes("חיפה") || 
      lowercaseMsg.includes("ראשון") ||
      lowercaseMsg.includes("נתניה") ||
      lowercaseMsg.includes("חולון") ||
      lowercaseMsg.includes("ירושלים");

    if (isLocationQuery) {
      // Strip helper particles to yield a clean address query to Gemini Geocoder
      const cleanAddress = message
        .replace(/מי\s+הכי\s+קרוב\s+ל/gi, "")
        .replace(/מי\s+קרוב\s+יותר\s+ל/gi, "")
        .replace(/מרחק\s+ל/gi, "")
        .replace(/איפה\s+זה/gi, "")
        .replace(/\?/g, "")
        .trim();

      if (cleanAddress.length > 2) {
        console.log(`[Proximity Engine] Geocoding request for: "${cleanAddress}"...`);
        const geocoded = await geocodeAddressWithGemini(cleanAddress);
        if (geocoded) {
          detectedTarget = {
            lat: geocoded.lat,
            lng: geocoded.lng,
            address: geocoded.normalizedAddress
          };
        }
      }
    }
  }

  // If a destination point is mapped, run real-time GPS proximity calculations
  if (detectedTarget) {
    const hikmat = dbState.fleet.hikmat;
    const ali = dbState.fleet.ali;
    if (hikmat && ali) {
      const distHikmat = calculateHaversineDistance(hikmat.latitude, hikmat.longitude, detectedTarget.lat, detectedTarget.lng);
      const distAli = calculateHaversineDistance(ali.latitude, ali.longitude, detectedTarget.lat, detectedTarget.lng);
      
      const closerDriver = distHikmat < distAli ? hikmat : ali;
      const furtherDriver = distHikmat < distAli ? ali : hikmat;
      const diff = Math.abs(distHikmat - distAli);
      
      closerSuggestionContext = `
---
[מידע מחושב בזמן אמת ע"י מערכת ה-GPS של איתורן]:
היעד המבוקש שזוהה בהודעה: "${detectedTarget.address}" פוענח לקואורדינטות (${detectedTarget.lat}, ${detectedTarget.lng}).
🚗 מרחקים מדויקים של הצי ליעד זה:
- חכמת (Hikmat) במרצדס מנוף נמצא במרחק של: **${distHikmat.toFixed(2)} ק"מ**.
- עלי (Ali) באיסוזו משטח נמצא במרחק של: **${distAli.toFixed(2)} ק"מ**.

🏆 ההמלצה המערכתית:
הנהג הקרוב ביותר למיקום זה הוא **${closerDriver.driver}** (נמצא במרחק של **${Math.min(distHikmat, distAli).toFixed(2)} ק"מ**).
הוא קרוב יותר ליעד ב-**${diff.toFixed(2)} ק"מ** מאשר ${furtherDriver.driver}.

בהתבסס על נתוני אמת אלה, עני בצורה ברורה בעברית וספרי למנהל הצי מי מהנהגים קרוב יותר ובכמה קילומטרים כל אחד מהם כדי לסייע לו לקבל החלטה מושכלת!
---
`;
      console.log(`[Proximity Engine] Proximity calculated: Hikmat: ${distHikmat.toFixed(2)}km, Ali: ${distAli.toFixed(2)}km. Closer is ${closerDriver.driver}.`);
    }
  }

  // Intercept Navigation Links / Waze ETA links / Address requests
  const mapLinkRegex = /(https?:\/\/[^\s]+)/gi;
  const isMapLink = message.toLowerCase().includes("waze") || message.toLowerCase().includes("google.com/maps") || mapLinkRegex.test(message);
  
  if (isMapLink) {
    let lat = 32.0674;
    let lng = 34.7758;
    let addr = "שדרות רוטשילד 30, תל אביב";

    const coordsMatch = message.match(/(\d{2}\.\d{4,6})\s*,\s*(\d{2}\.\d{4,6})/);
    if (coordsMatch) {
      lat = parseFloat(coordsMatch[1]);
      lng = parseFloat(coordsMatch[2]);
    } else {
      // Try to geocode the message or strip the link to get text address
      const cleanMsg = message.replace(/(https?:\/\/[^\s]+)/gi, "").trim();
      const geocoded = await geocodeAddressWithGemini(cleanMsg || "תל אביב");
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        addr = geocoded.normalizedAddress;
      } else {
        const driver = dbState.fleet.ali;
        if (driver) {
          lat = driver.latitude - 0.015;
          lng = driver.longitude + 0.012;
        }
        addr = "יעד לקוח (כתובת מפוענחת)";
      }
    }

    // Determine closer driver dynamically
    const hikmat = dbState.fleet.hikmat;
    const ali = dbState.fleet.ali;
    let distHikmat = 0;
    let distAli = 0;
    let rptText = "";
    let closestDriverId = "ali";

    if (hikmat && ali) {
      distHikmat = calculateHaversineDistance(hikmat.latitude, hikmat.longitude, lat, lng);
      distAli = calculateHaversineDistance(ali.latitude, ali.longitude, lat, lng);
      
      if (distHikmat < distAli) {
        closestDriverId = "hikmat";
        rptText = `📊 **חישוב מרחקים וקרבה למיקום בזמן אמת:**
- **حכמת (מרצדס מנוף)** קרוב יותר במרחק של **${distHikmat.toFixed(2)} ק"מ** מהיעד!
- **עלי (איסוזו משטח)** נמצא במרחק של **${distAli.toFixed(2)} ק"מ** מהיעד.`;
      } else {
        closestDriverId = "ali";
        rptText = `📊 **חישוב מרחקים וקרבה למיקום בזמן אמת:**
- **עלי (איסוזו משטח)** קרוב יותר במרחק של **${distAli.toFixed(2)} ק"מ** מהיעד!
- **חכמת (מרצדס מנוף)** נמצא במרחק של **${distHikmat.toFixed(2)} ק"מ** מהיעד.`;
      }
    }

    let driverId = closestDriverId; // Auto-assign to closer driver!
    if (message.includes("חכמת") || message.toLowerCase().includes("hikmat")) {
      driverId = "hikmat";
    } else if (message.includes("עלי") || message.toLowerCase().includes("ali")) {
      driverId = "ali";
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
      etaMinutes: Math.round(Math.min(distHikmat, distAli) * 2.5) || 18, // dynamic ETA based on distance in km
      status: "active",
      createdAt: new Date().toISOString(),
      wazeLink: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    };

    if (!dbState.activeRides) {
      dbState.activeRides = {};
    }
    dbState.activeRides[rideId] = newRide;

    // Add assistant response to backend chatHistory
    const replyHebrew = `🚙 **נועה זיהתה קישור ניווט חדש ומחשבת מרחקים ע"י הלוויון!**
יצרתי עבורכם כרטיס מעקב נסיעה חכם בזמן אמת.

${rptText}

👤 **נהג משויך:** ${driverId === "hikmat" ? "חכמת (מרצדס מנוף) 🚛" : "עלי (איסוזו משטח) 🚚"}
📍 **יעד נסיעה:** ${addr}
⏱️ **זמן הגעה משוער (ETA):** ${newRide.etaMinutes} דקות

🔗 **קישור נהג לניווט ב-Waze:**
https://waze.com/ul?ll=${lat},${lng}&navigate=yes

📱 **קישור מעקב לקוח בזמן אמת:**
${trackingLink}

💬 **הודעת WhatsApp מוכנה לשליחה ללקוח:**
\`הנהג שלנו בדרך אליך! למעקב בזמן אמת: ${trackingLink}\`

*(תוכלו ללחוץ על אייקון הווטסאפ לצד המיקום לשיתוף מהיר מהדאשבורד).*`;

    const assistantMsg: ChatMessage = { role: "assistant", content: replyHebrew, timestamp };
    dbState.chatHistory.push(assistantMsg);
    saveLocalDb();

    await syncToFirestore("activeRides", rideId, newRide);
    await syncToFirestore("chatHistory", `msg_${Date.now()}`, assistantMsg);

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

${closerSuggestionContext}

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

    const replyText = response.text || "סליחה, לא הצלחתי לעבד את הבקשה.";
    const assistantMsg: ChatMessage = { role: "assistant", content: replyText, timestamp };
    dbState.chatHistory.push(assistantMsg);
    saveLocalDb();
    
    await syncToFirestore("chatHistory", `msg_${Date.now()}`, assistantMsg);

    res.json({ reply: replyText });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const fallbackReply = "שלום, חלה שגיאה זמנית בחיבור לשרתי הבינה המלאכותית. הנהגים חכמת ועלי בדרך ומנוטרלים היטב במערכת המפות שלי.";
    const assistantMsg: ChatMessage = { role: "assistant", content: fallbackReply, timestamp };
    dbState.chatHistory.push(assistantMsg);
    saveLocalDb();

    res.status(500).json({ 
      error: "ג'מיני לא זמין כרגע, פועל במצב לא מקוון נועה.",
      reply: fallbackReply
    });
  }
});

// Endpoint to manually run, test, and render the daily summary of the fleet work instantly
app.post("/api/test-summary", async (req, res) => {
  try {
    console.log("[Manual Test] Triggering manually generated daily fleet summary...");
    const summaryText = await generateDailyFleetSummary();
    const timestamp = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    
    const testMsg: ChatMessage = {
      role: "assistant",
      content: summaryText,
      timestamp: `${timestamp} (סיכום יזום)`
    };

    if (!dbState.chatHistory) {
      dbState.chatHistory = [];
    }
    dbState.chatHistory.push(testMsg);
    saveLocalDb();
    await syncToFirestore("chatHistory", `summary_test_${Date.now()}`, testMsg);

    res.json({ success: true, message: "סיכום יומי נוצר בהצלחה והוזן לרשימת הצ'אט!", data: testMsg });
  } catch (error: any) {
    console.error("[Manual Test] Summary generation failed:", error);
    res.status(500).json({ success: false, error: error.message });
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
