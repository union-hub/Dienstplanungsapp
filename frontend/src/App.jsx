import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Employees from './pages/Employees';
import Residents from './pages/Residents';
import Qualifications from './pages/Qualifications';
import Users from './pages/Users';
import MyShifts from './pages/MyShifts';
import Controlling from './pages/Controlling';

function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="schedule/:id"   element={<Schedule />} />
          <Route path="employees"      element={<PrivateRoute roles={['leitung','teamleitung']}><Employees /></PrivateRoute>} />
          <Route path="residents"      element={<PrivateRoute roles={['leitung','teamleitung']}><Residents /></PrivateRoute>} />
          <Route path="qualifications" element={<PrivateRoute roles={['leitung']}><Qualifications /></PrivateRoute>} />
          <Route path="users"          element={<PrivateRoute roles={['leitung']}><Users /></PrivateRoute>} />
          <Route path="my-shifts"      element={<MyShifts />} />
          <Route path="controlling"    element={<PrivateRoute roles={['leitung','teamleitung']}><Controlling /></PrivateRoute>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
