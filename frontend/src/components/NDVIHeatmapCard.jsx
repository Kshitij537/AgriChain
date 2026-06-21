import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Load leaflet-heat for better heatmap visualization
if (typeof window !== 'undefined' && !window.L?.heatLayer) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.min.js';
  document.head.appendChild(script);
}

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

      // Add NDVI heatmap grid overlay if NDVI data exists
      if (ndviData?.ndvi) {
        addNDVIHeatmap(map.current, field, ndviData.ndvi);
      }
    }

    return () => {
      // Don't destroy map on unmount to preserve state
    };
  }, [field, ndviData]);

  const isPointInPolygon = (point, polygon) => {
    // Ray casting algorithm - more robust implementation
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

  const addNDVIHeatmap = (mapInstance, fieldData, ndviValue) => {
    if (!fieldData.boundaryCoordinates) return;

    // Create a heatmap grid overlay with NDVI data
    const coordinates = fieldData.boundaryCoordinates.map(coord => [coord[1], coord[0]]);
    
    // Calculate field bounds to generate properly scaled grid
    const lats = coordinates.map(c => c[0]);
    const lons = coordinates.map(c => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    
    // Calculate dynamic step sizes based on field dimensions
    // Use 25x25 grid for better granularity and containment
    const latStep = (maxLat - minLat) / 25;
    const lonStep = (maxLon - minLon) / 25;

    // Generate a grid of points with NDVI values (simulating satellite data)
    // Only include points inside the field polygon
    const heatmapPoints = [];
    
    for (let i = 0; i <= 25; i++) {
      for (let j = 0; j <= 25; j++) {
        const lat = minLat + i * latStep;
        const lon = minLon + j * lonStep;
        
        // Check if point is inside the field polygon
        if (!isPointInPolygon([lat, lon], coordinates)) continue;
        
        // Create a more realistic NDVI distribution with higher values in center
        const distFromCenter = Math.sqrt(
          Math.pow((lat - centerLat) / (maxLat - minLat), 2) + 
          Math.pow((lon - centerLon) / (maxLon - minLon), 2)
        );
        
        // Gaussian distribution centered at field center
        const centerMultiplier = Math.exp(-distFromCenter * 1.8);
        const variation = (Math.random() - 0.5) * 0.15;
        const ndvi = Math.max(0.15, Math.min(0.95, ndviValue + (centerMultiplier * 0.25) + variation));
        
        heatmapPoints.push([lat, lon, ndvi]);
      }
    }

    // Add heatmap layer with tight constraints to prevent overflow
    if (window.L?.heatLayer && heatmapPoints.length > 0) {
      // Use smaller radius and blur for better polygon containment
      L.heatLayer(heatmapPoints, {
        radius: 22,
        blur: 12,
        maxZoom: 18,
        max: 1.0,
        min: 0.15,
        gradient: getNDVIGradient(),
      }).addTo(mapInstance);
    } else if (heatmapPoints.length > 0) {
      // Fallback: Use CircleMarkers with proper clipping to field boundary
      heatmapPoints.forEach(([lat, lon, intensity]) => {
        const color = getNDVIColor(intensity);
        L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: color,
          color: color,
          weight: 0,
          opacity: 0.85,
          fillOpacity: 0.75,
        }).addTo(mapInstance);
      });
    }

    // Add field boundary polygon with better styling for heatmap visualization
    L.polygon(coordinates, {
      color: '#000000',
      weight: 4,
      opacity: 1,
      fillOpacity: 0,
      dashArray: '5, 5',
    }).addTo(mapInstance);
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

  const getNDVIGradient = () => {
    return {
      0.0: '#8B4513',  // Brown
      0.1: '#A0522D',  // Sienna
      0.2: '#CD5C5C',  // Indian red
      0.3: '#FF6347',  // Tomato
      0.4: '#FF8C00',  // Dark orange
      0.5: '#FFD700',  // Gold
      0.6: '#FFFF00',  // Yellow
      0.7: '#ADFF2F',  // Green yellow
      0.8: '#32CD32',  // Lime green
      0.9: '#00CC00',  // Green
      1.0: '#006400',  // Dark green
    };
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
          {/* NDVI Date Label */}
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg">
            <span className="text-sm font-bold text-primary">NDVI, {getNDVIDate()}</span>
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

          {/* NDVI Color Legend */}
          <div className="absolute bottom-4 left-4 z-[9999] bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-bold text-on-surface-variant mb-1">NDVI Scale</div>
                <div className="w-32 h-4 rounded bg-gradient-to-r from-[#8B4513] via-[#FF8C00] via-[#FFD700] to-[#006400]"></div>
                <div className="flex justify-between text-[8px] font-bold text-on-surface-variant">
                  <span>0.0</span>
                  <span>0.5</span>
                  <span>1.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="p-6 bg-surface-container-lowest">
          <h4 className="text-sm font-bold text-primary mb-1 font-headline">Field Boundary Analysis</h4>
          <p className="text-xs text-on-surface-variant mb-2">
            Coverage: {field?.area || '142.5'} Hectares
          </p>
          {ndviData?.ndvi && (
            <p className="text-xs text-on-surface-variant mb-4">
              Current NDVI: <span className="font-bold text-primary">{ndviData.ndvi.toFixed(2)}</span>
            </p>
          )}
          <button className="w-full py-2.5 bg-surface-container-low text-primary text-xs font-bold rounded-full hover:bg-surface-container-high transition-all">
            Open Full GIS
          </button>
        </div>
      </div>
    </div>
  );
};

export default NDVIHeatmapCard;
