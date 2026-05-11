import { HashRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MasterData from './pages/MasterData';
import Stock from './pages/Stock';
import POS from './pages/POS';
import Sales from './pages/Sales';
import SaleReturns from './pages/SaleReturns';
import Purchases from './pages/Purchases';
import PurchaseReturns from './pages/PurchaseReturns';
import Receipts from './pages/Receipts';
import Payments from './pages/Payments';
import InvoicePrint from './pages/InvoicePrint';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="master" element={<MasterData />} />
          <Route path="pos" element={<POS />} />
          <Route path="stock" element={<Stock />} />
          <Route path="sales" element={<Sales />} />
          <Route path="sale-returns" element={<SaleReturns />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="purchase-returns" element={<PurchaseReturns />} />
          <Route path="receipts" element={<Receipts />} />
          <Route path="payments" element={<Payments />} />
        </Route>
        <Route path="print/sale/:id" element={<InvoicePrint type="sale" />} />
        <Route path="print/purchase/:id" element={<InvoicePrint type="purchase" />} />
      </Routes>
    </HashRouter>
  );
}
