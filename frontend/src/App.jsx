import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import FarmSetup from './pages/FarmSetup';
import FarmBoundarySetup from './pages/FarmBoundarySetup';
import SavedFields from './pages/SavedFields';
import FieldAnalytics from './pages/FieldAnalytics';
import DiseaseDetection from './pages/DiseaseDetection';
import SpoilageRisk from './pages/SpoilageRisk';
import Market from './pages/Market';
import Weather from './pages/Weather';
import FarmView from './pages/FarmView';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import BuyerMarketplace from './pages/BuyerMarketplace';
import MyCropsForSale from './pages/MyCropsForSale';
import MarketplaceMessages from './pages/MarketplaceMessages';
import MarketplaceOffers from './pages/MarketplaceOffers';
import BuyerDashboard from './pages/BuyerDashboard';
import BrowseFarmers from './pages/BrowseFarmers';
import MyRequirements from './pages/MyRequirements';
import SellingOptions from './pages/SellingOptions';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/tailwind.css';

// Component to handle dashboard redirection based on user role
const DashboardRedirect = () => {
  const userStr = localStorage.getItem('user');
  
  if (!userStr) {
    return <Navigate to="/login" replace />;
  }
  
  try {
    const user = JSON.parse(userStr);
    
    // If user has buyer role, redirect to buyer dashboard
    if (user.roles && user.roles.includes('buyer')) {
      return <Navigate to="/buyer" replace />;
    }
    
    // Otherwise, show farmer dashboard
    return <Dashboard />;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return <Navigate to="/login" replace />;
  }
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Dashboard - automatically redirects based on role */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardRedirect />
          </ProtectedRoute>
        } />
        
        {/* Farmer-only routes */}
        <Route path="/farm-setup" element={
          <ProtectedRoute>
            <FarmSetup />
          </ProtectedRoute>
        } />
        <Route path="/farm-boundary-setup" element={
          <ProtectedRoute>
            <FarmBoundarySetup />
          </ProtectedRoute>
        } />
        <Route path="/farm-boundary-setup/:farmId" element={
          <ProtectedRoute>
            <FarmBoundarySetup />
          </ProtectedRoute>
        } />
        <Route path="/saved-fields" element={
          <ProtectedRoute>
            <SavedFields />
          </ProtectedRoute>
        } />
        <Route path="/field-analytics/:fieldId" element={
          <ProtectedRoute>
            <FieldAnalytics />
          </ProtectedRoute>
        } />
        <Route path="/disease-detection" element={
          <ProtectedRoute>
            <DiseaseDetection />
          </ProtectedRoute>
        } />
        <Route path="/spoilage-risk" element={
          <ProtectedRoute>
            <SpoilageRisk />
          </ProtectedRoute>
        } />
        <Route path="/market" element={
          <ProtectedRoute>
            <Market />
          </ProtectedRoute>
        } />
        <Route path="/weather" element={
          <ProtectedRoute>
            <Weather />
          </ProtectedRoute>
        } />
        <Route path="/farm-view" element={
          <ProtectedRoute>
            <FarmView />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        
        {/* Marketplace - accessible to both farmers and buyers */}
        <Route path="/marketplace" element={
          <ProtectedRoute>
            <BuyerMarketplace />
          </ProtectedRoute>
        } />
        <Route path="/marketplace/my-crops" element={
          <ProtectedRoute>
            <MyCropsForSale />
          </ProtectedRoute>
        } />
        <Route path="/marketplace/messages" element={
          <ProtectedRoute>
            <MarketplaceMessages />
          </ProtectedRoute>
        } />
        <Route path="/marketplace/messages/:conversationId" element={
          <ProtectedRoute>
            <MarketplaceMessages />
          </ProtectedRoute>
        } />
        <Route path="/marketplace/offers" element={
          <ProtectedRoute>
            <MarketplaceOffers />
          </ProtectedRoute>
        } />
        {/* Mandis and direct buyers in one ranking, costed by the same engine. */}
        <Route path="/marketplace/compare" element={
          <ProtectedRoute>
            <SellingOptions />
          </ProtectedRoute>
        } />
        {/* "Browse all requirements" linked here from the buyer list; the buyer
            list is itself that browse, so this is an alias rather than a dead end. */}
        <Route path="/marketplace/browse" element={
          <ProtectedRoute>
            <BuyerMarketplace />
          </ProtectedRoute>
        } />
        <Route path="/marketplace/deals" element={
          <ProtectedRoute>
            <MarketplaceOffers />
          </ProtectedRoute>
        } />
        
        {/* Buyer-specific routes */}
        <Route path="/buyer" element={
          <ProtectedRoute requiredRole="buyer">
            <BuyerDashboard />
          </ProtectedRoute>
        } />
        <Route path="/buyer/requirements" element={
          <ProtectedRoute requiredRole="buyer">
            <MyRequirements />
          </ProtectedRoute>
        } />
        {/* Deep link from the dashboard, opening that requirement's matches. */}
        <Route path="/buyer/requirements/:requirementId" element={
          <ProtectedRoute requiredRole="buyer">
            <MyRequirements />
          </ProtectedRoute>
        } />
        <Route path="/buyer/browse" element={
          <ProtectedRoute requiredRole="buyer">
            <BrowseFarmers />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;
