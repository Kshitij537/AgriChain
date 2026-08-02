# Per-Pixel NDVI Heatmap Implementation

## Overview
This document describes the implementation of zonewise/per-pixel NDVI analysis for precision agriculture. Instead of showing a single average NDVI value for an entire field, the system now calculates and displays NDVI values for individual areas within the field, allowing farmers to identify which specific zones are healthy vs degraded.

## What Changed

### 1. Python Satellite Service (`satellite-service/src/ndvi.py`)
**Status:** ✅ Already implemented (discovered during implementation)

The Python service already has the capability to generate per-pixel NDVI grids:

- **Function:** `generate_ndvi_pixel_grid(ndvi_image, polygon, grid_size=30)`
- **What it does:** 
  - Creates a regular grid of sample points across the field boundary
  - Samples actual NDVI values from the Sentinel-2 satellite imagery at each point
  - Only includes points that fall within the polygon and have valid NDVI data
  - Returns an array of `{lat, lon, ndvi}` objects

- **Function:** `calculate_ndvi_for_region(coordinates, include_pixel_grid=False)`
- **What it does:**
  - Calculates the average NDVI for the entire field (as before)
  - If `include_pixel_grid=True`, also generates per-pixel data using the grid function
  - Returns both the average NDVI and the pixel grid in the response

**Key Parameters:**
- `grid_size`: Default 30x30 grid (900 potential sample points)
- Points are limited to max 400 for performance
- Each pixel represents real satellite data at 10m resolution (Sentinel-2)

### 2. Python Flask API (`satellite-service/app.py`)
**Status:** ✅ Already implemented (discovered during implementation)

The Flask endpoint already accepts and passes through the pixel grid parameter:

```python
@app.route('/api/ndvi/calculate', methods=['POST'])
def calculate_ndvi():
    """
    Expected JSON:
    {
        "coordinates": [[lon, lat], ...],
        "includePixelGrid": true/false  # Optional, for heatmap visualization
    }
    """
    include_pixel_grid = data.get('includePixelGrid', False)
    result = calculate_ndvi_for_region(coordinates, include_pixel_grid=include_pixel_grid)
```

**Response includes:**
- `pixelGrid`: Array of `{lat, lon, ndvi}` objects (only if `includePixelGrid=true`)

### 3. Node.js Backend Service (`backend/src/services/ndviService.js`)
**Status:** ✅ Updated

Modified the `calculateNDVI` function to accept and forward the `includePixelGrid` parameter:

```javascript
const calculateNDVI = async (coordinates, includePixelGrid = false) => {
  const response = await axios.post(`${PYTHON_SERVICE_URL}/api/ndvi/calculate`, {
    coordinates: coordinates,
    includePixelGrid: includePixelGrid,
    timestamp: new Date().toISOString()
  }, {
    timeout: 60000 // Increased timeout for pixel grid processing
  });
  
  return {
    // ... other fields
    pixelGrid: result.pixelGrid || null
  };
};
```

**Changes:**
- Added `includePixelGrid` parameter (defaults to `false` for backward compatibility)
- Increased timeout from 30s to 60s for pixel grid processing
- Returns `pixelGrid` in the response

### 4. Node.js Backend Controller (`backend/src/controllers/ndviController.js`)
**Status:** ✅ Updated

Modified the `calculateNDVI` endpoint to accept and pass through the parameter:

```javascript
const calculateNDVI = async (req, res) => {
  const { coordinates, fieldId: inputFieldId, farmId, includePixelGrid } = req.body;
  
  // Calculate NDVI with optional pixel grid
  const result = await ndviService.calculateNDVI(coordinates, includePixelGrid || false);
  
  res.status(200).json({
    ...result,  // Includes pixelGrid if requested
    fieldId,
    capturedDate,
    alert,
  });
};
```

### 5. Frontend Heatmap Component (`frontend/src/components/NDVIHeatmapCard.jsx`)
**Status:** ✅ Updated

Completely rewrote the heatmap rendering logic:

**Before:**
- Used simulated/random NDVI values: `Math.sin(i * 3.7 + j * 2.1)` for variation
- Approximated spatial variation around the mean NDVI
- Not representative of actual field conditions

**After:**
- Checks if real `pixelGrid` data exists in `ndviData.pixelGrid`
- If available, renders each real satellite pixel with its actual NDVI value
- Falls back to simulated heatmap only if no pixel data is available
- Displays a green badge showing "Real Satellite Data • N pixels"

```javascript
// New function for rendering real pixel data
const addRealNDVIHeatmap = (mapInstance, pixelGrid, fieldData) => {
  console.log(`[NDVI Heatmap] Rendering ${pixelGrid.length} real satellite pixels`);
  
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
  // ...
};
```

**Visual Indicators:**
- Green badge at top center: "Real Satellite Data • {count} pixels"
- Footer message: "✓ Showing real satellite analysis for each area of your field"
- Console logs indicate whether real or simulated data is being used

### 6. Frontend Pages (`frontend/src/pages/`)
**Status:** ✅ Updated

Updated API calls to request pixel grid data:

**FieldAnalytics.jsx:** ✅ Already requesting `includePixelGrid: true`
**FarmBoundarySetup.jsx:** ✅ Updated to request `includePixelGrid: true`

```javascript
// FarmBoundarySetup.jsx - Updated
const ndviResponse = await fetch(`${API_BASE_URL}/api/ndvi/calculate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    coordinates: apiCoordinates,
    includePixelGrid: true  // ← Added this
  })
});

// Store pixelGrid in state
setNdviResult({
  // ... other fields
  pixelGrid: ndviData.pixelGrid  // ← Added this
});
```

## How It Works - End to End

1. **User draws a field boundary** on the map (FarmBoundarySetup or FieldAnalytics)

2. **Frontend sends coordinates** to backend with `includePixelGrid: true`
   ```json
   POST /api/ndvi/calculate
   {
     "coordinates": [[lon, lat], ...],
     "farmId": 123,
     "includePixelGrid": true
   }
   ```

3. **Node.js backend** forwards request to Python satellite service
   - Adds timeout of 60 seconds for processing
   - Passes through `includePixelGrid` parameter

4. **Python satellite service** (Earth Engine):
   - Fetches latest Sentinel-2 imagery (last 30 days, <20% cloud cover)
   - Calculates average NDVI for entire field (as before)
   - **NEW:** Generates 30×30 grid of sample points within the polygon
   - Samples NDVI at each grid point from the satellite image
   - Filters out invalid points (outside polygon, no data)
   - Returns up to 400 real pixel measurements

5. **Response flows back** through Node.js to frontend:
   ```json
   {
     "success": true,
     "ndvi": 0.68,
     "health": "Good",
     "imageDate": "2026-07-15",
     "pixelGrid": [
       {"lat": 40.7128, "lon": -74.0060, "ndvi": 0.72},
       {"lat": 40.7129, "lon": -74.0061, "ndvi": 0.65},
       // ... up to 400 pixels
     ]
   }
   ```

6. **Frontend renders the map**:
   - If `pixelGrid` exists: renders each pixel as a colored circle marker
   - If no `pixelGrid`: falls back to simulated heatmap (old behavior)
   - Color coding: brown (poor) → orange → yellow → green (good)

## Benefits

✅ **Precision Agriculture:** Farmers can see exactly which parts of their field need attention
✅ **Real Data:** Every pixel represents actual satellite measurements, not estimates
✅ **Actionable Insights:** "South corner is yellow (stressed)" vs "Field average is 0.68"
✅ **Backward Compatible:** Falls back to simulated data if satellite data unavailable
✅ **Performance Optimized:** Limited to 400 pixels for fast rendering
✅ **Professional Grade:** Matches what commercial precision ag platforms provide

## Technical Details

### Satellite Data Source
- **Imagery:** Sentinel-2 SR Harmonized (COPERNICUS/S2_SR_HARMONIZED)
- **Resolution:** 10 meters per pixel (real Sentinel-2 resolution)
- **Bands:** B8 (NIR) and B4 (Red) for NDVI calculation
- **Formula:** NDVI = (NIR - Red) / (NIR + Red)
- **Cloud Filtering:** Prefers <20% cloud cover, falls back to <60% if needed
- **Timeframe:** Last 30 days

### Grid Sampling
- **Default Grid:** 30×30 = 900 potential points
- **Max Points:** 400 (performance limit)
- **Sampling Method:** `ee.Reducer.first()` at each point location
- **Point Filtering:** Only includes points inside polygon with valid NDVI data
- **Scale:** 10 meters (matches Sentinel-2 resolution)

### Color Scale
- **< 0.1:** Brown (#8B4513) - Bare soil
- **0.1-0.3:** Red/Orange - Poor/Stressed vegetation
- **0.3-0.6:** Yellow/Gold - Moderate vegetation
- **0.6-0.8:** Light Green - Good vegetation
- **> 0.8:** Dark Green (#006400) - Excellent vegetation

## Testing

To test the implementation:

1. **Start all services:**
   ```bash
   # Terminal 1: Satellite service
   cd satellite-service
   python app.py
   
   # Terminal 2: Backend
   cd backend
   npm start
   
   # Terminal 3: Frontend
   cd frontend
   npm run dev
   ```

2. **Draw a field boundary** in the app (FarmBoundarySetup or FieldAnalytics)

3. **Check the console logs:**
   - Backend: `[NDVI Service] NDVI calculated successfully: 0.68 (237 pixels)`
   - Python: `[Pixel Grid] Generated 237 valid pixel points from 30x30 grid`
   - Frontend: `[NDVI Heatmap] Rendering 237 real satellite pixels`

4. **Verify the map:**
   - Look for green badge: "Real Satellite Data • 237 pixels"
   - Zoom in to see individual colored pixels
   - Check that colors vary across the field (not uniform)
   - Degraded areas should show yellow/orange, healthy areas green

## Performance Considerations

- **Timeout:** 60 seconds (Earth Engine can be slow for first request)
- **Pixel Limit:** 400 points maximum (prevents UI lag)
- **Grid Size:** Configurable (default 30×30, can be adjusted in Python service)
- **Caching:** NDVI results are stored in database (future optimization)
- **Fallback:** Gracefully degrades to simulated heatmap if satellite data unavailable

## Future Enhancements

1. **Higher Resolution:** Increase grid size to 50×50 or 100×100 for larger fields
2. **Time Series Heatmaps:** Show how each pixel's NDVI changes over time
3. **Zone Detection:** Automatically identify and label degraded zones
4. **Export:** Download pixel data as GeoJSON or CSV for GIS analysis
5. **Comparison:** Side-by-side view of current vs historical heatmaps
6. **Prescriptions:** Generate variable-rate fertilizer/irrigation maps based on pixel data

## Files Modified

```
Backend:
✅ /backend/src/services/ndviService.js
✅ /backend/src/controllers/ndviController.js

Frontend:
✅ /frontend/src/components/NDVIHeatmapCard.jsx
✅ /frontend/src/pages/FarmBoundarySetup.jsx
✅ /frontend/src/pages/FieldAnalytics.jsx (already had it)

Python Service: (already implemented)
✅ /satellite-service/src/ndvi.py
✅ /satellite-service/app.py
```

## Conclusion

The per-pixel NDVI heatmap feature is now fully implemented and provides true precision agriculture capabilities. Farmers can now see exactly which parts of their field are healthy vs stressed, enabling targeted interventions and resource optimization.

The implementation discovered that the Python satellite service already had this capability built in — it just needed to be wired through the backend to the frontend and properly rendered on the map!
