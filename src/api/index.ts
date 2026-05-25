import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, addDoc, getDocs } from "firebase/firestore";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// גיבוי מקומי בלבד לפיתוח. בוורסל נסתמך רק על הזיכרון ועל Firestore
const DB_FILE = path.join(process.cwd(), "fleet_db.json");

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

// נתוני ברירת מחדל
const initialFleet: Record<string, VehicleState> = {
  hikmat: {
    id: "hikmat",
    name: "חכמת (מרצדס מנוף)",
    vehicle: "מרצדס מנוף - מספר שילדה 992817",
    driver: "חכמת",
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
    driver: "עלי",
    latitude: 32.1624,
    longitude: 34.8447,
    address: "איזור תעשייה הרצליה פיתוח",
    lastUpdated: new Date().toISOString(),
    ptoState: "closed",
    status: "ממתין לעבודה",
    speed: 0
  }
};

let dbState: { fleet: Record<string, VehicleState>; alerts: AlertLog[]; activeRides: Record<string, ActiveRide> } = {
  fleet: { ...initialFleet },
  alerts: [],
  activeRides: {}
};

// אתחול Firebase חכם (קורא ממשתני סביבה בוורסל)
let firestoreDb: any = null;
try {
  // עדיפות 1: משתני סביבה מ-Vercel
  if (process.env.FIREBASE_PROJECT_ID) {
    const firebaseConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // משתנים חשובים במיוחד בענן
    };
    const firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp);
    console.log("Firebase initialized via ENV vars.");
  } 
  // עדיפות 2: קובץ לוקאלי (רק לסביבת פיתוח מקומית)
  else if (fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json"))) {
    const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8"));
    const firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp);
    console.log("Firebase initialized via local JSON.");
  }
} catch (error) {
  console.log("Running without Firebase. Changes will not persist across Vercel cold starts.");
}

// פונקציה קריטית: שחזור המצב מהענן אחרי Cold Start
let isStateRestored = false;
const restoreStateFromCloud = async () => {
  if (!firestoreDb || isStateRestored) return;
  try {
    const fleetSnap = await getDocs(collection(firestoreDb, "fleet"));
    fleetSnap.forEach(doc => { dbState.fleet[doc.id] = doc.data() as VehicleState; });
    
    const ridesSnap = await getDocs(collection(firestoreDb, "activeRides"));
    ridesSnap.forEach(doc => { dbState.activeRides[doc.id] = doc.data() as ActiveRide; });

    isStateRestored = true;
    console.log("System state successfully restored from Firestore.");
  } catch (error) {
    console.error("Failed to restore state from Firestore:", error);
  }
};

const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  if (!firestoreDb) return;
  try {
    if (docId) await setDoc(doc(firestoreDb, collectionName, docId), data);
    else await addDoc(collection(firestoreDb, collectionName), data);
  } catch (error) {
    console.error("Firestore sync failed:", error);
  }
};

// --- NATIVE EXPRESS ROUTES ---

app.get("/api/fleet", async (req, res) => {
  await restoreStateFromCloud(); // מוודא שהנתונים מעודכנים מהענן לפני השליחה ללקוח
  res.json(dbState);
});

app.post("/api/fleet/clear-pulse", async (req, res) => {
  const { id } = req.body;
  if (dbState.fleet[id]) {
    dbState.fleet[id].pulseActive = false;
  }
  res.json({ status: "ok" });
});

app.get("/api/rides", async (req, res) => {
  await restoreStateFromCloud();
  res.json({ success: true, rides: Object.values(dbState.activeRides || {}) });
});

app.get("/api/rides/:id", async (req, res) => {
  await restoreStateFromCloud();
  const ride = dbState.activeRides ? dbState.activeRides[req.params.id] : null;
  if (!ride) return res.status(404).json({ error: "מעקב נסיעה לא נמצא" });
  const driver = dbState.fleet[ride.driverId];
  res.json({ success: true, ride, driver });
});

app.post("/api/rides", async (req, res) => {
  await restoreStateFromCloud();
  const { driverId, customerName, customerPhone, destinationName, destinationLatitude, destinationLongitude, etaMinutes } = req.body;
  const id = `ride_${Date.now()}`;
  
  const newRide: ActiveRide = {
    id,
    driverId: driverId || "ali",
    customerName: customerName || "לקוח קצה",
    customerPhone: customerPhone || "",
    destinationName: destinationName || "מיקום כללי",
    destinationLatitude: parseFloat(destinationLatitude) || 32.0853,
    destinationLongitude: parseFloat(destinationLongitude) || 34.7818,
    etaMinutes: parseInt(etaMinutes) || 15,
    status: "active",
    createdAt: new Date().toISOString(),
    wazeLink: `https://waze.com/ul?ll=${destinationLatitude},${destinationLongitude}&navigate=yes`
  };

  dbState.activeRides[id] = newRide;
  await syncToFirestore("activeRides", id, newRide);
  res.json({ success: true, ride: newRide });
});

app.post("/api/webhook", async (req, res) => {
  await restoreStateFromCloud();
  const { time, vehicle, driver, latitude, longitude, address, ptoState, alertType, text } = req.body;
  
  let matchedDriverId = "hikmat";
  if (driver && (driver.toLowerCase().includes("ali") || driver.toLowerCase().includes("עלי") || driver.toLowerCase().includes("علي"))) {
    matchedDriverId = "ali";
  }

  const normalizedPto = ptoState === "open" || ptoState === "opened" ? "open" : "closed";
  const driverName = matchedDriverId === "hikmat" ? "חכמת" : "עלי";

  const updatedVehicle: VehicleState = {
    ...dbState.fleet[matchedDriverId],
    latitude: parseFloat(latitude) || dbState.fleet[matchedDriverId].latitude,
    longitude: parseFloat(longitude) || dbState.fleet[matchedDriverId].longitude,
    address: address || dbState.fleet[matchedDriverId].address,
    ptoState: normalizedPto,
    lastUpdated: time || new Date().toISOString(),
    status: normalizedPto === "open" ? "עבודה בשטח" : "בנסיעה",
    pulseActive: true
  };

  dbState.fleet[matchedDriverId] = updatedVehicle;

  const newAlert: AlertLog = {
    id: `alert_${Date.now()}`,
    timestamp: time || new Date().toISOString(),
    vehicle: vehicle || (matchedDriverId === "hikmat" ? "מרצדס מנוף" : "איסוזו משטח"),
    driver: driverName,
    address: updatedVehicle.address,
    ptoState: normalizedPto,
    type: alertType || "location_update",
    message: text || `עדכון מיקום חדש התקבל עבור ${driverName}`
  };

  dbState.alerts.unshift(newAlert);
  if (dbState.alerts.length > 50) dbState.alerts.pop();

  await syncToFirestore("fleet", matchedDriverId, updatedVehicle);
  res.status(200).json({ status: "success", data: updatedVehicle });
});

app.post("/api/chat", async (req, res) => {
  await restoreStateFromCloud();
  // שאר לוגיקת הצ'אט שלך נשארת זהה...
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });
  
  try {
    const aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "MOCK" });
    const response = await aiInstance.models.generateContent({
      model: "gemini-1.5-pro",
      contents: message,
    });
    res.json({ reply: response.text });
  } catch (error) {
    res.json({ reply: "שגיאה בחיבור ל-Gemini. המערכת המקומית עובדת כשגרה." });
  }
});

export default app;
