import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const HA_TO_ACRES = 2.47105;
const formatAcres = (ha) => {
  const num = Number(ha);
  if (!Number.isFinite(num)) return '—';
  return `${(num * HA_TO_ACRES).toFixed(2)} ac`;
};

const NDVIHeatmapCard = ({ field, ndviData }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !field) return;

    // Initialize map if not already done
    if (!map.current) {
      const center = field.latitude && field.longitude 
        ? [field.latitude, field.longitude]
        : [40.7128, -74.006]; // Default to NYC if no coordinates

      map.current = L.map(mapContainer.current, {
        center: center,
        zoom: 15,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
      });

      // Add satellite tile layer (using Esri satellite imagery)
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 20,
      }).addTo(map.current);

      // Add field boundary if coordinates exist
      if (field.boundaryCoordinates && Array.isArray(field.boundaryCoordinates)) {
        const coordinates = field.boundaryCoordinates.map(coord => [coord[1], coord[0]]); // Convert to [lat, lon]
        
        // Create polygon with field boundary
        L.polygon(coordinates, {
          color: '#004a31',
          weight: 3,
          opacity: 0.8,
          fillOpacity: 0.2,
          fillColor: '#004a31',
        }).addTo(map.current);

        // Fit bounds to field
        const group = new L.featureGroup([L.polygon(coordinates)]);
        map.current.fitBounds(group.getBounds(), { padding: [50, 50] });
      }

      // Add NDVI heatmap grid overlay
      if (ndviData?.pixelGrid && Array.isArray(ndviData.pixelGrid)) {
        // Use real per-pixel data from satellite service
        addRealNDVIHeatmap(map.current, ndviData.pixelGrid, field);
      } else if (ndviData?.ndvi) {
        // Fallback to simulated heatmap if no pixel data available
        addSimulatedNDVIHeatmap(map.current, field, ndviData.ndvi);
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [field, ndviData]);

  const addRealNDVIHeatmap = (mapInstance, pixelGrid, fieldData) => {
    console.log(`[NDVI Heatmap] Rendering ${pixelGrid.length} real satellite pixels`);

    // Render each pixel from the satellite data
    pixelGrid.forEach(pixel => {
      const color = getNDVIColor(pixel.ndvi);
      L.circleMarker([pixel.lat, pixel.lon], {
        radius: 6,
        fillColor: color,
        color: color,
        weight: 0,
        opacity: 0.85,
        fillOpacity: 0.75,
      }).addTo(mapInstance);
    });

    // Add field boundary on top
    if (fieldData.boundaryCoordinates) {
      const coordinates = fieldData.boundaryCoordinates.map(coord => [coord[1], coord[0]]);
      L.polygon(coordinates, {
        color: '#000000',
        weight: 4,
        opacity: 1,
        fillOpacity: 0,
        dashArray: '5, 5',
      }).addTo(mapInstance);
    }
  };

  const addSimulatedNDVIHeatmap = (mapInstance, fieldData, ndviValue) => {
    if (!fieldData.boundaryCoordinates) return;

    console.log('[NDVI Heatmap] Using simulated heatmap (no pixel data available)');

    const coordinates = fieldData.boundaryCoordinates.map(coord => [coord[1], coord[0]]);

    const lats = coordinates.map(c => c[0]);
    const lons = coordinates.map(c => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const latStep = (maxLat - minLat) / 25;
    const lonStep = (maxLon - minLon) / 25;

    for (let i = 0; i <= 25; i++) {
      for (let j = 0; j <= 25; j++) {
        const lat = minLat + i * latStep;
        const lon = minLon + j * lonStep;

        if (!isPointInPolygon([lat, lon], coordinates)) continue;

        const distFromCenter = Math.sqrt(
          Math.pow((lat - centerLat) / Math.max(maxLat - minLat, 1e-9), 2) +
          Math.pow((lon - centerLon) / Math.max(maxLon - minLon, 1e-9), 2)
        );

        // Deterministic variation based on grid position
        const pseudoVariation = (Math.sin(i * 3.7 + j * 2.1) * 0.5 + 0.5 - 0.5) * 0.12;
        const centerMultiplier = Math.exp(-distFromCenter * 1.8);
        const ndvi = Math.max(0.15, Math.min(0.95, ndviValue + (centerMultiplier * 0.2) + pseudoVariation));

        const color = getNDVIColor(ndvi);
        L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: color,
          color: color,
          weight: 0,
          opacity: 0.85,
          fillOpacity: 0.75,
        }).addTo(mapInstance);
      }
    }

    // Field boundary polygon on top
    L.polygon(coordinates, {
      color: '#000000',
      weight: 4,
      opacity: 1,
      fillOpacity: 0,
      dashArray: '5, 5',
    }).addTo(mapInstance);
  };

  const isPointInPolygon = (point, polygon) => {
    // Ray casting algorithm
    const [lat, lon] = point;
    let isInside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0];
      const xj = polygon[j][1], yj = polygon[j][0];
      
      const intersect = ((xi > lon) !== (xj > lon)) &&
        (lat < (yj - yi) * (lon - xi) / (xj - xi) + yi);
      if (intersect) isInside = !isInside;
    }
    
    return isInside;
  };

  const getNDVIColor = (ndviValue) => {
    // NDVI color scale: brown (low) -> orange -> yellow -> green (high)
    if (ndviValue < 0.1) return '#8B4513'; // Brown
    if (ndviValue < 0.2) return '#CD5C5C'; // Indian red
    if (ndviValue < 0.3) return '#FF6347'; // Tomato
    if (ndviValue < 0.4) return '#FF8C00'; // Dark orange
    if (ndviValue < 0.5) return '#FFD700'; // Gold
    if (ndviValue < 0.6) return '#FFFF00'; // Yellow
    if (ndviValue < 0.7) return '#ADFF2F'; // Green yellow
    if (ndviValue < 0.8) return '#32CD32'; // Lime green
    if (ndviValue < 0.9) return '#00CC00'; // Green
    return '#006400'; // Dark green
  };

  const toggleFullscreen = () => {
    if (!mapContainer.current) return;

    if (!fullscreen) {
      if (mapContainer.current.requestFullscreen) {
        mapContainer.current.requestFullscreen();
      } else if (mapContainer.current.webkitRequestFullscreen) {
        mapContainer.current.webkitRequestFullscreen();
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
      }
    }
    setFullscreen(!fullscreen);
  };

  const getNDVIDate = () => {
    if (ndviData?.imageDate) {
      return new Date(ndviData.imageDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    return new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="col-span-12 bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
      <div className="h-full flex flex-col">
        {/* Map Header */}
        <div className="relative h-[500px] bg-surface-container-low">
          {/* Crop Health Date Label */}
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg">
            <span className="text-sm font-bold text-primary">Crop Map, {getNDVIDate()}</span>
          </div>

          {/* Map Controls */}
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button className="w-10 h-10 bg-black/50 text-white rounded flex items-center justify-center hover:bg-black/70 transition-all">
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button className="w-10 h-10 bg-black/50 text-white rounded flex items-center justify-center hover:bg-black/70 transition-all">
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 bg-black/50 text-white rounded flex items-center justify-center hover:bg-black/70 transition-all"
            >
              <span className="material-symbols-outlined text-sm">fullscreen</span>
            </button>
          </div>

          {/* Leaflet Map Container */}
          <div
            ref={mapContainer}
            className="w-full h-full"
            style={{ position: 'relative' }}
          />

          {/* Crop Health Color Legend */}
          <div className="absolute bottom-4 left-4 z-[9999] bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-bold text-on-surface-variant mb-1">Crop Health</div>
                <div className="w-32 h-4 rounded bg-gradient-to-r from-[#8B4513] via-[#FF8C00] via-[#FFD700] to-[#006400]"></div>
                <div className="flex justify-between text-[8px] font-bold text-on-surface-variant">
                  <span>Poor</span>
                  <span>Fair</span>
                  <span>Good</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pixel Data Status Badge */}
          {ndviData?.pixelGrid && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-green-500/90 backdrop-blur-md px-3 py-1 rounded-full shadow-lg">
              <span className="text-xs font-bold text-white">
                Real Satellite Data • {ndviData.pixelGrid.length} pixels
              </span>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div className="p-6 bg-surface-container-lowest">
          <h4 className="text-sm font-bold text-primary mb-1 font-headline">Field Boundary View</h4>
          <p className="text-xs text-on-surface-variant mb-2">
            Field size: {formatAcres(field?.area)}
          </p>
          {ndviData?.ndvi && (
            <p className="text-xs text-on-surface-variant mb-2">
              Crop health score: <span className="font-bold text-primary">{ndviData.ndvi.toFixed(2)}</span>
            </p>
          )}
          {ndviData?.pixelGrid && (
            <p className="text-xs text-green-600 mb-4">
              ✓ Showing real satellite analysis for each area of your field
            </p>
          )}
          <button className="w-full py-2.5 bg-surface-container-low text-primary text-xs font-bold rounded-full hover:bg-surface-container-high transition-all">
            Open Full Map
          </button>
        </div>
      </div>
    </div>
  );
};

export default NDVIHeatmapCard;
