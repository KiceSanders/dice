import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import { AppProvider } from './state/context';

const Room = lazy(() => import('./pages/Room'));
const Playground = import.meta.env.DEV ? lazy(() => import('./dev/Playground')) : null;

function AppRoutes() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </AppProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<main className="page">Loading…</main>}>
        <Routes>
          {Playground && <Route path="/dev/play" element={<Playground />} />}
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
