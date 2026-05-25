export interface VehicleState {
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
  speed: number; // Speed in km/h
  pulseActive?: boolean;
}

export interface AlertLog {
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ActiveRide {
  id: string; // e.g. "ride_123"
  driverId: string; // "hikmat" or "ali"
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
