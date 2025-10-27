import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext';
import GuardedRoute from './components/ui/GuardedRoute';
import AdminGuard from './components/ui/AdminGuard';
import Layout from './components/layout/Layout';
import ScrollToTop from './components/ui/ScrollToTop';
import safeLazy from './utils/safeLazy';
const HomePage = safeLazy(() => import('./pages/HomePage'));
const PortfolioPage = safeLazy(() => import('./pages/PortfolioPage'));
const PortraitPage = safeLazy(() => import('./pages/PortraitPage'));
const MaternityPage = safeLazy(() => import('./pages/MaternityPage'));
const EventsPage = safeLazy(() => import('./pages/EventsPage'));
const ContactPage = safeLazy(() => import('./pages/ContactPage'));
const CivilWeddingPage = safeLazy(() => import('./pages/CivilWeddingPage'));
const StorePage = safeLazy(() => import('./pages/StorePage'));
const AdminSetupPage = safeLazy(() => import('./pages/AdminPage'));
const BookingPage = safeLazy(() => import('./pages/BookingPage'));
const ClientDashboardPage = safeLazy(() => import('./pages/ClientDashboardPage'));
import lazyWithRetry from './utils/lazyWithRetry';
const PackagesAdminPage = safeLazy(() => import('./pages/PackagesAdminPage'));
const AdminStorePage = lazyWithRetry(() => import('./pages/AdminStorePage'));
import './styles/globals.css';
import ErrorBoundary from './components/ui/ErrorBoundary';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <FeatureFlagsProvider>
          <Router>
            <ScrollToTop />
            <Layout>
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/portfolio" element={<GuardedRoute page="portfolio"><PortfolioPage /></GuardedRoute>} />
                  <Route path="/portrait" element={<GuardedRoute page="portrait"><PortraitPage /></GuardedRoute>} />
                  <Route path="/maternity" element={<GuardedRoute page="maternity"><MaternityPage /></GuardedRoute>} />
                  <Route path="/events" element={<GuardedRoute page="events"><EventsPage /></GuardedRoute>} />
                  <Route path="/events/civil" element={<GuardedRoute page="civilWedding"><CivilWeddingPage /></GuardedRoute>} />
                  <Route path="/contact" element={<GuardedRoute page="contact"><ContactPage /></GuardedRoute>} />
                  <Route path="/booking" element={<GuardedRoute page="booking"><BookingPage /></GuardedRoute>} />
                  <Route path="/store" element={<GuardedRoute page="store"><StorePage /></GuardedRoute>} />
                  <Route path="/admin" element={<AdminGuard><AdminStorePage /></AdminGuard>} />
                  <Route path="/dashboard" element={<GuardedRoute page="clientDashboard"><ClientDashboardPage /></GuardedRoute>} />
                  <Route path="/packages-admin" element={<GuardedRoute page="packagesAdmin"><PackagesAdminPage /></GuardedRoute>} />
                  <Route path="/admin-store" element={<GuardedRoute page="admin"><AdminStorePage /></GuardedRoute>} />
                  <Route path="/admin-setup" element={<GuardedRoute page="admin"><AdminSetupPage /></GuardedRoute>} />
                  <Route path="*" element={<HomePage />} />
                </Routes>
                </Suspense>
              </ErrorBoundary>
            </Layout>
          </Router>
        </FeatureFlagsProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
