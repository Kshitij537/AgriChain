"""
NDVI (Normalized Difference Vegetation Index) Calculation Module
Uses Google Earth Engine and Sentinel-2 satellite imagery
"""

import ee
from datetime import datetime, timedelta
from earth_engine_auth import is_earth_engine_initialized


def _mask_s2_sr_clouds_and_shadows(image):
    """Basic cloud + shadow mask for Sentinel-2 SR.

    Uses QA60 bitmask (cloud/cirrus) and SCL (scene classification) to
    remove cloud/shadow/snow pixels.
    """
    # QA60: bit 10 = opaque clouds, bit 11 = cirrus
    qa = image.select('QA60')
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    qa_mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))

    # SCL classes to mask out
    # 3 = cloud shadow, 8/9/10 = clouds/cirrus, 11 = snow/ice
    scl = image.select('SCL')
    scl_mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))

    return image.updateMask(qa_mask).updateMask(scl_mask)

def get_buildup_mask(polygon):
    """
    Create a mask for built-up areas using ESA World Cover dataset
    
    Args:
        polygon: ee.Geometry polygon
        
    Returns:
        ee.Image: Binary mask (1=vegetation, 0=built-up/other)
    """
    try:
        # ESA World Cover dataset (10m resolution, matches Sentinel-2)
        # Classes: 10=Trees, 20=Shrub, 30=Herbaceous, 40=Crops, 50=Built-up, 60=Bare, 70=Snow, 80=Water, etc.
        world_cover = ee.ImageCollection('ESA/WorldCover/v100') \
            .filterBounds(polygon) \
            .first()
        
        if world_cover is None:
            # If World Cover not available, return mask of all 1s (no masking)
            return ee.Image(1).clip(polygon)
        
        # Create vegetation mask: keep only classes with vegetation
        # 10=Trees, 20=Shrubland, 30=Herbaceous, 40=Cropland, 95=Mangroves
        vegetation_classes = [10, 20, 30, 40, 95]
        
        # Create binary mask
        mask = ee.Image(0)
        for vegetation_class in vegetation_classes:
            mask = mask.where(world_cover.eq(vegetation_class), 1)
        
        return mask.clip(polygon)
        
    except Exception as e:
        print(f"[Buildup Mask] Warning: Could not create buildup mask: {str(e)}")
        # Return all 1s if masking fails (no masking applied)
        return ee.Image(1).clip(polygon)

def validate_coordinates(coordinates):
    """
    Validate polygon coordinates format and values
    
    Args:
        coordinates (list): List of [lon, lat] coordinate pairs
        
    Returns:
        tuple: (is_valid, error_message)
    """
    if not isinstance(coordinates, list) or len(coordinates) < 3:
        return False, "Polygon must have at least 3 points"
    
    for i, coord in enumerate(coordinates):
        if not isinstance(coord, (list, tuple)) or len(coord) != 2:
            return False, f"Point {i} has invalid format. Expected [lon, lat]"
        
        lon, lat = coord
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            return False, f"Point {i} coordinates must be numbers"
        
        if not (-180 <= lon <= 180):
            return False, f"Point {i}: Longitude must be between -180 and 180"
        
        if not (-90 <= lat <= 90):
            return False, f"Point {i}: Latitude must be between -90 and 90"
    
    # Check if polygon is closed (first and last points should match)
    if coordinates[0] != coordinates[-1]:
        return False, "Polygon must be closed (first and last points should match)"
    
    return True, None

def calculate_ndvi_for_region(coordinates):
    """
    Calculate NDVI for a given region using Sentinel-2 satellite data
    
    Args:
        coordinates (list): List of [lon, lat] coordinate pairs forming polygon
        
    Returns:
        dict: {
            'success': bool,
            'ndvi': float (0-1),
            'health': str (Poor/Moderate/Good),
            'status': str,
            'imageDate': str (YYYY-MM-DD),
            'cloudCoverage': float (percentage),
            'timestamp': str (ISO 8601)
        }
    """
    try:
        # Validate coordinates
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return {
                'success': False,
                'error': error,
                'status': 'Invalid coordinates'
            }
        
        # Create geometry from coordinates
        polygon = ee.Geometry.Polygon(coordinates)
        
        # Define date range (last 30 days)
        end_date = ee.Date(datetime.now())
        start_date = end_date.advance(-30, 'day')
        
        # Filter Sentinel-2 Surface Reflectance (harmonized)
        # Prefer SR over TOA to match most agronomy platforms.
        sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(polygon) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(_mask_s2_sr_clouds_and_shadows) \
            .sort('system:time_start', False)
        
        # Check if images are available
        image_count = sentinel2.size().getInfo()
        if image_count == 0:
            return {
                'success': False,
                'error': 'No cloud-free satellite images available for this region',
                'status': 'No imagery available'
            }
        
        # Get the most recent suitable image
        image = sentinel2.first()
        
        # Calculate NDVI: (B8 - B4) / (B8 + B4)
        # B8 = Near Infrared (NIR)
        # B4 = Red
        ndvi = image.normalizedDifference(['B8', 'B4'])
        
        # Get NDVI value (mean of the region)
        ndvi_value = ndvi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=10,
            bestEffort=True,
            maxPixels=1e9
        ).getInfo()
        
        ndvi_mean = ndvi_value.get('nd', None)
        
        if ndvi_mean is None:
            return {
                'success': False,
                'error': 'Failed to calculate NDVI',
                'status': 'Calculation error'
            }
        
        # NDVI is already on [-1, 1]. Most dashboards display 0..1,
        # so clamp negatives to 0 but do NOT re-scale with (ndvi+1)/2.
        ndvi_clamped = max(0, min(1, float(ndvi_mean)))
        
        # Get image metadata
        image_info = image.getInfo()
        image_date = datetime.fromtimestamp(
            image_info['properties']['system:time_start'] / 1000
        ).strftime('%Y-%m-%d')
        
        cloud_coverage = image_info['properties'].get('CLOUDY_PIXEL_PERCENTAGE', 0)
        
        # Classify health based on NDVI
        health, status = classify_health(ndvi_clamped)
        
        return {
            'success': True,
            'ndvi': round(ndvi_clamped, 4),
            'ndviRaw': round(float(ndvi_mean), 4),
            'health': health,
            'status': status,
            'imageDate': image_date,
            'cloudCoverage': cloud_coverage,
            'datasource': 'Sentinel-2 SR Harmonized',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Earth Engine error: {str(e)}',
            'status': 'Processing error'
        }

def classify_health(ndvi_value):
    """
    Classify vegetation health based on NDVI value
    
    Args:
        ndvi_value (float): NDVI value between 0 and 1
        
    Returns:
        tuple: (health_category, status_message)
    """
    if ndvi_value < 0.3:
        return 'Poor', 'Vegetation is stressed or unhealthy. Immediate attention recommended.'
    elif ndvi_value < 0.6:
        return 'Moderate', 'Vegetation is in fair condition. Monitor closely.'
    else:
        return 'Good', 'Healthy vegetation with good growth. Conditions are favorable.'

def get_ndvi_time_series(coordinates, days=30):
    """
    Get NDVI time series data for analyzing trends over time
    
    Args:
        coordinates (list): Polygon coordinates
        days (int): Number of days to analyze
        
    Returns:
        dict: Time series data with dates and NDVI values
    """
    try:
        # Validate coordinates
        is_valid, error = validate_coordinates(coordinates)
        if not is_valid:
            return {'success': False, 'error': error}
        
        polygon = ee.Geometry.Polygon(coordinates)
        
        # Define date range
        end_date = ee.Date(datetime.now())
        start_date = end_date.advance(-days, 'day')
        
        # Filter imagery with less strict cloud filtering for more data
        sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(polygon) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)) \
            .map(_mask_s2_sr_clouds_and_shadows)
        
        # Get image collection size
        collection_size = sentinel2.size().getInfo()
        
        if collection_size == 0:
            return {
                'success': False,
                'error': 'No satellite images available for time series'
            }
        
        # Calculate NDVI for each image
        ndvi_collection = sentinel2.map(
            lambda image: image.normalizedDifference(['B8', 'B4'])
                .reduceRegion(ee.Reducer.mean(), polygon, 10)
                .set('system:time_start', image.get('system:time_start'))
        )
        
        # Get properties
        data = ndvi_collection.aggregate_array('system:time_start').getInfo()
        ndvi_values = ndvi_collection.aggregate_array('nd').getInfo()
        
        # Format time series
        time_series = []
        for timestamp, ndvi in zip(data, ndvi_values):
            if ndvi is not None:
                date = datetime.fromtimestamp(timestamp / 1000).strftime('%Y-%m-%d')
                # Keep NDVI on its standard scale and clamp to 0..1 for UI.
                normalized_ndvi = max(0, min(1, float(ndvi)))
                time_series.append({
                    'date': date,
                    'ndvi': round(normalized_ndvi, 4)
                })
        
        return {
            'success': True,
            'data': time_series,
            'count': len(time_series),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Time series calculation error: {str(e)}'
        }
