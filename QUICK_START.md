# AgriChain NDVI Phase 2 - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- Node.js 16+ installed
- Python 3.8+ installed  
- Google Cloud service account JSON downloaded
- Earth Engine API enabled on your GCP project

### Step 1: Install Node.js Dependencies

```bash
cd backend
npm install
# or add to existing: npm install axios
```

### Step 2: Setup Python Environment

```bash
cd ../earth-engine-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Place your service-account.json in this directory
cp ~/Downloads/service-account.json ./
```

### Step 3: Start Services

**Terminal 1 - Node.js Backend**:
```bash
cd backend
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2 - Python Earth Engine Service**:
```bash
cd earth-engine-service
source venv/bin/activate
python app.py
# Runs on http://localhost:5000
```

### Step 4: Test the API

```bash
# Test health check
curl http://localhost:5000/health

# Test NDVI calculation
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

## 📁 File Structure

```
agrichain/
├── backend/
│   ├── src/
│   │   ├── controllers/ndviController.js ← NEW
│   │   ├── routes/ndviRoutes.js ← NEW
│   │   └── services/ndviService.js ← NEW
│   ├── package.json (axios added)
│   ├── .env (PYTHON_SERVICE_URL added)
│   └── src/app.js (NDVI routes registered)
│
└── earth-engine-service/ ← NEW DIRECTORY
    ├── app.py ← NEW Flask app
    ├── requirements.txt ← NEW Dependencies
    ├── .env.example ← NEW Config template
    └── service-account.json ← ADD YOUR CREDENTIALS
```

## 🔑 Key Features Implemented

✅ **Node.js Express API**
- POST /api/ndvi/calculate - Calculate NDVI for polygon
- GET /api/ndvi/health/:ndviValue - Get health status
- Validates polygon coordinates
- Handles errors gracefully
- Calls Python microservice via HTTP

✅ **Python Earth Engine Service**
- Uses Sentinel-2 satellite data
- Filters by cloud coverage (< 20%)
- Searches last 30 days
- Applies NDVI formula: (B8 - B4) / (B8 + B4)
- Classifies health: Poor / Moderate / Good
- Returns image date and cloud info
- Comprehensive error handling

✅ **Security**
- Service account key NOT in repository
- .gitignore configured
- Environment variables for sensitive config
- CORS protection on Flask
- Input validation on all endpoints

## 📊 Response Example

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

## ⚠️ Common Issues

### "Python microservice is not available"
- Check if Earth Engine service is running: `python app.py`
- Verify PYTHON_SERVICE_URL in backend/.env

### "Service account key not found"
- Copy your GCP JSON to: `earth-engine-service/service-account.json`
- Check path in .env file

### "No suitable satellite images found"
- Try a larger polygon area
- Some regions may have limited Sentinel-2 coverage
- Cloud coverage > 20% will be filtered

### "Python dependencies error"
- Ensure virtual environment is activated: `source venv/bin/activate`
- Reinstall: `pip install -r requirements.txt --upgrade`

## 🔗 Integration with Frontend

In your React component (FarmBoundarySetup.jsx):

```javascript
const calculateNDVI = async (coordinates) => {
  try {
    const response = await fetch('http://localhost:3000/api/ndvi/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`NDVI: ${data.ndvi}`);
      console.log(`Health: ${data.health}`);
      console.log(`Image Date: ${data.imageDate}`);
    }
  } catch (error) {
    console.error('NDVI calculation failed:', error);
  }
};
```

## 📚 Full Documentation

See `NDVI_IMPLEMENTATION.md` for:
- Complete setup instructions
- Detailed API reference
- Architecture diagrams
- NDVI calculation details
- Error handling guide
- Performance considerations
- Future enhancements

## ✅ Testing Checklist

- [ ] Both services running (Node.js + Python)
- [ ] Health check endpoints responding
- [ ] NDVI calculation returns valid value
- [ ] Health classification works correctly
- [ ] Error handling tested with invalid coordinates
- [ ] Coordinates validated properly
- [ ] Logs show request flow
- [ ] Response includes image metadata

## 🚢 Production Deployment

When ready to deploy:

1. Move service-account.json to secure location
2. Set environment variables on production server
3. Use process manager (PM2) for Node.js
4. Use WSGI server (Gunicorn) for Flask
5. Add HTTPS/TLS certificates
6. Configure CORS for production domain
7. Set up monitoring and logging
8. Rate limit API endpoints

## 📞 Support

For detailed troubleshooting, see NDVI_IMPLEMENTATION.md or check:
- Node.js backend logs
- Python service logs (Earth Engine)
- Google Cloud console for API errors

---

**Phase 2 Implementation: NDVI Calculation ✅**

Ready to calculate crop health from satellite imagery!
