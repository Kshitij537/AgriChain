"""
Cloud Masking Module for Sentinel-2 Surface Reflectance (SR) Data
Uses COPERNICUS/S2_CLOUD_PROBABILITY dataset combined with SCL / QA60.
"""

import ee

def mask_s2_clouds(image, max_cloud_prob=20):
    """
    Mask clouds in a Sentinel-2 image using the joined cloud_mask property
    (from COPERNICUS/S2_CLOUD_PROBABILITY) as well as SCL and QA60 metadata.
    
    Args:
        image (ee.Image): Sentinel-2 SR image with 'cloud_mask' property set.
        max_cloud_prob (int): Maximum allowable cloud probability percentage (default 20%).
        
    Returns:
        ee.Image: Cloud-masked Sentinel-2 SR image.
    """
    # 1. Cloud probability mask (< max_cloud_prob %)
    cloud_prob = ee.Image(image.get('cloud_mask')).select('probability')
    prob_mask = cloud_prob.lt(max_cloud_prob)

    # 2. QA60 mask (bit 10 = opaque clouds, bit 11 = cirrus)
    qa = image.select('QA60')
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    qa_mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))

    # 3. SCL mask (Scene Classification Layer)
    # 3 = cloud shadow, 8 = cloud medium prob, 9 = cloud high prob, 10 = thin cirrus, 11 = snow/ice
    scl = image.select('SCL')
    scl_mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))

    return image.updateMask(prob_mask).updateMask(qa_mask).updateMask(scl_mask)


def get_cloud_masked_collection(polygon, start_date, end_date, max_cloud_prob=20, max_scene_cloud=None):
    """
    Fetch Sentinel-2 Surface Reflectance (COPERNICUS/S2_SR_HARMONIZED) joined with
    Sentinel-2 Cloud Probability (COPERNICUS/S2_CLOUD_PROBABILITY) on system:index,
    and apply pixel-level cloud probability thresholding.
    
    Args:
        polygon (ee.Geometry): Farm region geometry
        start_date (ee.Date or str): Start date
        end_date (ee.Date or str): End date
        max_cloud_prob (int): Maximum allowable pixel cloud probability percentage (default 20%)
        max_scene_cloud (float): Optional filter on CLOUDY_PIXEL_PERCENTAGE metadata
        
    Returns:
        ee.ImageCollection: Filtered and cloud-masked Sentinel-2 SR collection
    """
    sr_collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(polygon) \
        .filterDate(start_date, end_date)

    if max_scene_cloud is not None:
        sr_collection = sr_collection.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_scene_cloud))

    cloud_collection = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY') \
        .filterBounds(polygon) \
        .filterDate(start_date, end_date)

    # Join on system:index
    joined = ee.Join.saveFirst('cloud_mask').apply(
        primary=sr_collection,
        secondary=cloud_collection,
        condition=ee.Filter.equals(leftField='system:index', rightField='system:index')
    )

    masked_collection = ee.ImageCollection(joined) \
        .filter(ee.Filter.notNull(['cloud_mask'])) \
        .map(lambda img: mask_s2_clouds(img, max_cloud_prob=max_cloud_prob)) \
        .sort('system:time_start', False)

    return masked_collection
