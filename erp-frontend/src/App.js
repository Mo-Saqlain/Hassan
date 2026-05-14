import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
// Load the redesigned tokens + layout AFTER App.css so they override the
// legacy design tokens. Legacy class definitions in App.css that aren't
// touched by the new design (e.g. ledger-summary, chip-picker, report-tabs)
// still apply because they're under different selectors.
import './styles/tokens.css';
import './styles/app.css';
import { ThemeProvider } from './theme/ThemeContext';
import Layout from './components/Layout';
import HubFrame from './components/HubFrame';
import { HUBS } from './nav/hubs';
import Dashboard from './pages/Dashboard';
import MasterData from './pages/MasterData';
import Stock from './pages/Stock';
import StockLedger from './pages/StockLedger';
import POS from './pages/POS';
import Transactions from './pages/Transactions';
import Sales from './pages/Sales';
import SaleReturns from './pages/SaleReturns';
import Purchases from './pages/Purchases';
import PurchaseReturns from './pages/PurchaseReturns';
import Receipts from './pages/Receipts';
import Payments from './pages/Payments';
import CashRegister from './pages/CashRegister';
import FundTransfers from './pages/FundTransfers';
import Incentives from './pages/Incentives';
import PurchaseOrders from './pages/PurchaseOrders';
import StockTransfers from './pages/StockTransfers';
import DamagedGoods from './pages/DamagedGoods';
import EmployeePayments from './pages/EmployeePayments';
import Attendance from './pages/Attendance';
import EmployeeIncentiveRules from './pages/EmployeeIncentiveRules';
import EmployeeLedger from './pages/EmployeeLedger';
import Backup from './pages/Backup';
import AuditLog from './pages/AuditLog';
import ErrorLog from './pages/ErrorLog';
import Accent from './pages/Accent';
import UsersInfo from './pages/users/UsersInfo';
import UsersAllowAccess from './pages/users/UsersAllowAccess';
import UsersRecentLogin from './pages/users/UsersRecentLogin';
import UsersChangePassword from './pages/users/UsersChangePassword';
import Login from './pages/Login';
import { AuthProvider } from './auth/AuthContext';
import RequireSuperuser from './auth/RequireSuperuser';
import CustomerLedger from './pages/CustomerLedger';
import SupplierLedger from './pages/SupplierLedger';
import AccountLedger from './pages/AccountLedger';
import Financials from './pages/Financials';
import InvoicePrint from './pages/InvoicePrint';

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="cash-register" element={<CashRegister />} />
            <Route path="master" element={<MasterData />} />
            <Route path="transactions" element={<Transactions />} />

            {/* Customer hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.customer.title}
                  subtitle={HUBS.customer.subtitle}
                  tabs={HUBS.customer.tabs}
                />
              }
            >
              <Route path="customers" element={<MasterData entity="customers" />} />
              <Route path="receipts" element={<Receipts />} />
              <Route path="customer-ledger" element={<CustomerLedger />} />
              <Route path="customer-ledger/:id" element={<CustomerLedger />} />
            </Route>

            {/* Sales hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.sales.title}
                  subtitle={HUBS.sales.subtitle}
                  tabs={HUBS.sales.tabs}
                />
              }
            >
              <Route path="sales" element={<Sales />} />
              <Route path="sale-returns" element={<SaleReturns />} />
            </Route>

            {/* Supplier hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.supplier.title}
                  subtitle={HUBS.supplier.subtitle}
                  tabs={HUBS.supplier.tabs}
                />
              }
            >
              <Route path="suppliers" element={<MasterData entity="suppliers" />} />
              <Route path="brands" element={<MasterData entity="brands" />} />
              <Route path="payments" element={<Payments />} />
              <Route path="incentives" element={<Incentives />} />
              <Route path="supplier-ledger" element={<SupplierLedger />} />
              <Route path="supplier-ledger/:id" element={<SupplierLedger />} />
            </Route>

            {/* Purchase hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.purchase.title}
                  subtitle={HUBS.purchase.subtitle}
                  tabs={HUBS.purchase.tabs}
                />
              }
            >
              <Route path="purchase-orders" element={<PurchaseOrders />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchase-returns" element={<PurchaseReturns />} />
            </Route>

            {/* Item hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.item.title}
                  subtitle={HUBS.item.subtitle}
                  tabs={HUBS.item.tabs}
                />
              }
            >
              <Route path="items" element={<MasterData entity="items" />} />
              <Route path="categories" element={<MasterData entity="categories" />} />
            </Route>

            {/* Stock hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.stock.title}
                  subtitle={HUBS.stock.subtitle}
                  tabs={HUBS.stock.tabs}
                />
              }
            >
              <Route path="stores" element={<MasterData entity="stores" />} />
              <Route path="stock" element={<Stock />} />
              <Route path="stock-ledger" element={<StockLedger />} />
              <Route path="stock-transfers" element={<StockTransfers />} />
              <Route path="damaged-goods" element={<DamagedGoods />} />
            </Route>

            {/* Employee hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.employee.title}
                  subtitle={HUBS.employee.subtitle}
                  tabs={HUBS.employee.tabs}
                />
              }
            >
              <Route path="employees" element={<MasterData entity="employees" />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="employee-payments" element={<EmployeePayments />} />
              <Route path="employee-incentive-rules" element={<EmployeeIncentiveRules />} />
              <Route path="employee-ledger" element={<EmployeeLedger />} />
              <Route path="employee-ledger/:id" element={<EmployeeLedger />} />
            </Route>

            {/* Account hub */}
            <Route
              element={
                <HubFrame
                  title={HUBS.account.title}
                  subtitle={HUBS.account.subtitle}
                  tabs={HUBS.account.tabs}
                />
              }
            >
              <Route path="accounts" element={<MasterData entity="accounts" />} />
              <Route path="fund-transfers" element={<FundTransfers />} />
              <Route path="account-ledger" element={<AccountLedger />} />
              <Route path="account-ledger/:id" element={<AccountLedger />} />
            </Route>

            {/* Users hub — Info / Allow Access / Recent Login / Change Password */}
            <Route
              element={
                <HubFrame
                  title={HUBS.users.title}
                  subtitle={HUBS.users.subtitle}
                  tabs={HUBS.users.tabs}
                />
              }
            >
              <Route
                path="users"
                element={
                  <RequireSuperuser>
                    <UsersInfo />
                  </RequireSuperuser>
                }
              />
              <Route
                path="users-allow-access"
                element={
                  <RequireSuperuser>
                    <UsersAllowAccess />
                  </RequireSuperuser>
                }
              />
              <Route
                path="users-recent-login"
                element={
                  <RequireSuperuser>
                    <UsersRecentLogin />
                  </RequireSuperuser>
                }
              />
              <Route
                path="users-change-password"
                element={<UsersChangePassword />}
              />
            </Route>

            {/* System hub — Backups + Audit + Errors */}
            <Route
              element={
                <HubFrame
                  title={HUBS.system.title}
                  subtitle={HUBS.system.subtitle}
                  tabs={HUBS.system.tabs}
                />
              }
            >
              <Route path="backup" element={<Backup />} />
              <Route
                path="audit-log"
                element={
                  <RequireSuperuser>
                    <AuditLog />
                  </RequireSuperuser>
                }
              />
              <Route path="accent" element={<Accent />} />
              <Route
                path="error-log"
                element={
                  <RequireSuperuser>
                    <ErrorLog />
                  </RequireSuperuser>
                }
              />
            </Route>

            {/* Reports — single-page entry (no hub strip yet) */}
            <Route path="financials" element={<Financials />} />
          </Route>
          <Route path="print/sale/:id" element={<InvoicePrint type="sale" />} />
          <Route path="print/purchase/:id" element={<InvoicePrint type="purchase" />} />
        </Routes>
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  );
}
