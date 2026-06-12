import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './state/context';
import Home from './pages/Home';
import Room from './pages/Room';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
