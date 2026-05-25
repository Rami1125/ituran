import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  InfoWindow, 
  useMap, 
  useAdvancedMarkerRef 
} from "@vis.gl/react-google-maps";
import { 
  Truck, 
  Wrench, 
  Navigation, 
  Maximize, 
  MapPin, 
  Clock, 
  Gauge, 
  Activity, 
  Zap, 
  Layers,
  AlertCircle
} from "lucide-react";
import { VehicleState, ActiveRide } from "../types";
import firebaseConfig from "../../firebase-applet-config.json";

// Premium Dark Theme style array for Google Maps (based on Snazzy Maps / Night theme)
const NIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f8fafc" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }]
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#334155" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1e293b" }]
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#94a3b8" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#475569" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#334155" }]
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }]
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#334155" }]
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }]
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#475569" }]
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0f172a" }]
  }
];

// Clean custom theme for light mode to look modern/minimal
const LIGHT_MINIMAL_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#fafafa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#f3f4f6" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e5e7eb" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#e0f2fe" }]
  }
];

// Helper to filter out stub keys, default values, or placeholders
const isStubOrPlaceholder = (key: string | undefined): boolean => {
  if (!key) return true;
  const k = key.trim().toLowerCase();
  return (
    k === "" ||
    k === "your_api_key" ||
    k === "placeholder" ||
    k.includes("fakekey") ||
    k.includes("replace")
  );
};

// Robust central resolution of API key as specified in instruction skill
const API_KEY = [
  process.env.GOOGLE_MAPS_PLATFORM_KEY,
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY,
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY,
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY
].find(key => !isStubOrPlaceholder(key)) || "";

const hasValidKey = Boolean(API_KEY);

/**
 * Custom hook to smoothly interpolate coordinates between updates.
 * Gives real-time truck tracking a fluid glide effect instead of teleporting.
 */
function useInterpolatedPosition(targetLat: number, targetLng: number, duration = 1200) {
  const [currentPos, setCurrentPos] = useState({ lat: targetLat, lng: targetLng });
  const animatingRef = useRef(false);
  const startPosRef = useRef({ lat: targetLat, lng: targetLng });
  const targetPosRef = useRef({ lat: targetLat, lng: targetLng });
  const startTimeRef = useRef(0);

  useEffect(() => {
    // Detect coordinate updates
    if (targetLat !== targetPosRef.current.lat || targetLng !== targetPosRef.current.lng) {
      startPosRef.current = { ...currentPos };
      targetPosRef.current = { lat: targetLat, lng: targetLng };
      startTimeRef.current = performance.now();
      
      if (!animatingRef.current) {
        animatingRef.current = true;
        
        const animate = (time: number) => {
          const elapsed = time - startTimeRef.current;
          const progress = Math.min(elapsed / duration, 1);
          
          // Cubic ease-out interpolation
          const ease = 1 - Math.pow(1 - progress, 3);
          
          const nextLat = startPosRef.current.lat + (targetPosRef.current.lat - startPosRef.current.lat) * ease;
          const nextLng = startPosRef.current.lng + (targetPosRef.current.lng - startPosRef.current.lng) * ease;
          
          setCurrentPos({ lat: nextLat, lng: nextLng });
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            animatingRef.current = false;
          }
        };
        
        requestAnimationFrame(animate);
      }
    }
  }, [targetLat, targetLng, duration]);

  return currentPos;
}

/**
 * Controller subcomponent to compute and frame vehicles inside map bounds.
 * Integrates perfectly with the @vis.gl/react-google-maps hook.
 */
function MapBoundsController({
  vehicles,
  activeRide,
  autoBoundsActive
}: {
  vehicles: VehicleState[];
  activeRide?: ActiveRide | null;
  autoBoundsActive: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !autoBoundsActive || vehicles.length === 0) return;

    // Wait slightly for Google Maps API to load objects safely
    if (typeof google === "undefined" || !google.maps) return;

    const bounds = new google.maps.LatLngBounds();
    let validCount = 0;

    vehicles.forEach((v) => {
      if (v.latitude && v.longitude) {
        bounds.extend({ lat: v.latitude, lng: v.longitude });
        validCount++;
      }
    });

    if (
      activeRide && 
      activeRide.status === "active" && 
      activeRide.destinationLatitude && 
      activeRide.destinationLongitude
    ) {
      bounds.extend({ 
        lat: activeRide.destinationLatitude, 
        lng: activeRide.destinationLongitude 
      });
      validCount++;
    }

    if (validCount > 0) {
      try {
        map.fitBounds(bounds, {
          top: 75,
          bottom: 75,
          left: 75,
          right: 75
        });
      } catch (err) {
        console.warn("Unable to fit bounds:", err);
      }
    }
  }, [map, vehicles, activeRide, autoBoundsActive]);

  return null;
}

/**
 * Highly customized React element wrapping individual vehicles.
 * Implements anchor references, click-to-open InfoWindows in Hebrew, and smooth glides.
 */
interface SmoothVehicleMarkerProps {
  vehicle: VehicleState;
  onSelect?: (v: VehicleState) => void;
  isSelected: boolean;
  theme: "light" | "dark";
  key?: string;
}

function SmoothVehicleMarker({
  vehicle,
  onSelect,
  isSelected,
  theme
}: SmoothVehicleMarkerProps) {
  const animatedPos = useInterpolatedPosition(vehicle.latitude, vehicle.longitude);
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);

  // Auto-sync status selection
  useEffect(() => {
    if (isSelected) {
      setInfoOpen(true);
    } else {
      setInfoOpen(false);
    }
  }, [isSelected]);

  const isPtoOpen = vehicle.ptoState === "open";
  const isHikmat = vehicle.id === "hikmat";

  // Dynamic status-based color variables
  const themeAccent = isPtoOpen 
    ? "from-red-600 to-rose-700 text-white shadow-red-500/20 ring-red-500/40" 
    : isHikmat 
      ? "from-blue-600 to-indigo-700 text-white shadow-blue-500/20 ring-blue-500/30" 
      : "from-emerald-600 to-teal-700 text-white shadow-emerald-500/20 ring-emerald-500/30";

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={animatedPos}
        onClick={() => {
          setInfoOpen(!infoOpen);
          onSelect?.(vehicle);
        }}
        title={`${vehicle.driver} - ${vehicle.vehicle}`}
      >
        {/* Custom Marker Wrapper - explicitly sized to avoid collapsing (CF3 rule) */}
        <div 
          style={{ width: "120px", height: "110px", pointerEvents: "auto" }} 
          className="relative flex flex-col justify-end items-center cursor-pointer select-none group"
        >
          {/* Active Status Badge Floating immediately on top of the map pin */}
          <div className={`mb-1 px-2.5 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all duration-300 ring-2 ${themeAccent} hover:scale-105 active:scale-95`}>
            {isHikmat ? (
              <Wrench className={`w-3 h-3 ${isPtoOpen ? "animate-bounce" : ""}`} />
            ) : (
              <Truck className="w-3.5 h-3.5" />
            )}
            <div className="flex flex-col text-right font-sans leading-tight">
              <span className="text-[10px] font-black truncate max-w-[70px]">
                {vehicle.driver === "חכמת" ? "חכמת" : "עלי"}
              </span>
              <span className="text-[8px] font-mono opacity-90 truncate">
                {vehicle.speed} קמ"ש
              </span>
            </div>
          </div>

          {/* Pointing triangle pointer node */}
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px]-none relative z-10">
            <div className={`w-3 h-3 rotate-45 -mt-2.5 mx-auto border-r border-b border-white/20 shadow-md ${
              isPtoOpen ? "bg-red-600" : isHikmat ? "bg-blue-600" : "bg-emerald-600"
            }`}></div>
          </div>

          {/* Animated Map Ripple Ring Indicator */}
          <div className="relative flex items-center justify-center w-5 h-5 -mt-1.5">
            {isPtoOpen ? (
              <>
                <div className="absolute w-6 h-6 bg-red-500 rounded-full animate-ping opacity-75"></div>
                <div className="absolute w-3 h-3 bg-red-600 rounded-full ring-2 ring-white"></div>
              </>
            ) : (
              <div className={`absolute w-3 h-3 rounded-full ring-2 ring-white shadow-sm ${
                isHikmat ? "bg-blue-600" : "bg-emerald-600"
              }`}></div>
            )}
          </div>
        </div>
      </AdvancedMarker>

      {/* Hebrew InfoWindow details for precision telemetry dispatch details */}
      {infoOpen && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => {
            setInfoOpen(false);
          }}
        >
          <div dir="rtl" className="text-right font-sans p-1.5 max-w-[210px] text-slate-900">
            <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5 mb-1.5">
              <div className={`p-1 rounded-lg ${isPtoOpen ? "bg-red-105 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-[13px] text-slate-950 leading-none">
                  שיוך נהג: {vehicle.driver}
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">{vehicle.vehicle}</p>
              </div>
            </div>

            <div className="space-y-1.5 text-[10.5px]">
              <div className="flex items-center gap-1.5 text-slate-600">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{vehicle.address}</span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-1.5 text-slate-700">
                <span className="flex items-center gap-1">
                  <Zap className={`w-3.5 h-3.5 ${isPtoOpen ? "text-red-500 animate-pulse" : "text-slate-450"}`} />
                  PTO:
                </span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[9.5px] ${
                  isPtoOpen ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                }`}>
                  {isPtoOpen ? "פתוח ⚠️" : "סגור ✅"}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-slate-450" />
                  מהירות נוכחית:
                </span>
                <span className="font-mono font-bold">{vehicle.speed} קמ"ש</span>
              </div>

              <div className="flex items-center justify-between text-slate-500 text-[9.5px] pt-1 border-t border-dashed border-slate-100">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  נצפה לאחרונה:
                </span>
                <span className="font-mono">{new Date(vehicle.lastUpdated).toLocaleTimeString("he-IL")}</span>
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Main upgraded view component
interface LiveMapProps {
  vehicles: VehicleState[];
  selectedVehicleId?: string;
  onVehicleSelect?: (vehicle: VehicleState) => void;
  activeRide?: ActiveRide | null;
  theme?: "light" | "dark";
}

export default function LiveMap({
  vehicles,
  selectedVehicleId,
  onVehicleSelect,
  activeRide,
  theme = "light"
}: LiveMapProps) {
  const [autoBoundsActive, setAutoBoundsActive] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    // Listen for Google Maps authentication failures (e.g., InvalidKeyMapError)
    const originalAuthFailure = (window as any).gm_authFailure;
    
    (window as any).gm_authFailure = () => {
      console.warn("Google Maps credentials validation failed live. Informing user in Hebrew UI.");
      setAuthFailed(true);
      if (typeof originalAuthFailure === "function") {
        originalAuthFailure();
      }
    };

    return () => {
      if (originalAuthFailure) {
        (window as any).gm_authFailure = originalAuthFailure;
      } else {
        delete (window as any).gm_authFailure;
      }
    };
  }, []);

  // Mandatory splash screen triggered when API key is unprovided
  if (!hasValidKey) {
    return (
      <div id="maps-splash-instructions" className="w-full h-full min-h-[300px] bg-slate-900 flex items-center justify-center rounded-2xl md:rounded-3xl border border-slate-800 shadow-md p-6 relative">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-amber-500/5">
            <MapPin className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-white">נדרש מפתח Google Maps API</h3>
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
            כדי להציג את איתור המנופים והארכיטקטורה של איתורן בזמן אמת, יש להגדיר מפתח.
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-right text-xs text-slate-300 space-y-3" dir="rtl">
            <div>
              <strong className="block text-amber-500 font-bold mb-1">מדריך חיבור API מהיר:</strong>
              <ol className="list-decimal list-inside space-y-2 text-slate-400">
                <li>
                  הפק מקרב חשבון גוגל קלאוד שלך מפתח API:
                  <a 
                    href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                    target="_blank" 
                    rel="noopener" 
                    className="text-amber-500 underline font-semibold mr-1"
                  >
                    Google Console ↗
                  </a>
                </li>
                <li>
                  הדבק את המפתח בתיבה המוקפצת <strong>"Enter your environment variable to continue"</strong>.
                </li>
                <li>
                  במידה והתיבה לא צצה: פתח <strong>הגדרות</strong> (⚙️ למעלה מימין) ← <strong>Secrets</strong> ← הוסף <code>GOOGLE_MAPS_PLATFORM_KEY</code> כמפתח, ושמור את מפתח האפליקציה שלך.
                </li>
              </ol>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">הבנייה תסתיים אוטומטית ללא צורך בריענון דפדפן יזום.</p>
        </div>
      </div>
    );
  }

  // Dynamic override UI if the backend validation fails with InvalidKeyMapError
  if (authFailed) {
    return (
      <div id="maps-auth-failure" className="w-full h-full min-h-[300px] bg-slate-900 flex items-center justify-center rounded-2xl md:rounded-3xl border border-red-500/30 shadow-md p-6 relative">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-red-500/5">
            <AlertCircle className="w-7 h-7 text-red-500 animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-white">מפתח ה-API נדחה (Invalid Key)</h3>
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
            מפתח ה-API של Google Maps שהוגדר נדחה על ידי שרתי גוגל (שגיאת <code>InvalidKeyMapError</code>).
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-right text-xs text-slate-300 space-y-3" dir="rtl">
            <div>
              <strong className="block text-amber-500 font-bold mb-1">כיצד לתקן שגיאה זו:</strong>
              <ol className="list-decimal list-inside space-y-2 text-slate-400">
                <li>
                  ודא שהדבקת את מפתח ה-API הנכון מה-Console של גוגל קלאוד.
                </li>
                <li>
                  ב-Cloud Console, ודא שהאפשרות <strong>Maps JavaScript API</strong> מופעלת (Enabled) עבור מפתח זה.
                </li>
                <li>
                  אם הגדרת "הגבלות מפתח" (Key Restrictions), ודא שהדומיין הנוכחי מורשה, או הסר זמנית את ההגבלה לבדיקה.
                </li>
              </ol>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-sans">אנא עדכן את ה-Secret <code>GOOGLE_MAPS_PLATFORM_KEY</code> בהגדרות.</p>
        </div>
      </div>
    );
  }

  return (
    <div id="google-live-tracking-system" className="w-full h-full relative" style={{ minHeight: "280px" }}>
      <APIProvider 
        apiKey={API_KEY} 
        language="iw" 
        region="IL" 
        version="weekly"
      >
        <Map
          defaultCenter={{ lat: 32.0853, lng: 34.7818 }}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="DEMO_MAP_ID" // Enabled AdvancedMarker capability (CF6 requirement)
          styles={theme === "dark" ? NIGHT_STYLES : LIGHT_MINIMAL_STYLES}
          internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
          className="w-full h-full rounded-2xl md:rounded-3xl border border-slate-200/60 shadow-md overflow-hidden"
        >
          {/* Render GPS-synced Vehicles with glides */}
          {vehicles.map((v) => {
            if (!v.latitude || !v.longitude) return null;
            return (
              <SmoothVehicleMarker
                key={v.id}
                vehicle={v}
                isSelected={selectedVehicleId === v.id}
                onSelect={onVehicleSelect}
                theme={theme}
              />
            );
          })}

          {/* Render Active Workday Customer destination location marker */}
          {activeRide && activeRide.status === "active" && activeRide.destinationLatitude && activeRide.destinationLongitude && (
            <AdvancedMarker
              position={{ lat: activeRide.destinationLatitude, lng: activeRide.destinationLongitude }}
            >
              <div 
                style={{ width: "160px", height: "50px" }}
                className="relative flex flex-col items-center justify-end"
              >
                <div className="bg-slate-900 border border-amber-400 text-white px-2.5 py-1.5 rounded-xl shadow-xl font-sans text-[10px] font-bold text-center leading-none">
                  <span className="block text-amber-400 mb-0.5">📌 יעד משלוח</span>
                  <p className="truncate max-w-[130px]">{activeRide.destinationName}</p>
                </div>
                {/* Micro pointer */}
                <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 -mt-1 border-r border-b border-amber-400/20"></div>
              </div>
            </AdvancedMarker>
          )}

          {/* Bound Controller to auto-wrap both vehicles and targets perfectly */}
          <MapBoundsController
            vehicles={vehicles}
            activeRide={activeRide}
            autoBoundsActive={autoBoundsActive}
          />
        </Map>
      </APIProvider>

      {/* Floating control buttons */}
      <div id="map-bounds-controller-ui" className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setAutoBoundsActive(!autoBoundsActive)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-sans shadow-lg border cursor-pointer transition-all ${
            autoBoundsActive 
              ? "bg-blue-600 text-white border-blue-500 scale-100" 
              : "bg-white text-slate-700 bg-white/90 backdrop-blur-sm border-slate-200 hover:bg-white"
          }`}
          title={autoBoundsActive ? "כיבוי מיקוד אוטומטי" : "הפעלת מיקוד אוטומטי לצי"}
        >
          <Maximize className="w-3.5 h-3.5" />
          <span>{autoBoundsActive ? "מיקוד אקטיבי" : "מיקוד כבוי"}</span>
        </button>
      </div>
    </div>
  );
}
