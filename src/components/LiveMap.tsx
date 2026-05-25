import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Truck } from "lucide-react";
import { VehicleState, ActiveRide } from "../types";

// Helper component to update bounds or pan the map reactively
function MapController({ 
  center, 
  zoom, 
  bounds 
}: { 
  center?: [number, number]; 
  zoom?: number; 
  bounds?: [number, number][]; 
}) {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.length > 0) {
      const leafletBounds = L.latLngBounds(bounds);
      map.fitBounds(leafletBounds, { padding: [50, 50], maxZoom: 15 });
    } else if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [map, center, zoom, bounds]);

  return null;
}

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
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Make sure Leaflet asserts client-side context
    setMapReady(true);
  }, []);

  if (!mapReady) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center rounded-2xl animate-pulse">
        <span className="text-slate-500 font-semibold">טוען מפות איתורן...</span>
      </div>
    );
  }

  // Create Custom markers using premium HTML DivIcons for crisp vector styling
  const createCustomMarker = (drv: VehicleState, isSelected: boolean) => {
    const isPtoOpen = drv.ptoState === "open";
    const accentClass = isPtoOpen 
      ? "bg-red-600 ring-4 ring-red-500/30 text-white" 
      : drv.id === "hikmat" 
        ? "bg-blue-600 ring-4 ring-blue-500/20 text-white" 
        : "bg-emerald-600 ring-4 ring-emerald-500/20 text-white";

    const pulseRing = (isPtoOpen || drv.pulseActive) 
      ? `<div class="absolute -inset-2.5 rounded-full bg-red-500/35 animate-ping duration-1000"></div>`
      : "";

    // Set specialized crane or flatbed icon representation
    const markerHtml = `
      <div class="relative flex items-center justify-center transition-all duration-300">
        ${pulseRing}
        <div class="flex items-center gap-1.5 px-3 py-2 rounded-2xl shadow-xl border border-white/40 ${accentClass} font-sans font-black text-xs">
          <span class="whitespace-nowrap">${drv.driver === "חכמת" ? "חכמת (מנוף)" : "עלי (משטח)"}</span>
          <span class="text-[9px] bg-black/20 px-1 py-0.5 rounded-md">${drv.speed} קמ"ש</span>
        </div>
        <div class="absolute top-full w-2.5 h-2.5 bg-current rotate-45 border-r border-b border-white/20 -mt-1 ${
          isPtoOpen ? "text-red-600" : drv.id === "hikmat" ? "text-blue-600" : "text-emerald-600"
        }"></div>
      </div>
    `;

    return L.divIcon({
      html: markerHtml,
      className: "custom-leaflet-marker",
      iconSize: [120, 40],
      iconAnchor: [60, 20]
    });
  };

  const createCustomerMarker = (customerName: string, destinationName: string) => {
    const markerHtml = `
      <div class="relative flex items-center justify-center">
        <div class="absolute -inset-2 rounded-full bg-amber-500/30 animate-pulse"></div>
        <div class="bg-slate-900 border border-amber-400 text-white px-3 py-1.5 rounded-xl shadow-lg font-sans text-[11px] font-bold">
          📍 יעד לקוח: ${customerName}
        </div>
      </div>
    `;
    return L.divIcon({
      html: markerHtml,
      className: "customer-leaflet-marker",
      iconSize: [140, 30],
      iconAnchor: [70, 15]
    });
  };

  // Determine dynamic bounds to fit everything nicely
  const pointsToFit: [number, number][] = [];
  vehicles.forEach(v => {
    if (v.latitude && v.longitude) {
      pointsToFit.push([v.latitude, v.longitude]);
    }
  });

  if (activeRide && activeRide.status === "active") {
    pointsToFit.push([activeRide.destinationLatitude, activeRide.destinationLongitude]);
  }

  // Get current active tile layer based on premium visual layout requested
  // CartoDB Positron for light / CartoDB Dark Matter for dark format
  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png";

  const defaultCenter: [number, number] = [32.0853, 34.7818];

  return (
    <div className="w-full h-full relative" style={{ minHeight: "250px" }}>
      <MapContainer
        center={defaultCenter}
        zoom={11}
        scrollWheelZoom={true}
        className="w-full h-full rounded-2xl md:rounded-3xl border border-slate-200 shadow-md"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
        />

        {/* Render Vehicles Markers */}
        {vehicles.map((v) => {
          if (!v.latitude || !v.longitude) return null;
          return (
            <Marker
              key={v.id}
              position={[v.latitude, v.longitude]}
              icon={createCustomMarker(v, selectedVehicleId === v.id)}
              eventHandlers={{
                click: () => {
                  if (onVehicleSelect) {
                    onVehicleSelect(v);
                  }
                }
              }}
            >
              <Popup className="premium-leaflet-popup">
                <div dir="rtl" className="text-right font-sans p-1">
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5 mb-1">
                    <Truck className="w-4 h-4 text-blue-600" />
                    {v.driver}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">{v.vehicle}</p>
                  <hr className="my-2 border-slate-100" />
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 font-mono">
                    <div>📍 {v.address}</div>
                    <div>⚡ PTO: {v.ptoState === "open" ? "פתוח ⚠️" : "סגור ✅"}</div>
                    <div>📊 מהירות: {v.speed} קמ"ש</div>
                    <div>⏰ עדכון: {new Date(v.lastUpdated).toLocaleTimeString("he-IL")}</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Active Customer Destination marker */}
        {activeRide && activeRide.status === "active" && (
          <Marker
            position={[activeRide.destinationLatitude, activeRide.destinationLongitude]}
            icon={createCustomerMarker(activeRide.customerName, activeRide.destinationName)}
          >
            <Popup>
              <div dir="rtl" className="text-right font-sans text-xs">
                <p className="font-bold text-slate-900">יעד עבודה נוכחי</p>
                <p className="text-slate-500">{activeRide.destinationName}</p>
                <p className="text-slate-500 mt-1">לקוח: {activeRide.customerName}</p>
              </div>
            </Popup>
          </Marker>
        )}

        <MapController bounds={pointsToFit.length > 0 ? pointsToFit : undefined} />
      </MapContainer>
    </div>
  );
}
