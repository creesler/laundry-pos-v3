import React from 'react';
import { BrowserRouter, Routes as RouterRoutes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';

// Import pages
import NotFound from './pages/NotFound';
import OperationsOverviewDashboard from './pages/operations-overview-dashboard';
import EmployeePOSTerminal from './pages/employee-pos-terminal';
import Login from './pages/login';
import AdminLogin from './pages/admin-login';

function Routes() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ScrollToTop />
        <RouterRoutes>
          {/* Direct access to POS terminal for employees - no login required */}
          <Route path="/" element={<EmployeePOSTerminal />} />
          <Route path="/employee-pos-terminal" element={<EmployeePOSTerminal />} />
          {/* Admin authentication routes */}
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/operations-overview-dashboard" element={<OperationsOverviewDashboard />} />
          <Route path="*" element={<NotFound />} />
        </RouterRoutes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default Routes;