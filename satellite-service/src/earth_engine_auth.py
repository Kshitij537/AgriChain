"""
Google Earth Engine Authentication Module
Handles service account initialization and credentials
"""

import os
import json
import ee
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials

def initialize_earth_engine():
    """
    Initialize Earth Engine with service account credentials
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    try:
        # Get service account path from environment
        service_account_path = os.getenv('EE_SERVICE_ACCOUNT_KEY', './service-account.json')
        
        # Check if file exists
        if not os.path.exists(service_account_path):
            raise FileNotFoundError(f"Service account file not found: {service_account_path}")
        
        # Read service account JSON
        with open(service_account_path, 'r') as f:
            service_account_info = json.load(f)
        
        # Create credentials
        credentials = Credentials.from_service_account_info(
            service_account_info,
            scopes=['https://www.googleapis.com/auth/earthengine']
        )
        
        # Initialize Earth Engine with credentials
        ee.Initialize(credentials)
        
        print("[Earth Engine Auth] ✓ Successfully initialized with service account")
        return True
        
    except FileNotFoundError as e:
        print(f"[Earth Engine Auth] ✗ ERROR: {e}")
        return False
    except Exception as e:
        print(f"[Earth Engine Auth] ✗ ERROR: Failed to initialize Earth Engine: {str(e)}")
        return False

def is_earth_engine_initialized():
    """
    Check if Earth Engine is already initialized
    
    Returns:
        bool: True if initialized, False otherwise
    """
    try:
        ee.Number(1).getInfo()
        return True
    except Exception:
        return False

def get_service_account_info():
    """
    Get service account information for debugging
    
    Returns:
        dict: Service account info (without private key)
    """
    try:
        service_account_path = os.getenv('EE_SERVICE_ACCOUNT_KEY', './service-account.json')
        with open(service_account_path, 'r') as f:
            info = json.load(f)
        
        # Remove sensitive data
        return {
            'type': info.get('type'),
            'project_id': info.get('project_id'),
            'client_email': info.get('client_email')
        }
    except Exception as e:
        return {'error': str(e)}
