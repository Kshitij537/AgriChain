import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import * as turf from '@turf/turf';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Accepts multiple shapes:
// - flat: [[lon, lat], ...]
// - ring: [[[lon, lat], ...]]
// - GeoJSON: { type: 'Polygon', coordinates: [[[lon,lat],...]] }
// - stringified JSON of any of the above
// Returns a flat [[lon,lat], ...] or null.
const normalizeBoundaryCoordinates = (raw) => {
  if (!raw) return null;

  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // GeoJSON-ish
    if (Array.isArray(value.coordinates)) {
      value = value.coordinates;
    } else {
      return null;
    }
  }

  if (!Array.isArray(value) || value.length === 0) return null;

  // If ring/polygon, take the outer ring.
  // value could be: [[[lon,lat],...]] or [[ [lon,lat], ... ], [hole...]]
  if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    value = value[0];
  }

  if (!Array.isArray(value) || value.length < 3) return null;

  const pairs = value
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter(([a, b]) => isFiniteNumber(a) && isFiniteNumber(b));

  if (pairs.length < 3) return null;

  // Heuristic: detect [lat,lon] vs [lon,lat].
  // Count how many points look valid under each interpretation.
  let lonLatScore = 0;
  let latLonScore = 0;
  for (const [a, b] of pairs) {
    const lonLatValid = Math.abs(a) <= 180 && Math.abs(b) <= 90;
    const latLonValid = Math.abs(a) <= 90 && Math.abs(b) <= 180;
    if (lonLatValid) lonLatScore++;
    if (latLonValid) latLonScore++;
  }

  // If more points fit lat/lon than lon/lat, swap.
  if (latLonScore > lonLatScore) {
    return pairs.map(([a, b]) => [b, a]);
  }

  return pairs;
};

const FarmBoundarySetup = () => {
  const navigate = useNavigate();
  const { farmId } = useParams();
  const isEditMode = Boolean(farmId);

  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawnItems = useRef(new L.FeatureGroup());
  const userLocationDot = useRef(null);
  const userAccuracyCircle = useRef(null);
  const userLocationWatchId = useRef(null);
  const hasCenteredOnUser = useRef(false);
  const mapResizeObserver = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLocationFetching, setIsLocationFetching] = useState(false);
  const [boundaryComplete, setBoundaryComplete] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [initialBoundary, setInitialBoundary] = useState(null);
  const [loadingExistingField, setLoadingExistingField] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [farmData, setFarmData] = useState({
    farmName: '',
    cropType: '',
    area: 'Calculating',
    coordinates: null,
  });
  const [ndviLoading, setNdviLoading] = useState(false);
  const [ndviResult, setNdviResult] = useState(null);
  const [ndviError, setNdviError] = useState(null);
  const [ndviTrends, setNdviTrends] = useState({ days7: null, days30: null });
  const [ndviAlert, setNdviAlert] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const updateAreaFromLayers = React.useCallback(() => {
    const layers = drawnItems.current.getLayers();
    if (layers.length === 0) return;

    const layer = layers[0];
    if (!layer?.toGeoJSON) return;

    const geoJson = layer.toGeoJSON();
    let coords = geoJson.geometry.coordinates;

    // Ensure coordinates are closed
    if (coords?.[0]?.length > 0 && coords[0][0] !== coords[0][coords[0].length - 1]) {
      coords[0] = [...coords[0], coords[0][0]];
    }

    const polygon = turf.polygon(coords);
    const areaSquareMeters = turf.area(polygon);
    const areaHectares = Math.abs((areaSquareMeters / 10000).toFixed(2));

    setFarmData((prev) => ({
      ...prev,
      coordinates: coords,
      area: areaHectares,
    }));
  }, []);

  const getNdviOverlayStyle = (health) => {
    if (health === 'Good') {
      return { color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.35, weight: 3 };
    }
    if (health === 'Moderate') {
      return { color: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.35, weight: 3 };
    }
    return { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.35, weight: 3 };
  };

  const applyOverlayToDrawnPolygon = (health) => {
    try {
      const layers = drawnItems.current?.getLayers?.() || [];
      if (layers.length === 0) return;
      const layer = layers[0];
      if (layer?.setStyle) {
        layer.setStyle(getNdviOverlayStyle(health));
      }
    } catch (e) {
      console.warn('Failed to apply NDVI overlay style:', e);
    }
  };

  const fetchTrend = async (apiCoordinates, days, fieldId) => {
    const response = await fetch(`${API_BASE_URL}/api/ndvi/timeseries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: apiCoordinates,
        days,
        fieldId,
      }),
    });

    const data = await response.json();
    if (!data.success) return null;
    return data.trend || null;
  };

  const formatPct = (pct) => {
    if (pct === null || pct === undefined) return '—';
    const value = Number(pct);
    if (!Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`;
  };

  // Capture current map view as image with timeout
  const captureMapSnapshot = async () => {
    try {
      if (!mapContainer.current) {
        console.warn('Map container not found for snapshot');
        return null;
      }

      // DEPRECATED: html2canvas approach was causing timeouts and failures
      // Just return null - NDVI will be saved without image
      console.log('⚠️ Map snapshot capture skipped (use static URL instead)');
      return null;
    } catch (error) {
      console.warn('Failed to capture map snapshot:', error.message);
      return null;
    }
  };

  // Initialize map
  useEffect(() => {
    if (!map.current) {
      map.current = L.map(mapContainer.current, {
        maxZoom: 22,
        minZoom: 2,
      }).setView([20.5937, 78.9629], 5);

      // Add satellite tile layer (Sentinel-2 via USGS)
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, DigitalGlobe, Earthstar Geographics',
        // Esri World Imagery has a native zoom ceiling. Allow gentle over-zoom beyond that.
        maxNativeZoom: 19,
        maxZoom: 22,
        minZoom: 2,
        crossOrigin: true,
        className: 'leaflet-tiles-smooth'
      }).addTo(map.current);

      // Add drawn items feature group
      map.current.addLayer(drawnItems.current);

      // Initialize Leaflet Draw
      const drawControl = new L.Control.Draw({
        position: 'topleft',
        draw: {
          polygon: {
            shapeOptions: {
              color: '#FBBF24',
              weight: 3,
              opacity: 1,
              fillColor: '#86EFAC',
              fillOpacity: 0.25,
            },
            showArea: true,
          },
          polyline: false,
          rectangle: false,
          circle: false,
          marker: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItems.current,
          remove: true,
        },
      });

      map.current.addControl(drawControl);

      // Handle draw events
      map.current.on('draw:created', (e) => {
        const layer = e.layer;
        // Keep exactly one polygon at a time
        drawnItems.current.clearLayers();
        drawnItems.current.addLayer(layer);
        setBoundaryComplete(true);
        setIsDrawing(false);
        updateAreaFromLayers();
      });

      map.current.on('draw:edited', () => {
        setBoundaryComplete(true);
        updateAreaFromLayers();
      });

      map.current.on('draw:deleted', () => {
        if (drawnItems.current.getLayers().length === 0) {
          setBoundaryComplete(false);
          setFarmData(prev => ({
            ...prev,
            area: 'Calculating',
            coordinates: null,
          }));
        }
      });

      // Keep Leaflet's internal sizing in sync with the flex/absolute layout.
      // Without this, overlays (polygons) can visually drift during zoom on some browsers.
      if (mapContainer.current && typeof ResizeObserver !== 'undefined') {
        mapResizeObserver.current = new ResizeObserver(() => {
          // Defer a tick so layout has settled
          requestAnimationFrame(() => {
            map.current?.invalidateSize({ animate: false });
          });
        });
        mapResizeObserver.current.observe(mapContainer.current);
      }

      // Initial invalidate after mount
      requestAnimationFrame(() => {
        map.current?.invalidateSize({ animate: false });
      });

      setMapReady(true);
    }

    return () => {
      // Cleanup live geolocation tracking
      if (userLocationWatchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(userLocationWatchId.current);
        userLocationWatchId.current = null;
      }

      if (mapResizeObserver.current) {
        mapResizeObserver.current.disconnect();
        mapResizeObserver.current = null;
      }

      if (map.current) {
        if (userLocationDot.current) {
          map.current.removeLayer(userLocationDot.current);
          userLocationDot.current = null;
        }
        if (userAccuracyCircle.current) {
          map.current.removeLayer(userAccuracyCircle.current);
          userAccuracyCircle.current = null;
        }
      }
    };
  }, []);

  // Load an existing farm (edit mode)
  useEffect(() => {
    if (!isEditMode) return;

    const fetchExistingFarm = async () => {
      try {
        setLoadingExistingField(true);
        const response = await fetch(`${API_BASE_URL}/api/farms/${farmId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch field: ${response.status}`);
        }

        const data = await response.json();
        if (!data?.success || !data?.farm) {
          throw new Error(data?.error || 'Failed to load field');
        }

        const farm = data.farm;
        setFarmData((prev) => ({
          ...prev,
          farmName: farm.name || '',
          cropType: farm.cropType || '',
          area: typeof farm.area === 'number' ? farm.area : prev.area,
        }));

        const normalized = normalizeBoundaryCoordinates(farm.boundaryCoordinates);
        if (Array.isArray(normalized) && normalized.length >= 3) {
          setInitialBoundary(normalized);
        } else {
          // Existing data may not have stored boundary yet
          console.warn('No usable boundaryCoordinates found for farm. User must redraw.');
        }
      } catch (e) {
        console.error('Failed to load existing farm:', e);
        alert(e?.message || 'Failed to load field for editing');
      } finally {
        setLoadingExistingField(false);
      }
    };

    fetchExistingFarm();
  }, [isEditMode, farmId, API_BASE_URL]);

  // Draw initial boundary onto the map once both map and boundary are ready
  useEffect(() => {
    if (!mapReady) return;
    if (!Array.isArray(initialBoundary) || initialBoundary.length < 3) return;
    if (!map.current) return;

    try {
      drawnItems.current.clearLayers();

      const latLngs = initialBoundary.map(([lon, lat]) => [lat, lon]);
      const polygonLayer = L.polygon(latLngs, {
        color: '#FBBF24',
        weight: 3,
        opacity: 1,
        fillColor: '#86EFAC',
        fillOpacity: 0.25,
      });

      drawnItems.current.addLayer(polygonLayer);
      setBoundaryComplete(true);
      setIsDrawing(false);

      // Fit view to polygon
      requestAnimationFrame(() => {
        try {
          map.current?.fitBounds(polygonLayer.getBounds(), { padding: [24, 24] });
        } catch {
          // ignore
        }
      });

      updateAreaFromLayers();
    } catch (e) {
      console.warn('Failed to render initial boundary:', e);
    }
  }, [mapReady, initialBoundary, updateAreaFromLayers]);

  // Handle search
  const handleSearch = async () => {
    if (!searchInput.trim()) return;

    try {
      setIsLocationFetching(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}`
      );
      const data = await response.json();

      if (data.length > 0) {
        const { lat, lon } = data[0];
        map.current.setView([parseFloat(lat), parseFloat(lon)], 14);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLocationFetching(false);
    }
  };

  // Handle current location
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }

    // If already tracking, just recenter to last known position
    if (userLocationWatchId.current != null && userLocation) {
      map.current?.setView([userLocation.lat, userLocation.lng], 17);
      return;
    }

    hasCenteredOnUser.current = false;
    setIsLocationFetching(true);

    userLocationWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const lat = latitude;
        const lng = longitude;

        setUserLocation({
          lat,
          lng,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
          timestamp: position.timestamp,
        });

        if (map.current) {
          // Blue dot (Google Maps style)
          if (!userLocationDot.current) {
            userLocationDot.current = L.circleMarker([lat, lng], {
              radius: 7,
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillColor: '#2563eb',
              fillOpacity: 1,
              interactive: false,
            }).addTo(map.current);
          } else {
            userLocationDot.current.setLatLng([lat, lng]);
          }

          // Accuracy circle
          if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
            if (!userAccuracyCircle.current) {
              userAccuracyCircle.current = L.circle([lat, lng], {
                radius: Math.max(accuracy, 5),
                color: '#3b82f6',
                weight: 1,
                opacity: 0.8,
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                interactive: false,
              }).addTo(map.current);
            } else {
              userAccuracyCircle.current.setLatLng([lat, lng]);
              userAccuracyCircle.current.setRadius(Math.max(accuracy, 5));
            }
          }

          // Center once on first fix
          if (!hasCenteredOnUser.current) {
            map.current.setView([lat, lng], 17);
            hasCenteredOnUser.current = true;
          }
        }

        setIsLocationFetching(false);
      },
      (error) => {
        console.error('Location error:', error);
        setIsLocationFetching(false);
        if (error?.code === 1) {
          alert('Location permission denied. Please allow location access and try again.');
        } else {
          alert('Unable to get accurate location. Please try again outdoors or enable GPS.');
        }
        if (userLocationWatchId.current != null) {
          navigator.geolocation.clearWatch(userLocationWatchId.current);
          userLocationWatchId.current = null;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // Handle save field with NDVI calculation
  const handleSaveField = async () => {
    if (!boundaryComplete) {
      alert('Please draw a boundary first');
      return;
    }

    if (!farmData.coordinates) {
      alert('Unable to extract coordinates. Please redraw the boundary.');
      return;
    }

    if (!farmData.farmName.trim()) {
      alert('Please enter a field name');
      return;
    }

    setNdviLoading(true);
    setNdviError(null);
    setNdviAlert(null);

    try {
      // Convert coordinates to flat [lon, lat] array format for API
      const apiCoordinates = farmData.coordinates[0].map(coord => [coord[0], coord[1]]);
      
      console.log('🚀 Step 1: NDVI Calculation');
      console.log('📍 Coordinates:', apiCoordinates);

      // Step 1: Calculate NDVI
      const ndviResponse = await fetch(`${API_BASE_URL}/api/ndvi/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: apiCoordinates
        })
      });

      console.log('📊 NDVI Response Status:', ndviResponse.status);
      const ndviData = await ndviResponse.json();
      console.log('📋 NDVI Response Data:', ndviData);

      if (ndviData.success) {
        console.log('NDVI calculation successful:', ndviData);
        setNdviResult({
          ndvi: ndviData.ndvi,
          health: ndviData.health,
          status: ndviData.status,
          ndviRaw: ndviData.ndviRaw,
          imageDate: ndviData.imageDate,
          cloudCoverage: ndviData.cloudCoverage,
          timestamp: ndviData.timestamp,
          fieldId: ndviData.fieldId,
          capturedDate: ndviData.capturedDate
        });

        setNdviAlert(ndviData.alert || null);
        applyOverlayToDrawnPolygon(ndviData.health);

        // Fetch trend stats (7d and 30d)
        try {
          const [days7, days30] = await Promise.all([
            fetchTrend(apiCoordinates, 7, ndviData.fieldId),
            fetchTrend(apiCoordinates, 30, ndviData.fieldId),
          ]);
          setNdviTrends({ days7, days30 });
        } catch (trendError) {
          console.warn('Trend fetch failed:', trendError);
          setNdviTrends({ days7: null, days30: null });
        }

        // Step 2: Save farm to database
        console.log('🚀 Step 2: Save Farm to Database');
        try {
          const bounds = L.latLngBounds(apiCoordinates.map(coord => [coord[1], coord[0]]));
          const centerLat = bounds.getCenter().lat;
          const centerLng = bounds.getCenter().lng;

          const farmPayload = {
            name: farmData.farmName,
            latitude: centerLat,
            longitude: centerLng,
            area: parseFloat(farmData.area),
            cropType: farmData.cropType || 'Unknown',
            location: `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`,
            boundaryCoordinates: apiCoordinates,
          };

          console.log('📝 Farm Payload:', farmPayload);

          const farmUrl = isEditMode ? `${API_BASE_URL}/api/farms/${farmId}` : `${API_BASE_URL}/api/farms`;
          const farmMethod = isEditMode ? 'PUT' : 'POST';

          const farmResponse = await fetch(farmUrl, {
            method: farmMethod,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(farmPayload)
          });

          console.log('🏠 Farm Response Status:', farmResponse.status);
          const farmData_response = await farmResponse.json();
          console.log('🏠 Farm Response Data:', farmData_response);

          if (farmData_response.success) {
            const farmIdToUse = isEditMode ? Number(farmId) : farmData_response.farm.id;
            console.log('✓ Farm saved successfully with ID:', farmIdToUse);

            // Step 3: Capture map snapshot and save NDVI data with farm_id
            try {
              console.log('🚀 Step 3: Capture Map & Save NDVI');
              console.log('📸 Capturing map snapshot...');
              const mapSnapshot = await captureMapSnapshot();
              
              if (mapSnapshot) {
                console.log('✓ Map snapshot ready, sending NDVI data...');
              } else {
                console.warn('⚠ Map snapshot failed, saving NDVI without image');
              }
              
              const ndviPayload = {
                ndviValue: ndviData.ndvi,
                healthStatus: ndviData.health,
                imageDate: ndviData.imageDate,
                cloudCoverage: ndviData.cloudCoverage,
              };

              // Only add imageUrl if capture succeeded and is not null
              if (mapSnapshot && mapSnapshot.length < 5000000) { // Limit to 5MB
                ndviPayload.imageUrl = mapSnapshot;
                console.log('✓ Map snapshot included in payload');
              } else {
                console.log('⚠ Skipping image (capture failed or too large), saving NDVI without image');
              }

              console.log('📤 Sending NDVI payload...');

              const ndviSaveResponse = await fetch(`${API_BASE_URL}/api/farms/${farmIdToUse}/ndvi`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(ndviPayload)
              });

              console.log('📊 NDVI Save Response Status:', ndviSaveResponse.status);

              if (!ndviSaveResponse.ok) {
                const errorText = await ndviSaveResponse.text();
                throw new Error(`API returned ${ndviSaveResponse.status}: ${errorText}`);
              }

              const ndviSaveData = await ndviSaveResponse.json();
              console.log('📋 NDVI Save Response:', ndviSaveData);

              if (ndviSaveData.success) {
                console.log('✓ NDVI data saved successfully');
              } else {
                console.error('❌ NDVI data save failed:', ndviSaveData.error);
                throw new Error(ndviSaveData.error || 'NDVI save returned success: false');
              }
            } catch (ndviSaveError) {
              console.error('❌ NDVI save error:', ndviSaveError.message);
              setNdviError(`Failed to save NDVI: ${ndviSaveError.message}`);
              // Don't redirect on NDVI error - let user see the issue
              setNdviLoading(false);
              return;
            }

            setShowSuccess(true);
            setTimeout(() => {
              setShowSuccess(false);
              // Redirect to saved fields page
              navigate('/saved-fields');
            }, 2000);
          } else {
            setNdviError(farmData_response.error || 'Failed to save farm');
            console.error('Farm save error:', farmData_response.error);
          }
        } catch (farmError) {
          const errorMsg = farmError.message || 'Failed to save farm to database';
          setNdviError(errorMsg);
          console.error('Farm save fetch error:', farmError);
        }
      } else {
        setNdviError(ndviData.error || 'Failed to calculate NDVI');
        console.error('NDVI error:', ndviData.error);
      }
    } catch (error) {
      const errorMsg = error.message || 'Failed to calculate NDVI. Check if backend is running and satellite service is reachable.';
      setNdviError(errorMsg);
      console.error('NDVI fetch error:', error);
    } finally {
      setNdviLoading(false);
    }
  };

  // Calculate polygon area using Turf.js (accounts for Earth's curvature)
  // (Area is now calculated in real-time in draw event handlers)

  const handleCancel = () => {
    drawnItems.current.clearLayers();
    setBoundaryComplete(false);
    setFarmData({ farmName: '', cropType: '', area: 'Calculating', coordinates: null });
    setShowSuccess(false);
    setNdviResult(null);
    setNdviError(null);
    setNdviLoading(false);
    setNdviTrends({ days7: null, days30: null });
    setNdviAlert(null);
  };

  return (
    <div className="h-screen bg-surface font-body text-on-surface flex overflow-hidden">
      <style jsx global>{`
        .leaflet-container {
          background: #dadad5;
        }

        .leaflet-tile {
          filter: saturate(1.1) contrast(1.05);
        }
        
        .leaflet-control-draw {
          margin-top: 16px;
          margin-left: 16px;
        }

        .leaflet-draw-toolbar a {
          background-color: rgba(255, 255, 255, 0.9) !important;
          border: 1px solid rgba(200, 200, 200, 0.3) !important;
          color: #00311f !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
        }

        .leaflet-draw-toolbar a:hover {
          background-color: rgba(255, 255, 255, 1) !important;
        }

        .glass-panel {
          background: rgba(250, 250, 245, 0.8);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .bg-signature-gradient {
          background: linear-gradient(135deg, #004a31 0%, #2b5bb5 100%);
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .fade-in-scale {
          animation: fadeInScale 0.3s ease-out;
        }

        /* Hide tile border lines */
        .leaflet-tile-pane .leaflet-tile {
          outline: none;
          border: none;
        }

        /* Smooth tile rendering */
        .leaflet-tile-pane {
          background: transparent;
        }

        /* Remove grid/graticule lines if any */
        .leaflet-graticule {
          opacity: 0 !important;
        }

        /* Smooth tile rendering */
        .leaflet-tiles-smooth {
          image-rendering: smooth;
          image-rendering: -webkit-optimize-contrast;
        }

        /* Remove tile seams and borders */
        img.leaflet-tile {
          border: none;
          outline: none;
          margin: 0;
          padding: 0;
          filter: none;
        }

        /* Prevent tile gaps */
        .leaflet-tile-pane img {
          border: 0;
          clip-path: inset(0);
        }

        /* Force overlays above Leaflet map */
        .z-50 {
          z-index: 50 !important;
        }

        .pointer-events-auto {
          pointer-events: auto !important;
        }

        /* Prevent Leaflet from covering overlays */
        .leaflet-pane {
          z-index: 1 !important;
        }
      `}</style>

      {/* Sidebar */}
      <Sidebar onLogout={() => {}} />

      <main className="flex flex-1 flex-col overflow-hidden relative ml-72 w-[calc(100%-18rem)]">
        {/* Header */}
        <Header user={user} searchPlaceholder="Search village, farm location, or coordinates..." />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden pt-20 h-[calc(100vh-80px)]">
          {/* Left Panel (30%) - Fixed height with proper scrolling */}
          <section className="w-[30%] flex-shrink-0 h-full bg-gradient-to-b from-surface-container-low to-surface-container-lowest p-6 flex flex-col gap-4 overflow-y-auto overscroll-contain">
            {/* Header Card - Enhanced */}
            <div className="bg-gradient-to-br from-surface-container-lowest to-surface-container-high p-5 rounded-2xl shadow-md border-l-4 border-primary hover:shadow-lg transition-shadow flex-shrink-0">
              <h2 className="font-headline text-2xl font-extrabold text-primary leading-tight mb-1">Select Your Farm</h2>
              <p className="text-on-surface-variant text-xs font-body">Mark your field boundary on the satellite map</p>
            </div>

            {/* Search Section - Enhanced */}
            <div className="space-y-2 bg-surface-container-high/30 p-4 rounded-2xl border border-outline-variant/20 flex-shrink-0">
              <label className="text-[10px] font-bold tracking-[0.15em] text-primary px-1 uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-base">search</span>
                Search Location
              </label>
              <div className="flex gap-2">
                <input 
                  className="flex-1 bg-surface rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/30 focus:border-primary transition-all font-body placeholder:text-on-surface-variant/50"
                  placeholder="Enter coordinates..."
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button 
                  onClick={handleSearch}
                  disabled={isLocationFetching}
                  className="bg-primary text-on-primary px-3 rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50 font-headline font-bold"
                >
                  <span className="material-symbols-outlined text-base">near_me</span>
                </button>
              </div>
            </div>

            {/* Current Location Button - Enhanced */}
            <button 
              onClick={handleCurrentLocation}
              disabled={isLocationFetching}
              className="w-full bg-gradient-to-r from-primary to-on-primary-container text-on-primary py-3 px-4 rounded-2xl font-headline font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 active:scale-95 flex-shrink-0 text-sm"
            >
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
              Use Current Location
            </button>

            {/* Instructions Card - Enhanced */}
            <div className="bg-gradient-to-br from-primary/5 to-secondary/5 p-4 rounded-2xl space-y-3 border border-primary/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">map</span>
                <h3 className="text-[9px] font-bold tracking-[0.15em] text-primary uppercase">How To</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold shadow-sm">1</span>
                  <p className="text-xs text-on-surface-variant font-body leading-tight">
                    Select <span className="font-headline font-bold text-primary">Polygon Tool</span> from top-left
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold shadow-sm">2</span>
                  <p className="text-xs text-on-surface-variant font-body leading-tight">
                    Click map to <span className="font-headline font-bold text-primary">mark boundaries</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold shadow-sm">3</span>
                  <p className="text-xs text-on-surface-variant font-body leading-tight">
                    <span className="font-headline font-bold text-primary">Double-click</span> start point to finish
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary text-white text-[9px] flex items-center justify-center flex-shrink-0 font-bold shadow-sm">4</span>
                  <p className="text-xs text-on-surface-variant font-body leading-tight">
                    Review and click <span className="font-headline font-bold text-primary">Save Field</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Field Name & Crop Type Inputs - Enhanced */}
            <div className="bg-surface-container-high/30 p-4 rounded-2xl border border-outline-variant/20 flex-shrink-0 space-y-3">
              <label className="text-[10px] font-bold tracking-[0.15em] text-primary px-1 uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-base">agriculture</span>
                Field Information
              </label>
              
              {/* Field Name Input */}
              <div>
                <label className="text-xs text-on-surface-variant font-bold mb-1 block">Field Name *</label>
                <input 
                  className="w-full bg-surface rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/30 focus:border-primary transition-all font-body placeholder:text-on-surface-variant/50"
                  placeholder="e.g., North Field, Wheat Plot 1"
                  type="text"
                  value={farmData.farmName}
                  onChange={(e) => setFarmData(prev => ({...prev, farmName: e.target.value}))}
                />
              </div>

              {/* Crop Type Input */}
              <div>
                <label className="text-xs text-on-surface-variant font-bold mb-1 block">Crop Type (Optional)</label>
                <input 
                  className="w-full bg-surface rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/30 focus:border-primary transition-all font-body placeholder:text-on-surface-variant/50"
                  placeholder="e.g., Wheat, Rice, Cotton"
                  type="text"
                  value={farmData.cropType || ''}
                  onChange={(e) => setFarmData(prev => ({...prev, cropType: e.target.value}))}
                />
              </div>
            </div>

            {/* Boundary Ready Status - Enhanced */}
            {boundaryComplete && (
              <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/30 p-5 rounded-2xl fade-in-scale shadow-md hover:shadow-lg transition-shadow flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-[9px] font-bold text-primary tracking-[0.1em] uppercase">✓ Boundary Ready</span>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">Field Area</p>
                  <p className="text-3xl font-headline font-extrabold text-primary">
                    {typeof farmData.area === 'number' ? (
                      <>
                        {farmData.area} <span className="text-sm font-medium text-on-surface-variant/70">HA</span>
                      </>
                    ) : (
                      <span className="text-sm italic text-on-surface-variant">{farmData.area}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* NDVI Result Display */}
            {ndviResult && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 p-5 rounded-2xl fade-in-scale shadow-md hover:shadow-lg transition-shadow flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-green-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                  <span className="text-[9px] font-bold text-green-700 tracking-[0.1em] uppercase">🛰️ NDVI Analysis Complete</span>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">Health Status</p>
                      <p className={`text-lg font-headline font-extrabold ${
                        ndviResult.health === 'Good' ? 'text-green-600' : 
                        ndviResult.health === 'Moderate' ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {ndviResult.health}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">NDVI Value</p>
                      <p className="text-lg font-headline font-extrabold text-primary">{(ndviResult.ndvi || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">Status</p>
                    <p className="text-xs text-on-surface-variant leading-tight">{ndviResult.status}</p>
                  </div>

                  {/* Alert: sudden NDVI drop */}
                  {ndviAlert?.triggered && (
                    <div className="bg-white rounded-lg p-3 border-2 border-red-300">
                      <p className="text-[9px] text-red-700 uppercase font-bold tracking-tight mb-1">Alert</p>
                      <p className="text-xs text-red-700 leading-tight">
                        {ndviAlert.message}
                      </p>
                      <p className="text-[10px] text-on-surface-variant mt-2">
                        Change: <span className="font-semibold text-red-700">{(ndviAlert.changeAbs || 0).toFixed(2)}</span>
                        {ndviAlert.changePct != null && (
                          <> (<span className="font-semibold text-red-700">{formatPct(ndviAlert.changePct)}</span>)</>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Time-based trend */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">7 Day Trend</p>
                      <p className="text-lg font-headline font-extrabold text-primary">
                        {formatPct(ndviTrends.days7?.changePct ?? null)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-tight mb-1">30 Day Trend</p>
                      <p className="text-lg font-headline font-extrabold text-primary">
                        {formatPct(ndviTrends.days30?.changePct ?? null)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                    <div className="bg-white rounded-lg p-2 border border-green-200">
                      <p className="text-on-surface-variant font-bold">Image Date</p>
                      <p className="text-primary font-semibold">{ndviResult.imageDate}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-green-200">
                      <p className="text-on-surface-variant font-bold">Cloud Cover</p>
                      <p className="text-primary font-semibold">{(ndviResult.cloudCoverage || 0).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NDVI Error Display */}
            {ndviError && (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 p-5 rounded-2xl fade-in-scale shadow-md flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-red-600 text-xl">error</span>
                  <span className="text-[9px] font-bold text-red-700 tracking-[0.1em] uppercase">Analysis Failed</span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-red-200">
                  <p className="text-xs text-red-600">{ndviError}</p>
                </div>
              </div>
            )}

            {/* Action Buttons - Enhanced */}
            <div className="mt-auto space-y-2 pt-3 flex-shrink-0">
              <div className="flex gap-2">
                <button 
                  onClick={handleCancel}
                  className="flex-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant py-3 px-3 rounded-2xl font-headline font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 border border-outline-variant/30"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveField}
                  disabled={!boundaryComplete || ndviLoading}
                  className="flex-[1.5] bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-on-primary py-3 px-3 rounded-2xl font-headline font-bold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-primary disabled:hover:to-secondary hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                >
                  {ndviLoading ? (
                    <>
                      <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                      Analyzing...
                    </>
                  ) : (
                    isEditMode ? 'Update Field' : 'Save Field'
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Right Area (70%) - Map */}
          <section className="flex-1 h-full relative bg-surface-dim overflow-hidden">
            {/* Map Container - positioned absolutely so overlays render on top */}
            <div
              ref={mapContainer}
              className="absolute inset-0 w-full h-full"
              style={{ minHeight: '600px', background: '#dadad5' }}
            />

            {/* Map Legend/Stats Overlay */}
            <div className="absolute bottom-14 right-8 z-50 pointer-events-auto glass-panel p-6 rounded-xl shadow-2xl border border-white/20 min-w-[240px]">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-primary-fixed animate-ping"></div>
                <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Satellite Intelligence</span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">Current Precision</p>
                    <p className="text-lg font-headline font-bold text-primary">0.5m GSD</p>
                  </div>
                  <span className="material-symbols-outlined text-secondary opacity-40">sensors</span>
                </div>
                <div className="pt-4 border-t border-primary/5">
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">Weather Outlook</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="material-symbols-outlined text-yellow-500">sunny</span>
                    <p className="text-sm font-semibold text-primary">24°C / Optimal</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Status Footer */}
            <footer className="absolute bottom-0 left-0 right-0 h-10 bg-primary/90 backdrop-blur-md flex items-center justify-between px-8 text-white z-50 pointer-events-auto">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-fixed"></div>
                  <span className="text-[10px] font-bold tracking-widest">MAP STATUS: {boundaryComplete ? 'READY TO SAVE' : 'READY FOR DRAWING'}</span>
                </div>
                <div className="flex items-center gap-2 border-l border-white/20 pl-6">
                  <span className="text-[10px] font-bold tracking-widest">SATELLITE VIEW: ACTIVE</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-medium opacity-80">
                <span>LAT: {userLocation ? userLocation.lat.toFixed(5) : '--'}</span>
                <span>LONG: {userLocation ? userLocation.lng.toFixed(5) : '--'}</span>
                <span>ACC: {userLocation?.accuracy ? `${Math.round(userLocation.accuracy)}m` : '--'}</span>
              </div>
            </footer>

            {/* Success Message */}
            {showSuccess && (
              <div className="fixed bottom-32 right-8 glass-panel rounded-xl p-6 shadow-2xl border border-white/20 fade-in-scale z-50 pointer-events-auto">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary-fixed text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className="text-primary font-headline font-bold">Field boundary saved!</p>
                    <p className="text-sm text-on-surface-variant">Your farm is now registered</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default FarmBoundarySetup;
