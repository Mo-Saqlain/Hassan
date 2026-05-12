import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
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
import CustomerLedger from './pages/CustomerLedger';
import SupplierLedger from './pages/SupplierLedger';
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
            <Route path="pos" element={<POS />} />
            <Route path="stock" element={<Stock />} />
            <Route path="stock-ledger" element={<StockLedger />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="sales" element={<Sales />} />
            <Route path="sale-returns" element={<SaleReturns />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="purchase-returns" element={<PurchaseReturns />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="cash-register" element={<CashRegister />} />
            <Route path="fund-transfers" element={<FundTransfers />} />
            <Route path="incentives" element={<Incentives />} />
            <Route path="customer-ledger" element={<CustomerLedger />} />
            <Route path="customer-ledger/:id" element={<CustomerLedger />} />
            <Route path="supplier-ledger" element={<SupplierLedger />} />
            <Route path="supplier-ledger/:id" element={<SupplierLedger />} />
            <Route path="financials" element={<Financials />} />
          </Route>
          <Route path="print/sale/:id" element={<InvoicePrint type="sale" />} />
          <Route path="print/purchase/:id" element={<InvoicePrint type="purchase" />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
