import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import ChefDashboard from './pages/chef/ChefDashboard';
import WaiterDashboard from './pages/waiter/WaiterDashboard';
import ManagerLayout from './components/Layout/ManagerLayout';
import DashboardTab from './pages/manager/DashboardTab';
import AnalisisPegawaiTab from './pages/manager/AnalisisPegawaiTab';
import PegawaiTab from './pages/manager/PegawaiTab';
import GudangTab from './pages/manager/GudangTab';
import BahanTab from './pages/manager/BahanTab';
import LaporanChefTab from './pages/manager/LaporanChefTab';
import DataChefTab from './pages/manager/DataChefTab';
import MenuTab from './pages/manager/MenuTab';
import PenjualanTab from './pages/manager/PenjualanTab';
import SetoranTab from './pages/manager/SetoranTab';
import KeuanganTab from './pages/manager/KeuanganTab';
import KasTab from './pages/manager/KasTab';
import LaporanTeksTab from './pages/manager/LaporanTeksTab';
import ReviewDutyTab from './pages/manager/ReviewDutyTab';
import AITab from './pages/manager/AITab';
import KalkulatorTab from './pages/waiter/KalkulatorTab';
import LaporanShiftTab from './pages/waiter/LaporanShiftTab';
import DataLoader from './components/DataLoader';

import HiddenAIAnalystPage from './pages/HiddenAIAnalystPage';

function App() {
  return (
    <DataLoader>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        
        {/* Secret Hidden AI Analyst Route */}
        <Route path="/ai-analyst" element={<HiddenAIAnalystPage />} />

        <Route path="/manager" element={<ManagerLayout />}>
          <Route index element={<DashboardTab />} />
          <Route path="dashboard" element={<DashboardTab />} />
          <Route path="analisis-pegawai" element={<AnalisisPegawaiTab />} />
          <Route path="pegawai" element={<PegawaiTab />} />
          <Route path="gudang" element={<GudangTab />} />
          <Route path="bahan" element={<BahanTab />} />
          <Route path="laporan-chef" element={<LaporanChefTab />} />
          <Route path="review-duty" element={<ReviewDutyTab />} />
          <Route path="menu" element={<MenuTab />} />
          <Route path="penjualan" element={<PenjualanTab />} />
          <Route path="setoran" element={<SetoranTab />} />
          <Route path="keuangan" element={<KeuanganTab />} />
          <Route path="kas" element={<KasTab />} />
          <Route path="laporan-teks" element={<LaporanTeksTab />} />
          <Route path="data-chef" element={<DataChefTab />} />
          <Route path="ai" element={<AITab />} />
          <Route path="ai-bulk" element={<AITab />} />
        </Route>

        <Route path="/chef" element={<ChefDashboard />} />
        <Route path="/chef/*" element={<ChefDashboard />} />

        <Route path="/waiter" element={<WaiterDashboard />}>
          <Route path="kalkulator" element={<KalkulatorTab />} />
          <Route path="menu" element={<MenuTab />} />
          <Route path="penjualan" element={<PenjualanTab />} />
          <Route path="setoran" element={<SetoranTab />} />
          <Route path="laporan" element={<LaporanShiftTab />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </DataLoader>
  );
}

export default App;
