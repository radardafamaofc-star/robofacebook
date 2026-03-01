import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import SalesPage from './pages/SalesPage';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position="top-right" />
      <Routes>
        <Route path="/" element={<SalesPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}
