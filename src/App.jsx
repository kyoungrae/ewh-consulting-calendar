import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, AdminRoute } from './routes/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import ConsultantSelectionPage from './pages/auth/ConsultantSelectionPage';
import CalendarPage from './pages/calendar/CalendarPage';
import SchedulesPage from './pages/schedules/SchedulesPage';
import CodesPage from './pages/codes/CodesPage';
import UsersPage from './pages/users/UsersPage';
import { DataProvider } from './contexts/DataContext';
import FirebaseMonitor from './components/common/FirebaseMonitor';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/select-consultant" element={<ConsultantSelectionPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Area Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Calendar - accessible by all authenticated users */}
              <Route path="/calendar" element={<CalendarPage />} />

              {/* Admin only routes */}
              <Route
                path="/schedules"
                element={
                  <AdminRoute>
                    <SchedulesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/codes"
                element={
                  <AdminRoute>
                    <CodesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <AdminRoute>
                    <UsersPage />
                  </AdminRoute>
                }
              />
            </Route>

            {/* Catch all - redirect based on auth status is handled by ProtectedRoute, 
              but for simplified UX we point to root */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {/* <FirebaseMonitor /> */}
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
