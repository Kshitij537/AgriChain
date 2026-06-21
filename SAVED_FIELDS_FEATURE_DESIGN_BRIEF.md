# Saved Fields Section - UI Design Brief

## Overview
Design and build a comprehensive **Saved Fields subsection** within the Field page that displays all previously saved farm boundaries with their current health status, quick actions, and comparative analytics. This section should integrate seamlessly with the existing farm boundary setup tool and display real-time NDVI data.

**Target Users:** Farmers with multiple fields who need quick access to field status and management options

---

## 1. Field Cards Grid Layout

### Purpose
Display all saved fields in an organized, visually scannable grid format with key information at a glance.

### Information Architecture
Each field card should contain:
- **Field Name** (large, prominent)
- **Crop Type** (as a badge/tag)
- **Location** (text or coordinates)
- **Area** (hectares)
- **Health Status** (visual indicator + text)
- **Last Updated** (timestamp)
- **Action Menu** (three-dot menu for quick actions)

### Visual Design Requirements
- **Card Size:** Responsive grid (1 col on mobile, 2-3 cols on tablet, 3-4 cols on desktop)
- **Health Status Display:**
  - Good: Green badge with checkmark (✓ Excellent)
  - Moderate: Orange/amber badge with warning icon (⚠ Moderate)
  - Poor: Red badge with alert icon (✗ Poor)
- **Thumbnail Image:** Optional satellite image preview from last data fetch
- **Corner Badge:** Show if field has active alerts (red dot with count)
- **Card Hover State:** Subtle shadow increase, slight scale, reveal more actions

### User Stories
- "As a farmer, I want to see all my fields at a glance so I can quickly identify which fields need attention"
- "As a farmer, I want to know the last time each field was updated with satellite data"

---

## 2. Search & Filter Bar

### Purpose
Allow farmers to quickly locate specific fields and filter by relevant criteria.

### Filter Options
**Primary Filters:**
1. **Crop Type Filter** - Dropdown or checkbox list showing crop types with counts
   - Example: "Wheat (3)", "Rice (2)", "Cotton (1)"
2. **Health Status Filter** - Three toggles (Good, Moderate, Poor)
3. **Alert Status Filter** - Toggle for "Fields with Active Alerts"
4. **Date Range Filter** - "Last updated" within (7 days, 30 days, 90 days, All)

**Search Box:**
- Search by field name (text input with placeholder "Search fields...")
- Real-time filtering as user types

### Layout
- Horizontal filter bar at the top of the grid
- Collapsible advanced filters section
- Clear/Reset button to reset all filters
- Active filter indicators (chips/tags showing which filters are applied)

### User Stories
- "As a farmer, I want to quickly find all my rice fields to compare their health"
- "As a farmer, I want to see only fields with disease or spoilage alerts"

---

## 3. Health Status Sparkline Charts

### Purpose
Display visual trend of field health (NDVI) over time without leaving the grid view.

### Data Points
- **7-day trend:** Small sparkline chart on field card (optional toggle)
- **Color coding:** Green line for uptrend, yellow for flat, red for downtrend
- **Interactive tooltip:** On hover, show exact NDVI values and dates

### Implementation Details
- Embed small chart library (e.g., Recharts) on each card
- Show last 7 or 14 data points depending on available satellite data
- Clicking sparkline navigates to detailed analytics for that field

### Visual Design
- Chart height: ~30-40px, width: 80-100px
- Place chart in upper right of card or below crop type badge
- Add percentage change indicator (e.g., "+5% in 7 days", "-3% in 30 days")

### User Stories
- "As a farmer, I want to see if my field's health is improving or declining without opening detailed analytics"

---

## 4. Quick Actions Menu

### Purpose
Provide easy access to field-specific actions from the cards.

### Actions (Three-Dot Menu on Each Card)
1. **View Details** - Navigate to detailed field analytics page
2. **View on Map** - Show full map view of this specific field
3. **Re-draw Boundary** - Open boundary editor for this field
4. **Schedule Disease Scan** - Trigger disease detection analysis
5. **Check Market Prices** - Navigate to market page filtered by this field's crop
6. **Generate Recommendations** - Get AI recommendations for this field
7. **Add Field Notes** - Open modal to add/edit field notes
8. **Edit Field Info** - Modify field name, crop type, expected harvest
9. **Archive Field** - Move field to inactive/archived section
10. **Delete Field** - Permanently remove field (with confirmation)

### Interaction Design
- Click three-dot icon to open dropdown menu
- Menu items with icons for visual clarity
- Destructive actions (delete) should have warning/confirmation dialog
- Loading states for async actions (e.g., generating recommendations)

---

## 5. Alerts Dashboard Section

### Purpose
Highlight critical issues across all fields that require farmer attention.

### Alert Types
Display as an expandable section above or beside the grid:

**Disease Alerts** (from disease detection service)
- Field name, crop type, detected disease, confidence %
- Severity indicator (High/Medium/Low)
- Action button: "View Full Analysis"

**Spoilage Alerts** (from spoilage service)
- Field name, estimated spoilage risk %
- Days until harvest
- Action button: "Reduce Risk"

**Health Degradation Alerts**
- Fields with NDVI drop >10% in last 7 days
- Suggested actions (irrigation, pest check, etc.)

**Weather Alerts**
- Extreme weather warning for fields in affected regions
- Recommendation to check fields soon

### Display Options
- **Compact view:** Show top 3-5 most critical alerts
- **Expandable:** "View all alerts" button to see complete list
- **Filtering:** Toggle by alert type (Disease, Spoilage, Health, Weather)
- **Dismissible:** Ability to mark alerts as "reviewed" temporarily

### Visual Design
- Alert cards with color-coded left border (Red: High, Orange: Medium, Yellow: Low)
- Icon + field name + alert description + action button
- Timestamp showing when alert was generated

### User Stories
- "As a farmer, I want to immediately see fields with disease or spoilage risks when I open the page"
- "As a farmer, I want to dismiss alerts after addressing them"

---

## 6. Field Notes Feature

### Purpose
Allow farmers to add custom observations, dates, and metadata to each field.

### Note Types
1. **Planting Date** - Date when crop was planted
2. **Expected Harvest Date** - Estimated harvest timing
3. **Custom Notes** - Free-form text for observations (textarea)
4. **Tags/Categories** - Custom tags like "Organic", "Irrigated", "High-Yield", etc.
5. **Field History** - Timeline of events (planting, disease detected, treatment applied, etc.)

### UI Implementation
- Small "Notes" icon/button on field card
- Click opens modal/sidebar with field notes editor
- Auto-save as user types
- Show notes preview on card (first line truncated)
- Display planting/harvest date prominently on card

### Data Model
```
Field Notes:
- fieldId (FK)
- plantingDate
- expectedHarvestDate
- notes (text)
- tags (array)
- createdAt
- updatedAt
- history (array of events with timestamps)
```

### User Stories
- "As a farmer, I want to record when I planted each field so I can track crop cycle"
- "As a farmer, I want to add notes about treatments or observations for future reference"

---

## 7. Comparative Analytics

### Purpose
Allow farmers to compare performance metrics across multiple fields.

### Comparison Options
**Side-by-Side Comparison:**
- Select 2-3 fields via checkboxes on cards
- "Compare Selected" button reveals comparison view
- Show metrics table:
  - Average NDVI (current)
  - NDVI trend (7-day, 30-day)
  - Total area
  - Crop type
  - Health status
  - Last update date

**Aggregate Statistics:**
- Best performing field (highest avg NDVI)
- Worst performing field (lowest avg NDVI)
- Average health by crop type (charts)
- Productivity trends (if historical data exists)

### Visualization
- Comparison table with sparkline charts for trends
- Optional: Grouped bar charts comparing key metrics
- "Export Comparison" button to generate PDF

### UI Location
- Separate "Analytics" or "Compare" tab alongside field cards
- Or modal that opens from grid view

### User Stories
- "As a farmer with multiple fields, I want to see which field is performing best"
- "As a farmer, I want to compare my fields to understand crop-specific patterns"

---

## 8. View Modes

### Purpose
Allow flexible viewing of saved fields based on user preference.

### Three View Options
1. **Grid View** (default)
   - Cards in responsive grid layout
   - Shows: name, crop, area, health status, thumbnail
   - Compact card size

2. **List View**
   - Fields displayed in a table/list format
   - Columns: Name, Crop Type, Area, Location, NDVI Health, Last Updated, Actions
   - Sortable columns (click header to sort)
   - Expandable rows showing field notes

3. **Map View**
   - Interactive map showing all field boundaries
   - Color-coded by health status (green/yellow/red)
   - Click boundary to see field info card
   - Heatmap overlay option showing NDVI intensity
   - Zoom controls, satellite/map layer toggle

### Toggle Control
- Three buttons/icons in top-right of section (Grid, List, Map icons)
- Save user's preference to localStorage

---

## 9. Field Boundary Visualization

### Purpose
Show satellite image context for each field directly in the saved fields section.

### Implementation
**Thumbnail Preview (on cards):**
- Show latest satellite image thumbnail (100x100px)
- Loading skeleton while fetching
- Click to open full map view

**Interactive Boundary Display:**
- Clicking field card highlights it on mini-map embedded in sidebar
- Or clicking "View on Map" opens full Leaflet map with:
  - Satellite imagery layer
  - Field boundary polygon (green or color-coded by health)
  - Zoom focused on field
  - Ability to edit or re-draw boundary
  - NDVI heatmap overlay toggle

### Data Source
- Integrate with existing Sentinel-2/NDVI service
- Cache latest image per field to avoid repeated API calls

---

## 10. Mobile Responsiveness

### Breakpoints
- **Mobile (< 768px):** 
  - Single column card layout
  - Horizontal scroll for filter bar
  - Stacked alerts section
  - Simplified quick actions menu

- **Tablet (768px - 1024px):**
  - 2-column grid
  - Side-by-side filter and cards
  - Larger cards with more visible info

- **Desktop (> 1024px):**
  - 3-4 column grid (configurable)
  - Full filter options visible
  - Sparkline charts visible
  - Side-by-side alerts and grid

### Mobile-Specific Features
- Swipe gestures to navigate between fields
- Bottom sheet modal for quick actions
- Tap to expand card details
- One-tap access to disease scan or recommendations

---

## 11. Color & Styling Standards

### Use Existing Design System
- **Primary Green:** #16a34a (field status: Good)
- **Amber/Warning:** #d97706 (field status: Moderate)
- **Red/Alert:** #dc2626 (field status: Poor)
- **Background:** Tailwind `bg-surface` color
- **Cards:** Glass-morphism effect with border `border-emerald-900/5`
- **Text:** Use `text-primary`, `text-on-surface-variant` from design tokens

### Card Styling
```
- Rounded corners: rounded-lg or rounded-xl
- Shadow: shadow-sm
- Border: border border-emerald-900/5
- Padding: p-6
- Hover state: shadow-md, slight scale transform
```

### Typography
- **Field Name:** text-lg font-bold
- **Crop Type Badge:** text-xs font-bold uppercase
- **NDVI Status:** text-sm font-semibold
- **Timestamp:** text-xs text-on-surface-variant

---

## 12. Integration Points

### With Existing Features
1. **Farm Boundary Setup** - Re-draw boundary should open existing boundary editor
2. **Disease Detection** - "Schedule Disease Scan" button navigates to disease detection page with field pre-selected
3. **Spoilage Risk** - Display spoilage alerts on cards, link to detailed spoilage analysis
4. **Market Prices** - "Check Market Prices" filters market page by field's crop type
5. **Recommendations** - "Generate Recommendations" calls backend service with field data
6. **NDVI Service** - Real-time NDVI data fetching and trend calculations

### API Endpoints Needed
```
GET /api/farms/user - Get all fields for logged-in user
GET /api/farms/:id - Get specific field details
GET /api/ndvi/:fieldId/current - Get current NDVI health
GET /api/ndvi/:fieldId/timeseries - Get NDVI trend data (7, 14, 30 days)
GET /api/ndvi/:fieldId/latest-image - Get latest satellite image
GET /api/alerts/field/:fieldId - Get alerts for specific field
GET /api/alerts/user - Get all alerts for user
POST /api/farms/:id/notes - Save field notes
GET /api/diseases/field/:fieldId - Get disease alerts
GET /api/spoilage/field/:fieldId - Get spoilage alerts
```

---

## 13. User Workflows

### Primary Workflow: Monitor Field Health
1. User opens Field page
2. Sees saved fields grid with health status at a glance
3. Notices one field has orange (Moderate) health status
4. Clicks field card to see sparkline trend
5. Opens quick actions menu and clicks "Generate Recommendations"
6. Receives AI-powered recommendations
7. Adds notes about planned action

### Secondary Workflow: Respond to Alerts
1. User sees alerts dashboard with disease alert on one field
2. Clicks "View Full Analysis" to see disease details
3. Returns to field and clicks "Schedule Disease Scan"
4. Dismisses alert after reviewing

### Tertiary Workflow: Compare Fields
1. User selects multiple fields via checkboxes
2. Clicks "Compare Selected"
3. Views comparative metrics table
4. Exports comparison as PDF for record-keeping

---

## 14. Success Metrics

- Fields with health status visible within 2 seconds
- Users can filter to target fields within 1 action
- Quick actions take < 1 second to execute
- Mobile users can view all fields without horizontal scroll
- Alert dismissal is instant/feels responsive

---

## 15. Implementation Priority

### Phase 1 (MVP)
- [ ] Field cards grid with basic info (name, crop, area, NDVI status)
- [ ] Search/filter by crop type and health status
- [ ] Quick actions menu (View Details, View on Map, Re-draw)
- [ ] Basic alerts section (disease + spoilage)

### Phase 2
- [ ] Health sparkline charts on cards
- [ ] View mode toggle (Grid/List/Map)
- [ ] Field notes feature
- [ ] Comparative analytics

### Phase 3
- [ ] Advanced filters (date range, location)
- [ ] Weather alerts
- [ ] Field boundary history
- [ ] Export/report generation

---

## Design Considerations
- **Performance:** Lazy-load satellite images for cards
- **Accessibility:** Ensure color-coded health status has text labels
- **Offline Support:** Cache field list and last-known health status
- **Real-time Updates:** Consider WebSocket for live NDVI updates
- **Scalability:** Design should handle farmers with 100+ fields

