import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import AdvancedOrdersGuide from './pages/AdvancedOrdersGuide';
import AdminMarketData from './pages/AdminMarketData';
import AdminPaymentIntegrations from './pages/AdminPaymentIntegrations';
import AdminProviders from './pages/AdminProviders';
import AdminTransactions from './pages/AdminTransactions';
import AdminUserAccess from './pages/AdminUserAccess';
import Bids from './pages/Bids';
import ChartManagementGuide from './pages/ChartManagementGuide';
import Dashboard from './pages/Dashboard';
import DashboardTool from './pages/DashboardTool';
import Calendar from './pages/Calendar';
import ForgotPassword from './pages/ForgotPassword';
import ForgotUserId from './pages/ForgotUserId';
import Funds from './pages/Funds';
import FundsManagementGuide from './pages/FundsManagementGuide';
import Holdings from './pages/Holdings';
import HelpPage from './pages/HelpPage';
import LoginPassword from './pages/LoginPassword';
import LoginTotp from './pages/LoginTotp';
import LoginUserId from './pages/LoginUserId';
import MarketwatchGuide from './pages/MarketwatchGuide';
import MarketTimings from './pages/MarketTimings';
import MultipleAccountsHelp from './pages/MultipleAccountsHelp';
import MutualFunds from './pages/MutualFunds';
import NoAccess from './pages/NoAccess';
import Orders from './pages/Orders';
import OrderManagementGuide from './pages/OrderManagementGuide';
import OrderTools from './pages/OrderTools';
import Positions from './pages/Positions';
import PoliciesAndProcedures from './pages/PoliciesAndProcedures';
import PortfolioManagementGuide from './pages/PortfolioManagementGuide';
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
      <Route path="/no-access" element={<RequireAuth allowTeam><NoAccess /></RequireAuth>} />
      <Route path="/policies-and-procedures" element={<PoliciesAndProcedures />} />
      <Route path="/support/multiple-accounts" element={<MultipleAccountsHelp />} />
      <Route path="/support/advanced-order-tools" element={<AdvancedOrdersGuide />} />
      <Route path="/support/order-management" element={<OrderManagementGuide />} />
      <Route path="/support/funds-management" element={<FundsManagementGuide />} />
      <Route path="/support/portfolio-management" element={<PortfolioManagementGuide />} />
      <Route path="/support/trade-charting" element={<ChartManagementGuide />} />
      <Route path="/support/chart-management" element={<Navigate to="/support/trade-charting" replace />} />
      <Route path="/support/marketwatch" element={<MarketwatchGuide />} />

      <Route path="/dashboard" element={guard(<Dashboard />)} />
      <Route path="/screener" element={guard(<DashboardTool title="Screener" />)} />
      <Route path="/analytics" element={guard(<DashboardTool title="Analytics" />)} />
      <Route path="/reports" element={guard(<DashboardTool title="Reports" />)} />
      <Route path="/calendar" element={guard(<Calendar />)} />
      <Route path="/market-timings" element={guard(<MarketTimings />)} />
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
      <Route path="/ipo" element={guard(<Bids />)} />
      <Route path="/bids" element={<Navigate to="/ipo" replace />} />
      <Route path="/support" element={guard(<HelpPage />)} />
      <Route path="/manual" element={guard(<HelpPage manual />)} />

      <Route
        path="/admin/access"
        element={
          <RequireAuth role="admin">
            <AdminUserAccess />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <RequireAuth permission="admin.transactions">
            <AdminTransactions />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/payment-integrations"
        element={
          <RequireAuth permission="admin.payment_integrations">
            <AdminPaymentIntegrations />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/providers"
        element={
          <RequireAuth permission="admin.notification_providers">
            <AdminProviders />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/market-data"
        element={
          <RequireAuth permission="admin.market_data">
            <AdminMarketData />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
