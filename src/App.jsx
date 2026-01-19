import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, AdminRoute } from './routes/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/auth/LoginPage';
import CalendarPage from './pages/calendar/CalendarPage';
import SchedulesPage from './pages/schedules/SchedulesPage';
import CodesPage from './pages/codes/CodesPage';
import UsersPage from './pages/users/UsersPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Default redirect */}
            <Route index element={<Navigate to="/calendar" replace />} />

            {/* Calendar - accessible by all authenticated users */}
            <Route path="calendar" element={<CalendarPage />} />

            {/* Admin only routes */}
            <Route
              path="schedules"
              element={
                <AdminRoute>
                  <SchedulesPage />
                </AdminRoute>
              }
            />
            <Route
              path="codes"
              element={
                <AdminRoute>
                  <CodesPage />
                </AdminRoute>
              }
            />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
          </Route>

          {/* Catch all - redirect to calendar */}
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
