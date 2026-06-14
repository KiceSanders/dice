import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './state/context';
import Home from './pages/Home';
import Room from './pages/Room';
import Playground from './dev/Playground';

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
      <Routes>
        {import.meta.env.DEV && <Route path="/dev/play" element={<Playground />} />}
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
