import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';

const ProfileSetup = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HostChat = lazy(() => import('./pages/HostChat'));
const GuestChat = lazy(() => import('./pages/GuestChat'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="spinner" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-900">404 - 找不到頁面</h1>
      <Link to="/" className="text-brand-cyan hover:underline">回到首頁</Link>
    </div>
  );
}

function ProfileRoute({ children }: { children: ReactNode }) {
  const profile = localStorage.getItem('bniProfile');
  if (!profile) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<ProfileSetup />} />
          <Route path="/dashboard" element={<ProfileRoute><Dashboard /></ProfileRoute>} />
          <Route path="/dashboard/chat/:roomId" element={<ProfileRoute><HostChat /></ProfileRoute>} />
          <Route path="/chat/:slug" element={<GuestChat />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
