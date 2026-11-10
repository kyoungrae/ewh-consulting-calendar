import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, AdminRoute, StrictAdminRoute } from './routes/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import LandingPage from './pages/LandingPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import { DataProvider } from './contexts/DataContext';
import './index.css';

// Load only the current page instead of downloading every admin screen and its
// spreadsheet libraries before the landing page can appear.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ConsultantSelectionPage = lazy(() => import('./pages/auth/ConsultantSelectionPage'));
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage'));
const SchedulesPage = lazy(() => import('./pages/schedules/SchedulesPage'));
const CodesPage = lazy(() => import('./pages/codes/CodesPage'));
const UsersPage = lazy(() => import('./pages/users/UsersPage'));
const EventsPage = lazy(() => import('./pages/events/EventsPage'));
const BudgetPage = lazy(() => import('./pages/budget/BudgetPage'));
const ExpenseResolutionPage = lazy(() => import('./pages/budget/ExpenseResolutionPage'));
const MyConsultingFeePage = lazy(() => import('./pages/profile/MyConsultingFeePage'));

// A deployment can remove an old lazy-loaded chunk while a user still has the
// previous app open. Let them choose when to reload rather than losing work.
class PageErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.pathname !== this.props.pathname) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" role="alert">
          <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
            <h1 className="text-xl font-semibold mb-3">화면을 불러오지 못했습니다</h1>
            <p className="text-gray-600 mb-6">연결 상태를 확인하거나 새로고침해 주세요. 새로고침하면 저장하지 않은 내용이 사라질 수 있습니다.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
            <Link className="block mt-4 underline" to="/">첫 화면으로</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary pathname={pathname}>{children}</PageErrorBoundary>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <RouteErrorBoundary>
          <Suspense fallback={<LoadingSpinner message="화면을 불러오는 중..." />}>
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
              <Route path="/my-consulting-fee" element={<MyConsultingFeePage />} />

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
                  <StrictAdminRoute>
                    <UsersPage />
                  </StrictAdminRoute>
                }
              />
              <Route
                path="/events"
                element={
                  <AdminRoute>
                    <EventsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/budget"
                element={
                  <StrictAdminRoute>
                    <BudgetPage />
                  </StrictAdminRoute>
                }
              />
              <Route
                path="/expense-resolution"
                element={
                  <StrictAdminRoute>
                    <ExpenseResolutionPage />
                  </StrictAdminRoute>
                }
              />
            </Route>

            {/* Catch all - redirect based on auth status is handled by ProtectedRoute, 
              but for simplified UX we point to root */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
