# AgriChain Phase 2 - NDVI Implementation

Complete backend implementation for NDVI (Normalized Difference Vegetation Index) calculation using Google Earth Engine with Sentinel-2 satellite imagery.

## Architecture Overview

```
Frontend (React)
    ↓
    POST /api/ndvi/calculate
    ↓
Node.js Express Backend
    ↓ (HTTP)
    ↓
Python Flask Microservice (Earth Engine)
    ↓ (ee.Geometry.Polygon → Sentinel-2)
    ↓
Google Earth Engine
    ↓
Sentinel-2 Satellite Data
    ↓ (NDVI calculation)
    ↓
Response back to Frontend
```

## Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- Google Cloud Project with Earth Engine enabled
- Service Account JSON credentials

### Step 1: Google Cloud Setup

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project

2. **Enable Earth Engine API**:
   - Go to APIs & Services → Library
   - Search for "Earth Engine API"
   - Click Enable

3. **Create Service Account**:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → Service Account
   - Name: `agrichain-earth-engine`
   - Create and Continue (skip optional steps)

4. **Create Service Account Key**:
   - Click on the service account email
   - Go to Keys tab
   - Create JSON key
   - **Save this file securely** (you'll use it for authentication)

5. **Register for Earth Engine**:
   - Go to [Earth Engine Sign Up](https://earthengine.google.com/signup/)
   - Use the service account email
   - Accept terms and complete registration (can take a few hours)

### Step 2: Node.js Backend Setup

```bash
cd /Users/kshitijdeshmukh/Major\ Project/agrichain/backend

# Install dependencies (if not already installed)
npm install axios

# Create .env file (add to existing .env)
echo "PYTHON_SERVICE_URL=http://localhost:5000" >> .env

# Start backend server
npm run dev
```

**Expected Output**:
```
[NDVI Controller] Starting on port 3000
API is running on http://localhost:3000
```

### Step 3: Python Earth Engine Service Setup

```bash
cd /Users/kshitijdeshmukh/Major\ Project/agrichain/earth-engine-service

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Authenticate Earth Engine
earthengine authenticate

# Copy your service account JSON
cp /path/to/service-account.json ./service-account.json

# Create .env file
cp .env.example .env
# Edit .env and set EE_SERVICE_ACCOUNT_KEY=./service-account.json

# Start the Earth Engine service
python app.py
```

**Expected Output**:
```
2024-01-20 10:15:30 - app - INFO - Earth Engine imported successfully
2024-01-20 10:15:35 - app - INFO - Earth Engine initialized successfully
2024-01-20 10:15:40 - app - INFO - Starting Flask server on port 5000 (debug=False)
 * Running on http://0.0.0.0:5000
```

## API Endpoints

### 1. Calculate NDVI for Farm Boundary

**Endpoint**: `POST /api/ndvi/calculate`

**Request** (from Frontend):
```json
{
  "coordinates": [
    [79.08, 21.14],
    [79.09, 21.14],
    [79.09, 21.15],
    [79.08, 21.15],
    [79.08, 21.14]
  ]
}
```

**Response** (Success):
```json
{
  "success": true,
  "ndvi": 0.72,
  "health": "Good",
  "status": "Healthy vegetation with good growth",
  "imageDate": "2024-01-15",
  "cloudCoverage": 5.2,
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "No suitable satellite images found for the specified area and date range"
}
```

### 2. Get Health Classification

**Endpoint**: `GET /api/ndvi/health/:ndviValue`

**Request**:
```
GET http://localhost:3000/api/ndvi/health/0.72
```

**Response**:
```json
{
  "success": true,
  "ndvi": 0.72,
  "health": "Good",
  "status": "Healthy vegetation with good growth"
}
```

### 3. Health Check (Python Service)

**Endpoint**: `GET http://localhost:5000/health`

**Response**:
```json
{
  "status": "Earth Engine service is running",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "ee_initialized": true
}
```

## Health Classification

The NDVI value is classified into three categories:

| NDVI Range | Classification | Status |
|-----------|---|---|
| < 0.3 | **Poor** | Vegetation under stress - immediate intervention recommended |
| 0.3 - 0.6 | **Moderate** | Moderate vegetation growth - monitor closely |
| > 0.6 | **Good** | Healthy vegetation with good growth |

## NDVI Calculation Details

### Satellite Data
- **Source**: Sentinel-2 (COPERNICUS/S2)
- **Resolution**: 30 meters
- **Date Range**: Last 30 days
- **Cloud Filter**: < 20% cloud coverage

### NDVI Formula
```
NDVI = (B8 - B4) / (B8 + B4)

Where:
- B8 = Near Infrared Band (NIR)
- B4 = Red Band
```

### Processing Steps
1. Convert polygon coordinates to ee.Geometry.Polygon
2. Query Sentinel-2 images over the area
3. Filter by date (last 30 days) and cloud coverage (< 20%)
4. Select the best image (least cloudy)
5. Calculate NDVI using normalizedDifference
6. Compute mean NDVI over the polygon using reduceRegion
7. Classify health status based on NDVI value

## Error Handling

### Common Errors

**1. "Python microservice is not available"**
```
Solution: Ensure Earth Engine service is running on port 5000
Command: python app.py
```

**2. "Service account JSON not found"**
```
Solution: Copy service-account.json to earth-engine-service directory
Command: cp /path/to/service-account.json ./service-account.json
```

**3. "No suitable satellite images found"**
```
Reasons:
- Area is too small or has heavy cloud cover
- Outside the 30-day window
- Location has no Sentinel-2 coverage

Solution: Try a larger area or different date range
```

**4. "Earth Engine not authorized"**
```
Solution: 
1. Check service account email in your project
2. Register account at https://earthengine.google.com/signup/
3. Wait for approval (can take a few hours)
```

**5. "Connection refused"**
```
Solution: Ensure both services are running:
- Backend: npm run dev (port 3000)
- Earth Engine: python app.py (port 5000)
```

## Security Checklist

- [ ] `service-account.json` is added to `.gitignore`
- [ ] Service account key is NOT committed to repository
- [ ] `.env` file is in `.gitignore`
- [ ] PYTHON_SERVICE_URL is set in Node.js `.env`
- [ ] Python service only accepts requests from trusted origins
- [ ] Sensitive logs are never printed

## Testing the Implementation

### Test 1: Health Check

```bash
# Test Earth Engine service
curl http://localhost:5000/health

# Test Node.js backend
curl http://localhost:3000/api/health
```

### Test 2: Sample NDVI Calculation

```bash
# Using curl
curl -X POST http://localhost:3000/api/ndvi/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "coordinates": [
      [79.08, 21.14],
      [79.09, 21.14],
      [79.09, 21.15],
      [79.08, 21.15],
      [79.08, 21.14]
    ]
  }'
```

### Test 3: Health Classification

```bash
curl http://localhost:3000/api/ndvi/health/0.72
```

## Performance Considerations

- **Earth Engine Processing**: 5-10 seconds per request
- **Cloud Coverage Filter**: Ensures quality data but may reduce available images
- **30-Day Window**: Balances freshness with availability
- **30m Resolution**: Good balance between detail and processing speed

## Future Enhancements

1. **Time Series Analysis**: Track NDVI changes over multiple dates
2. **Seasonal Patterns**: Analyze crop growth cycles
3. **Predictive Analytics**: Forecast crop yield based on NDVI trends
4. **Comparison Metrics**: Compare current NDVI against historical averages
5. **Export Functionality**: Generate PDF reports for farmers
6. **Multi-Region Analysis**: Compare NDVI across multiple fields
7. **Sensor Fusion**: Combine with UAV data for hyper-local analysis
8. **Machine Learning**: Detect anomalies and predict issues

## Troubleshooting

### Issue: NDVI value is negative or too high
- **Cause**: Water bodies or urban areas in polygon
- **Solution**: Exclude non-agricultural areas from polygon

### Issue: Inconsistent results
- **Cause**: Different date ranges or cloud conditions
- **Solution**: Check image date and cloud coverage in response

### Issue: Service timeout
- **Cause**: Complex polygon or large area
- **Solution**: Simplify polygon or reduce area size

## Code Structure

```
agrichain/
├── backend/
│   └── src/
│       ├── controllers/
│       │   └── ndviController.js      # Request handlers
│       ├── routes/
│       │   └── ndviRoutes.js          # Route definitions
│       └── services/
│           └── ndviService.js         # Business logic
│
└── earth-engine-service/
    ├── app.py                          # Flask application
    ├── requirements.txt                # Python dependencies
    ├── .env.example                    # Environment template
    └── service-account.json            # GCP credentials (DO NOT COMMIT)
```

## References

- [Google Earth Engine Documentation](https://developers.google.com/earth-engine)
- [Sentinel-2 Band Information](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2)
- [NDVI Wikipedia](https://en.wikipedia.org/wiki/Normalized_difference_vegetation_index)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Express.js Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)

## Support

For issues, errors, or questions:
1. Check the error handling section
2. Review the logs in both services
3. Verify service accounts and credentials
4. Ensure Earth Engine API is enabled in Google Cloud

---

**Phase 2 Implementation Complete** ✅

Ready for production deployment with proper security measures and error handling.
