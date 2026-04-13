# Farm Boundary Setup Feature - Design Brief

## 📋 Feature Overview

**Feature Name:** Farm Boundary Setup  
**Purpose:** Allow farmers to visually mark and define their field boundaries using an interactive satellite map interface  
**Route:** `/farm-boundary-setup`  
**Target Users:** Farmers, agricultural professionals  
**Context:** Part of AgriChain - Farm Intelligence Platform (precision agriculture SaaS)

---

## 🎯 Core Functionality

### Primary Goal
Enable farmers to precisely define their farm field boundaries by drawing polygons on a high-resolution satellite map, with automatic area calculation and visual feedback.

### Key Interactions
1. **Search & Locate** - Find farm location by place name or coordinates
2. **GPS Integration** - Center map on user's current location
3. **Polygon Drawing** - Click-based boundary drawing with visual feedback
4. **Real-time Calculation** - Automatic field area estimation in hectares
5. **Save & Confirm** - Store field boundary data with success confirmation

---

## 🗺️ Layout Structure

### Left Control Panel
**Width:** ~30% on desktop, full-width on mobile  
**Background:** Dark (transparent with slight opacity)  
**Border/Glass Effect:** Subtle border with semi-transparent background

#### Components (Top to Bottom):

**1. Header Card**
- Title: "Select Your Farm"
- Subtitle: "Mark your field boundary on the satellite map"
- Design: Card with border, semi-transparent background

**2. Search Location Section**
- Label: "🔍 SEARCH LOCATION" (uppercase, smaller font)
- Search Input Field:
  - Placeholder: "Search village, farm location, or coord..."
  - Icon: Search icon inside
  - Width: Full width of panel
  - Style: Dark input with subtle border
- Search Button: Compact button next to input (icon or arrow)

**3. Current Location Button**
- Text: "Use Current Location"
- Icon: GPS/Location pin icon
- Full width
- Prominent green color
- Action: Centers map on user's geolocation

**4. Instructions Card**
- Label: "📍 INSTRUCTIONS" (uppercase, smaller)
- Format: Numbered list (1-4)
- Steps:
  1. Click polygon tool in top-left
  2. Click on map to draw field boundary
  3. Double-click to complete polygon
  4. Click "Save Field" when ready
- Design: Card with subtle background highlight

**5. Boundary Status Display** (appears after drawing)
- Label: "✓ BOUNDARY READY" (conditional)
- Shows: Estimated Area in hectares
- Format: Large number with unit label
- Animation: Fade-in when boundary is drawn

**6. Action Buttons** (Bottom of panel)
- "Cancel" Button: Secondary style, left
- "Save Field" Button: Primary green, right
- Disabled state: "Save Field" disabled until boundary is drawn
- Layout: Two columns, full width

### Right Satellite Map Area
**Width:** ~70% on desktop, hidden on mobile (vertical stack on mobile)  
**Background:** Dark themed map

#### Map Components:

**1. Main Satellite Map**
- Tile Provider: High-resolution satellite imagery (Esri World Imagery)
- Features:
  - Real-world farm field imagery
  - Actual roads, vegetation patterns, boundaries
  - Zoom levels: 2-18
  - Pan & zoom controls (top-left, in toolbar)
  
**2. Draw Controls** (Top-left corner)
- Position: Floating toolbar
- Tools:
  - Polygon drawing tool (primary)
  - Edit existing polygon tool
  - Delete/Remove tool
- Style: Icons with emerald green theme

**3. Property Boundaries on Map**
- When drawn:
  - Border: Yellow (#FBBF24), 3px weight
  - Fill: Light green (#86EFAC), 25% opacity
  - Interactive: Editable points, drag to modify

**4. Map Status Footer**
- Position: Bottom of map area
- Content:
  - Left: "MAP STATUS" label + current status
  - Right: "SATELLITE VIEW" + "Active" indicator
- Design: Card style, matches panel design

---

## 🎨 Visual Design System

### Color Palette
- **Primary Green:** #4edea3 (emerald-400) - CTA, highlights
- **Dark Green:** #1B5E54 (emerald-950) - Backgrounds
- **Accent Green:** #86EFAC (emerald-300) - Fill, success states
- **Yellow/Border:** #FBBF24 (amber-400) - Polygon borders
- **Dark Background:** #000000 (black)
- **Card Background:** rgba(255, 255, 255, 0.05) - Semi-transparent white
- **Text Primary:** #FFFFFF (white)
- **Text Secondary:** rgba(255, 255, 255, 0.6) - White with opacity

### Typography
- **Headlines:** Manrope font, bold/extrabold
- **Body Text:** Inter font, regular/medium
- **Labels:** Uppercase, smaller size, tracking increased

### Components Style
- **Cards:** Glass-morphism effect
  - Background: rgba(255, 255, 255, 0.05)
  - Border: 1px solid rgba(255, 255, 255, 0.1)
  - Backdrop Filter: blur(10-24px)
  - Rounded Corners: Border-radius 12-16px
  
- **Buttons:**
  - Primary (Green): Gradient from #4edea3 to dark green
  - Secondary: White/5% background with border
  - Hover States: Slightly lighter/brighter
  - Disabled State: Reduced opacity (50%)
  - Active State: Scale/shadow effect

- **Inputs:**
  - Background: rgba(255, 255, 255, 0.05)
  - Border: 1px solid rgba(255, 255, 255, 0.1)
  - Focus: Emerald green border

### Icons
- Use Material Symbols Outlined
- Icons: my_location (GPS), search, add, check_circle, etc.
- Size: 20-24px typically

---

## ✨ UX Details & Interactions

### Search Functionality
- Real-time search result suggestions
- Supports: Place names, village names, coordinates
- API: Nominatim (or similar geocoding)
- On selection: Map auto-centers to location
- Zoom level: ~14-15 (street-level but showing fields)

### GPS Integration
- Button shows loading spinner while fetching
- On success: Map centers on user's location with zoom level 15
- On failure: Graceful error handling
- Requires: Browser geolocation permission

### Polygon Drawing
- Click mode: Each click adds a vertex
- Visual feedback: Small circle/dot at each click
- Guide line: Dashed line showing next edge
- Completion: Double-click to finish
- Edit mode: Drag vertices to adjust
- Delete: Remove entire polygon via toolbar

### Area Calculation
- Automatic: Calculated when polygon is drawn or edited
- Display: In hectares, 2 decimal places
- Formula: Shoelace formula with lat/long conversion
- Update: Real-time as user edits

### Save Functionality
- Validation: Must have complete polygon before enabling
- On click: Shows loading state
- On success: 
  - Toast/notification: "Field boundary saved!"
  - Auto-dismiss after 3 seconds
  - Could optionally clear the map or go to next step
- On error: Show error message with retry option

### Responsive Behavior
- **Desktop (1200px+):** Side-by-side layout (left panel, map)
- **Tablet (768-1199px):** Stacked or adjusted layout
- **Mobile (<768px):** Full-width stacked (panel above map, or tabs to switch)

---

## 🎬 User Flow

```
1. User navigates to /farm-boundary-setup
   ↓
2. Map loads with current viewport (India)
   ↓
3. User either:
   a) Searches for location → Map centers there
   b) Uses current location → Map centers on GPS coords
   ↓
4. User clicks polygon tool
   ↓
5. User clicks points on map to define boundary
   ↓
6. User double-clicks to complete polygon
   ↓
7. System calculates area → Shows in status card
   ↓
8. User clicks "Save Field" OR "Cancel"
   ↓
9. If Save: Success message appears, data stored
   If Cancel: Polygon cleared, start over
```

---

## 📱 Responsive Breakpoints

### Desktop (≥1024px)
- Left panel: 384px (fixed width)
- Right map: Remaining width (flex-grow)
- Horizontal layout

### Tablet (768px - 1023px)
- Adjusted proportions
- May stack on smaller tablets

### Mobile (<768px)
- Full-width stacked layout
- Map takes full height below controls
- Portrait orientation optimized
- Touch-friendly button sizes (48px+)

---

## 🔧 Technical Considerations

### Map Library
- Leaflet.js (lightweight, open-source)
- Drawing tool: Leaflet Draw plugin
- Tile provider: Esri World Imagery (satellite)

### Data Storage
- Polygon saved as GeoJSON format
- Includes: Coordinates, area, timestamp
- Backend endpoint: POST /api/farms/boundary

### Performance
- Lazy load map only when page loaded
- Tile caching for offline support
- Optimize polygon rendering for mobile

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Geolocation API required
- Canvas support for drawing

---

## ✅ Success Criteria

- [ ] Map displays satellite imagery clearly
- [ ] Polygon drawing is intuitive and responsive
- [ ] Search functionality works accurately
- [ ] GPS button centers map correctly
- [ ] Area calculation is accurate
- [ ] Visual feedback (colors, animations) is smooth
- [ ] Save/Cancel work as expected
- [ ] Success message appears and auto-dismisses
- [ ] Fully responsive on all devices
- [ ] Design matches AgriChain brand (emerald theme, glass cards)

---

## 🎓 Design Inspiration References

- **Precision Farming Platforms:** John Deere Operations Center, AGWORLD
- **Modern SaaS:** Figma, Notion, Linear
- **Map Interfaces:** Google Maps, Mapbox
- **Agricultural Apps:** Satellite-based monitoring dashboards

---

## 📝 Component Dependencies

- React (UI framework)
- React Router (navigation)
- Leaflet (map library)
- Leaflet Draw (drawing tools)
- Tailwind CSS (styling)
- Material Symbols (icons)

---

## 🚀 Additional Features (Optional Future Enhancements)

1. Multiple field management (draw/save multiple boundaries)
2. Import existing boundaries (KML, GeoJSON files)
3. Yield map overlay on satellite imagery
4. Soil type visualization
5. Field history (previous boundaries)
6. Share field boundary with team members
7. Field statistics dashboard (perimeter, aspect ratio, etc.)

---

**Status:** Ready for Design Implementation  
**Platform:** Web (responsive, mobile-friendly)  
**Design Timeline:** Standard SaaS component  
**Priority:** High (core onboarding feature)
