# Disease Detection Module

This module provides AI-powered disease detection for crops in the AgriChain platform.

## Overview
- **Backend (Node.js)**: Handles routing, request validation, calling the ML service, and storing predictions.
- **ML Service (FastAPI)**: Preprocesses crop images, loads the CNN/Keras models, and predicts disease category with confidence level and severity.
- **Frontend (React)**: Handles image upload, displaying predictions, confidence levels, severity, history, and treatment recommendations.
