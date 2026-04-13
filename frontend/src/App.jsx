import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import FarmSetup from './pages/FarmSetup';
import FarmBoundarySetup from './pages/FarmBoundarySetup';
import DiseaseDetection from './pages/DiseaseDetection';
import SpoilageRisk from './pages/SpoilageRisk';
import Market from './pages/Market';
import FarmView from './pages/FarmView';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import './styles/tailwind.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/farm-setup" element={<FarmSetup />} />
        <Route path="/farm-boundary-setup" element={<FarmBoundarySetup />} />
        <Route path="/disease-detection" element={<DiseaseDetection />} />
        <Route path="/spoilage-risk" element={<SpoilageRisk />} />
        <Route path="/market" element={<Market />} />
        <Route path="/farm-view" element={<FarmView />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </Router>
  );
}

export default App;
