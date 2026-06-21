"""
Satellite Service - Flask Microservice
Handles satellite imagery, NDVI calculations, and crop health monitoring
"""

import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from earth_engine_auth import initialize_earth_engine, is_earth_engine_initialized, get_service_account_info
from ndvi import calculate_ndvi_for_region, validate_coordinates, get_ndvi_time_series
from fetch_satellite import get_available_images, get_satellite_preview, get_mosaic_image

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.getenv("CORS_ORIGIN", "http://localhost:5173")}})

# Initialize Earth Engine on startup
ee_initialized = False

@app.before_request
def ensure_ee_initialized():
    """Ensure Earth Engine is initialized before processing requests"""
    global ee_initialized
    if not ee_initialized:
        if initialize_earth_engine():
            ee_initialized = True
        else:
            return jsonify({
                'success': False,
                'error': 'Earth Engine not initialized. Service account credentials may be missing.'
            }), 503

# ==================== HEALTH ENDPOINTS ====================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'satellite-service',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'earthEngineInitialized': ee_initialized
    }), 200

@app.route('/api/status', methods=['GET'])
def status():
    """Detailed status endpoint"""
    return jsonify({
        'service': 'Satellite Service',
        'status': 'operational' if ee_initialized else 'not_initialized',
        'version': '1.0.0',
        'earthEngine': {
            'initialized': ee_initialized,
            'serviceAccount': get_service_account_info()
        },
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }), 200

# ==================== NDVI ENDPOINTS ====================

@app.route('/api/ndvi/calculate', methods=['POST'])
def calculate_ndvi():
    """
    Calculate NDVI for a field boundary
    
    Expected JSON:
    {
        "coordinates": [[lon, lat], [lon, lat], ..., [lon, lat]]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'coordinates' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: coordinates'
            }), 400
        
        coordinates = data['coordinates']
        
        # Validate coordinates
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        print(f"[NDVI Handler] Calculating NDVI for coordinates: {len(coordinates)} points")
        
        # Calculate NDVI
        result = calculate_ndvi_for_region(coordinates)
        
        if result['success']:
            print(f"[NDVI Handler] ✓ Calculation successful. NDVI: {result['ndvi']}")
            return jsonify(result), 200
        else:
            print(f"[NDVI Handler] ✗ Calculation failed: {result.get('error')}")
            return jsonify(result), 404
            
    except Exception as e:
        print(f"[NDVI Handler] ✗ ERROR: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/api/ndvi/health/<float:ndvi_value>', methods=['GET'])
def get_health_classification(ndvi_value):
    """Get health classification for NDVI value"""
    try:
        # Clamp NDVI to valid range
        ndvi = max(0, min(1, ndvi_value))
        
        if ndvi < 0.3:
            health = 'Poor'
            status = 'Vegetation is stressed or unhealthy. Immediate attention recommended.'
        elif ndvi < 0.6:
            health = 'Moderate'
            status = 'Vegetation is in fair condition. Monitor closely.'
        else:
            health = 'Good'
            status = 'Healthy vegetation with good growth. Conditions are favorable.'
        
        return jsonify({
            'success': True,
            'ndvi': round(ndvi, 4),
            'health': health,
            'status': status
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/ndvi/timeseries', methods=['POST'])
def ndvi_time_series():
    """
    Get NDVI time series data
    
    Expected JSON:
    {
        "coordinates": [[lon, lat], [lon, lat], ..., [lon, lat]],
        "days": 30  (optional, default 30)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'coordinates' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: coordinates'
            }), 400
        
        coordinates = data['coordinates']
        days = data.get('days', 30)
        
        # Validate coordinates
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        print(f"[Time Series] Calculating NDVI time series for {days} days")
        
        result = get_ndvi_time_series(coordinates, days)
        
        if result['success']:
            print(f"[Time Series] ✓ Retrieved {result['count']} data points")
            return jsonify(result), 200

        # Not an endpoint error; it means no imagery/data was available.
        return jsonify(result), 200
            
    except Exception as e:
        print(f"[Time Series] ✗ ERROR: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== SATELLITE DATA ENDPOINTS ====================

@app.route('/api/satellite/available', methods=['POST'])
def available_images():
    """
    Get available satellite images for a region
    
    Expected JSON:
    {
        "coordinates": [[lon, lat], [lon, lat], ..., [lon, lat]],
        "days": 30  (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'coordinates' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: coordinates'
            }), 400
        
        coordinates = data['coordinates']
        days = data.get('days', 30)
        
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        result = get_available_images(coordinates, days)
        return jsonify(result), 200 if result['success'] else 404
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/satellite/preview', methods=['POST'])
def satellite_preview():
    """
    Get satellite image preview
    
    Expected JSON:
    {
        "coordinates": [[lon, lat], [lon, lat], ..., [lon, lat]]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'coordinates' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: coordinates'
            }), 400
        
        coordinates = data['coordinates']
        
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        result = get_satellite_preview(coordinates)
        return jsonify(result), 200 if result['success'] else 404
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/satellite/mosaic', methods=['POST'])
def satellite_mosaic():
    """
    Get cloud-free satellite image mosaic
    
    Expected JSON:
    {
        "coordinates": [[lon, lat], [lon, lat], ..., [lon, lat]],
        "days": 30  (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'coordinates' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: coordinates'
            }), 400
        
        coordinates = data['coordinates']
        days = data.get('days', 30)
        
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        result = get_mosaic_image(coordinates, days)
        return jsonify(result), 200 if result['success'] else 404
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    print(f"[ERROR] Internal server error: {str(error)}")
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# ==================== MAIN ====================

if __name__ == '__main__':
    port = int(os.getenv('SERVER_PORT', 5001))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f"""
    
    🛰️  Satellite Service - Starting up
    ═════════════════════════════════════
    
    Environment:
      - Flask Debug: {debug}
      - CORS Origin: {os.getenv('CORS_ORIGIN', 'http://localhost:5173')}
      - Service Account: {os.getenv('EE_SERVICE_ACCOUNT_KEY', './service-account.json')}
      - Port: {port}
    
    Endpoints:
      - Health: GET /health
      - Status: GET /api/status
      - NDVI Calculate: POST /api/ndvi/calculate
      - NDVI Health: GET /api/ndvi/health/<value>
      - NDVI Time Series: POST /api/ndvi/timeseries
      - Available Images: POST /api/satellite/available
      - Satellite Preview: POST /api/satellite/preview
      - Satellite Mosaic: POST /api/satellite/mosaic
    
    Starting on http://localhost:{port}...
    
    """)
    
    app.run(
        host=os.getenv('SERVER_HOST', '0.0.0.0'),
        port=port,
        debug=debug
    )
