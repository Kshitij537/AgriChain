import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * ProtectedRoute - Ensures users are authenticated and have the correct role
 * 
 * @param {Object} props
 * @param {React.Component} props.children - The component to render if authorized
 * @param {string} props.requiredRole - The role required to access this route (optional)
 * @param {string} props.redirectTo - Where to redirect if unauthorized (optional)
 */
const ProtectedRoute = ({ children, requiredRole = null, redirectTo = '/login' }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      // Not logged in - redirect to login
      navigate('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);

      // If a specific role is required, check if user has it
      if (requiredRole && user.roles) {
        if (!user.roles.includes(requiredRole)) {
          // User doesn't have required role
          // If they're a buyer trying to access farmer routes, redirect to buyer dashboard
          if (user.roles.includes('buyer') && requiredRole === 'farmer') {
            navigate('/buyer');
            return;
          }
          // If they're a farmer trying to access buyer routes, redirect to farmer dashboard
          if (!user.roles.includes('buyer') && requiredRole === 'buyer') {
            navigate('/dashboard');
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  }, [navigate, requiredRole, redirectTo]);

  return children;
};

export default ProtectedRoute;
