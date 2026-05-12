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
import CustomerLedger from './pages/CustomerLedger';
import SupplierLedger from './pages/SupplierLedger';
import AccountLedger from './pages/AccountLedger';
import Financials from './pages/Financials';
import InvoicePrint from './pages/InvoicePrint';

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="master" element={<MasterData />} />
            {/* Entity-centric direct routes — each renders just the relevant
                CRUD panel with its own page-head. */}
            <Route path="items" element={<MasterData entity="items" />} />
            <Route path="categories" element={<MasterData entity="categories" />} />
            <Route path="brands" element={<MasterData entity="brands" />} />
            <Route path="customers" element={<MasterData entity="customers" />} />
            <Route path="suppliers" element={<MasterData entity="suppliers" />} />
            <Route path="stores" element={<MasterData entity="stores" />} />
            <Route path="accounts" element={<MasterData entity="accounts" />} />
            <Route path="employees" element={<MasterData entity="employees" />} />
            <Route path="pos" element={<POS />} />
            <Route path="stock" element={<Stock />} />
            <Route path="stock-ledger" element={<StockLedger />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="purchase-orders" element={<PurchaseOrders />} />
            <Route path="stock-transfers" element={<StockTransfers />} />
            <Route path="damaged-goods" element={<DamagedGoods />} />
            <Route path="sales" element={<Sales />} />
            <Route path="sale-returns" element={<SaleReturns />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="purchase-returns" element={<PurchaseReturns />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="cash-register" element={<CashRegister />} />
            <Route path="fund-transfers" element={<FundTransfers />} />
            <Route path="incentives" element={<Incentives />} />
            <Route path="employee-payments" element={<EmployeePayments />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="employee-incentive-rules" element={<EmployeeIncentiveRules />} />
            <Route path="employee-ledger" element={<EmployeeLedger />} />
            <Route path="employee-ledger/:id" element={<EmployeeLedger />} />
            <Route path="backup" element={<Backup />} />
            <Route path="customer-ledger" element={<CustomerLedger />} />
            <Route path="customer-ledger/:id" element={<CustomerLedger />} />
            <Route path="supplier-ledger" element={<SupplierLedger />} />
            <Route path="supplier-ledger/:id" element={<SupplierLedger />} />
            <Route path="account-ledger" element={<AccountLedger />} />
            <Route path="account-ledger/:id" element={<AccountLedger />} />
            <Route path="financials" element={<Financials />} />
          </Route>
          <Route path="print/sale/:id" element={<InvoicePrint type="sale" />} />
          <Route path="print/purchase/:id" element={<InvoicePrint type="purchase" />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
