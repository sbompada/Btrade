import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import AdminProviders from './pages/AdminProviders';
import Bids from './pages/Bids';
import Dashboard from './pages/Dashboard';
import DashboardTool from './pages/DashboardTool';
import Calendar from './pages/Calendar';
import ForgotPassword from './pages/ForgotPassword';
import ForgotUserId from './pages/ForgotUserId';
import Funds from './pages/Funds';
import Holdings from './pages/Holdings';
import HelpPage from './pages/HelpPage';
import LoginPassword from './pages/LoginPassword';
import LoginTotp from './pages/LoginTotp';
import LoginUserId from './pages/LoginUserId';
import MutualFunds from './pages/MutualFunds';
import Orders from './pages/Orders';
import OrderTools from './pages/OrderTools';
import Positions from './pages/Positions';
import ResetPassword from './pages/ResetPassword';
import Signup from './pages/Signup';

const guard = (element: ReactElement) => <RequireAuth>{element}</RequireAuth>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/login" element={<LoginUserId />} />
      <Route path="/login/2fa" element={<LoginTotp />} />
      <Route path="/login/password" element={<LoginPassword />} />
      <Route path="/forgot-userid" element={<ForgotUserId />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/dashboard" element={guard(<Dashboard />)} />
      <Route path="/screener" element={guard(<DashboardTool title="Screener" />)} />
      <Route path="/analytics" element={guard(<DashboardTool title="Analytics" />)} />
      <Route path="/reports" element={guard(<DashboardTool title="Reports" />)} />
      <Route path="/calendar" element={guard(<Calendar />)} />
      <Route path="/orders" element={guard(<Orders />)} />
      <Route path="/orders/gtt" element={guard(<OrderTools kind="gtt" />)} />
      <Route path="/orders/baskets" element={guard(<OrderTools kind="basket" />)} />
      <Route path="/orders/sip" element={guard(<OrderTools kind="sip" />)} />
      <Route path="/orders/alerts" element={guard(<OrderTools kind="alert" />)} />
      <Route path="/positions" element={guard(<Positions />)} />
      <Route path="/funds" element={guard(<Funds />)} />
      <Route path="/funds/statements" element={guard(<Funds />)} />
      <Route path="/holdings" element={guard(<Holdings />)} />
      <Route path="/mutual-funds" element={guard(<MutualFunds />)} />
      <Route path="/bids" element={guard(<Bids />)} />
      <Route path="/support" element={guard(<HelpPage />)} />
      <Route path="/manual" element={guard(<HelpPage manual />)} />

      <Route
        path="/admin/providers"
        element={
          <RequireAuth role="admin">
            <AdminProviders />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
