# AgriChain 🌾

An intelligent agricultural platform leveraging satellite imagery, machine learning, and real-time data analytics to help farmers optimize crop health, predict diseases, detect spoilage, and access market intelligence.

## 🌟 Features

### 1. **Farm Setup & Management**
- Digital farm boundary mapping and setup
- Multi-farm management dashboards
- Geospatial tracking of farm locations
- Farm metadata and profile management

### 2. **Satellite-Based NDVI Monitoring**
- Real-time NDVI (Normalized Difference Vegetation Index) analysis
- Google Earth Engine integration for satellite imagery
- Vegetation health trend analysis
- Historical data tracking and visualization

### 3. **AI-Powered Disease Detection**
- Computer vision-based crop disease identification
- Deep learning models trained on agricultural datasets
- Real-time disease risk assessment
- Actionable recommendations for disease management

### 4. **Spoilage Risk Prediction**
- Post-harvest spoilage risk analysis
- Storage condition optimization recommendations
- Time-based degradation forecasting
- Early warning alerts

### 5. **Market Intelligence**
- Real-time agricultural commodity pricing
- Market trend analysis
- Demand forecasting
- Price comparison across regions

### 6. **Smart Recommendations**
- AI-driven insights based on farm conditions
- Personalized crop management suggestions
- Optimized resource allocation recommendations
- Risk mitigation strategies

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React.js with JSX
- Vite (build tool)
- Tailwind CSS (styling)
- Axios (HTTP client)

**Backend:**
- Node.js with Express.js
- RESTful API architecture
- JWT-based authentication
- Modular controller-service pattern

**ML & Satellite Services:**
- Python-based microservices
- TensorFlow/Keras for disease detection models
- Google Earth Engine API integration
- Satellite imagery processing and analysis

**Database:**
- Relational database schema (SQL)
- User authentication and profiles
- Farm metadata and NDVI data
- Disease and spoilage records

## 📋 Project Structure

```
AgriChain/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── controllers/       # Request handlers
│   │   ├── routes/            # API endpoints
│   │   ├── models/            # Database schemas
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # Auth & utilities
│   │   ├── config/            # Configuration
│   │   └── utils/             # Helper functions
│   └── package.json
│
├── frontend/                   # React Vite application
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   ├── styles/            # CSS (Tailwind)
│   │   └── hooks/             # Custom React hooks
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── ml-service/                # ML model API
│   ├── api/                   # Flask/FastAPI server
│   ├── models/                # Trained models (disease_model.h5)
│   └── src/
│       ├── train.py           # Model training
│       ├── predict.py         # Inference
│       └── preprocess.py      # Data preprocessing
│
├── satellite-service/         # Satellite imagery service
│   ├── src/
│   │   ├── earth_engine_auth.py    # Google EE authentication
│   │   ├── fetch_satellite.py      # Fetch satellite data
│   │   └── ndvi.py                 # NDVI calculation
│   ├── scripts/
│   │   └── test_ndvi.py       # Testing + visualization
│   └── app.py                 # Main service
│
├── database/
│   ├── schemas/               # SQL table definitions
│   └── seed/                  # Sample data
│
└── docs/                      # Additional documentation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm/yarn
- Python 3.8+
- Google Cloud Account (for satellite imagery)
- Database (PostgreSQL/MySQL)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Kshitij537/AgriChain.git
cd AgriChain
```

2. **Backend Setup**
```bash
cd backend
npm install
cp .env.example .env        # Configure environment variables
npm start
```

3. **Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

4. **ML Service Setup**
```bash
cd ml-service
pip install -r requirements.txt
python api/app.py
```

5. **Satellite Service Setup**
```bash
cd satellite-service
pip install -r requirements.txt
# Add your Google Cloud service-account.json
python app.py
```

### Database Setup
```bash
# Check database/schemas/ for table definitions
# Load schemas into your database
mysql < database/schemas/users.sql
mysql < database/schemas/farms.sql
mysql < database/schemas/ndvi.sql
mysql < database/schemas/disease.sql
mysql < database/schemas/spoilage.sql

# (Optional) Load sample data
mysql < database/seed/sample_data.sql
```

## 📖 Detailed Documentation

- [Farm Boundary Setup Guide](FARM_BOUNDARY_SETUP_GUIDE.md) - Detailed farm mapping and boundary setup
- [NDVI Implementation](NDVI_IMPLEMENTATION.md) - Satellite imagery analysis and vegetation health monitoring
- [Feature Design Brief](FEATURE_DESIGN_BRIEF.md) - Complete feature specifications and design decisions
- [Quick Start Guide](QUICK_START.md) - Step-by-step development setup

## 🔑 Environment Variables

Create `.env` files in each service directory:

**Backend (.env)**
```
DB_HOST=localhost
DB_USER=agrichain_user
DB_PASSWORD=your_password
DB_NAME=agrichain
JWT_SECRET=your_jwt_secret
ML_SERVICE_URL=http://localhost:5000
SATELLITE_SERVICE_URL=http://localhost:5001
PORT=3000
```

**Satellite Service (.env)**
```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
EE_PROJECT_ID=your_ee_project_id
```

## 🔐 Security Notes

⚠️ **Important:** Never commit sensitive files:
- `service-account.json` (Google Cloud credentials)
- `.env` files with secrets
- Database credentials
- API keys

Use `.env.example` templates for reference instead.

## 📚 API Documentation

### Authentication
All protected endpoints require JWT token in the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

### Key Endpoints

**User & Auth**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - User profile

**Farms**
- `GET /api/farms` - List user farms
- `POST /api/farms` - Create new farm
- `GET /api/farms/:id` - Get farm details
- `PUT /api/farms/:id` - Update farm

**NDVI & Satellite**
- `GET /api/ndvi/:farmId` - Get NDVI data
- `POST /api/ndvi/fetch` - Fetch latest satellite data
- `GET /api/ndvi/history` - Historical NDVI data

**Disease Detection**
- `POST /api/disease/detect` - Analyze image for diseases
- `GET /api/disease/history` - Disease detection history

**Spoilage Risk**
- `POST /api/spoilage/predict` - Predict spoilage risk
- `GET /api/spoilage/alerts` - Active spoilage alerts

**Market**
- `GET /api/market/prices` - Current commodity prices
- `GET /api/market/trends` - Price trends
- `GET /api/market/forecast` - Price forecasting

## 🤖 Machine Learning Models

### Disease Detection Model
- **Model Type:** Deep Learning (CNN)
- **Framework:** TensorFlow/Keras
- **Input:** Crop/leaf images (RGB)
- **Output:** Disease classification + confidence scores
- **Location:** `ml-service/models/disease_model.h5`

### Spoilage Prediction
- **Input:** Storage conditions, time duration, commodity type
- **Output:** Spoilage risk percentage
- **Algorithm:** ML ensemble (Random Forest + Gradient Boosting)

## 🧪 Testing

```bash
# ML Service
cd ml-service
python -m pytest tests/

# Satellite Service
cd satellite-service
python scripts/test_ndvi.py

# Backend
cd backend
npm test

# Frontend
cd frontend
npm run test
```

## 📊 Monitoring & Logging

- Backend logs: `backend/logs/`
- ML Service logs: `ml-service/logs/`
- Satellite Service logs: `satellite-service/logs/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Development Workflow

### Adding a New Feature
1. Design the feature (update FEATURE_DESIGN_BRIEF.md)
2. Create database schema if needed
3. Build backend API endpoint
4. Create ML models if required
5. Build frontend UI
6. Write tests and documentation
7. Submit PR for review

## 🐛 Known Issues & Limitations

- Large satellite imagery processing may require optimization
- Real-time market data requires API subscriptions
- ML models perform best with sufficient training data

## 🗺️ Roadmap

- [ ] Mobile app (React Native)
- [ ] Drone integration for custom imagery
- [ ] IoT sensor integration
- [ ] Blockchain for supply chain tracking
- [ ] Multi-language support
- [ ] Offline mode for farmers

## 📞 Support & Contact

For questions, issues, or feature requests:
- Open an issue on [GitHub Issues](https://github.com/Kshitij537/AgriChain/issues)
- Contact: [Your contact information]

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Google Earth Engine for satellite imagery
- TensorFlow community for ML frameworks
- React and Node.js communities
- Agricultural research partners and advisors

---

**Made with ❤️ for farmers and sustainable agriculture**
