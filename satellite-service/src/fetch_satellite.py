"""
Satellite Data Fetching Module
Handles retrieval of satellite imagery metadata and information
"""

import ee
from datetime import datetime, timedelta

def get_available_images(coordinates, days=30):
    """
    Get information about available satellite images for a region
    
    Args:
        coordinates (list): Polygon coordinates [lon, lat]
        days (int): Number of days to search back
        
    Returns:
        dict: Information about available images
    """
    try:
        polygon = ee.Geometry.Polygon(coordinates)
        
        # Define date range
        end_date = ee.Date(datetime.now())
        start_date = end_date.advance(-days, 'day')
        
        # Get Sentinel-2 images
        sentinel2 = ee.ImageCollection('COPERNICUS/S2') \
            .filterBounds(polygon) \
            .filterDate(start_date, end_date) \
            .sort('CLOUDY_PIXEL_PERCENTAGE')
        
        count = sentinel2.size().getInfo()
        
        if count == 0:
            return {
                'success': False,
                'count': 0,
                'message': 'No images available'
            }
        
        # Get first (least cloudy) image info
        first_image = sentinel2.first()
        image_info = first_image.getInfo()
        
        image_date = datetime.fromtimestamp(
            image_info['properties']['system:time_start'] / 1000
        ).strftime('%Y-%m-%d %H:%M:%S UTC')
        
        cloud_coverage = image_info['properties'].get('CLOUDY_PIXEL_PERCENTAGE', 'N/A')
        
        return {
            'success': True,
            'count': count,
            'recentImage': {
                'date': image_date,
                'cloudCoverage': cloud_coverage,
                'resolution': '10m',
                'datasource': 'Sentinel-2'
            }
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def get_satellite_preview(coordinates):
    """
    Get a preview of satellite data for visualization
    
    Args:
        coordinates (list): Polygon coordinates
        
    Returns:
        dict: Preview data and download URL
    """
    try:
        polygon = ee.Geometry.Polygon(coordinates)
        
        # Get recent Sentinel-2 image
        sentinel2 = ee.ImageCollection('COPERNICUS/S2') \
            .filterBounds(polygon) \
            .filterDate(
                ee.Date(datetime.now()).advance(-30, 'day'),
                ee.Date(datetime.now())
            ) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .sort('CLOUDY_PIXEL_PERCENTAGE')
        
        image = sentinel2.first()
        
        if image is None:
            return {
                'success': False,
                'error': 'No suitable images found'
            }
        
        # Select RGB bands (B4=Red, B3=Green, B2=Blue)
        rgb = image.select(['B4', 'B3', 'B2'])
        
        # Get visualization URL
        viz_params = {
            'min': 0,
            'max': 3000,
            'bands': ['B4', 'B3', 'B2'],
            'gamma': 1.4
        }
        
        # Generate download URL
        url = rgb.getThumbURL(viz_params)
        
        image_info = image.getInfo()
        image_date = datetime.fromtimestamp(
            image_info['properties']['system:time_start'] / 1000
        ).strftime('%Y-%m-%d')
        
        return {
            'success': True,
            'url': url,
            'date': image_date,
            'resolution': '10m',
            'datasource': 'Sentinel-2'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def get_mosaic_image(coordinates, days=30):
    """
    Create a cloud-free mosaic from multiple satellite images
    
    Args:
        coordinates (list): Polygon coordinates
        days (int): Number of days to include
        
    Returns:
        dict: Mosaic image URL and metadata
    """
    try:
        polygon = ee.Geometry.Polygon(coordinates)
        
        # Create mosaic from multiple images
        end_date = ee.Date(datetime.now())
        start_date = end_date.advance(-days, 'day')
        
        sentinel2 = ee.ImageCollection('COPERNICUS/S2') \
            .filterBounds(polygon) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        
        mosaic = sentinel2.median()
        
        viz_params = {
            'min': 0,
            'max': 3000,
            'bands': ['B4', 'B3', 'B2'],
            'gamma': 1.4
        }
        
        url = mosaic.getThumbURL(viz_params)
        
        return {
            'success': True,
            'url': url,
            'type': 'mosaic',
            'period': f'Last {days} days',
            'resolution': '10m',
            'datasource': 'Sentinel-2'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }
