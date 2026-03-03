import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import AdminPanel from './pages/AdminPanel';
import AdminAuthGate from './components/AdminAuthGate';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position="top-right" />
      <Routes>
        <Route path="/" element={<AdminAuthGate><AdminPanel /></AdminAuthGate>} />
      </Routes>
    </BrowserRouter>
  );
}
