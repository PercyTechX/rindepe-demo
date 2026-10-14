import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LogOut, RotateCcw } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import RendicionForm from './pages/RendicionForm';
import Login from './pages/Login';
import { API_URL, getAdminKey, clearAdminKey, adminHeaders } from './utils/api';
import rindepeLogo from './assets/rindepe-logo.svg';
import percytechLogo from './assets/percytech-logo.png';

function Navbar({ authed, onLogout }: { authed: boolean; onLogout: () => void }) {
  const [restaurando, setRestaurando] = useState(false);

  // Vuelve la demo a los datos de ejemplo (útil antes de cada presentación o capacitación).
  const restaurarDemo = async () => {
    if (!window.confirm('Se borrarán todos los cambios y se volverán a cargar los datos de ejemplo. ¿Continuar?')) return;
    setRestaurando(true);
    try {
      const res = await fetch(`${API_URL}/api/demo/reset`, { method: 'POST', headers: adminHeaders() });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error || 'No se pudo restaurar.');
      window.location.reload();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setRestaurando(false);
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="navbar-logo">
          <img src={rindepeLogo} alt="RindePe" style={{ height: '38px' }} />
        </div>
        <div>
          <div className="navbar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Rinde<span style={{ color: 'var(--accent-primary)' }}>Pe</span></span>
            <span className="demo-ribbon">DEMO</span>
          </div>
          <div className="navbar-subtitle">Empresa Demo SAC · Control de Caja</div>
        </div>
      </div>
      {authed ? (
        <div className="navbar-actions">
          <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={restaurarDemo} disabled={restaurando} title="Volver a los datos de ejemplo">
            <RotateCcw size={15} /> <span className="btn-label">{restaurando ? 'Restaurando…' : 'Restaurar demo'}</span>
          </button>
          <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={onLogout} title="Cerrar sesión">
            <LogOut size={15} /> <span className="btn-label">Cerrar sesión</span>
          </button>
        </div>
      ) : (
        <span className="navbar-badge">Rendición de cuentas</span>
      )}
    </nav>
  );
}

// Guards the admin dashboard behind the supervisor password.
function AdminGate() {
  const [authed, setAuthed] = useState<boolean>(!!getAdminKey());

  const handleLogout = () => {
    clearAdminKey();
    setAuthed(false);
  };

  return (
    <>
      <Navbar authed={authed} onLogout={handleLogout} />
      <main className="app-main">
        {authed ? (
          <Dashboard onUnauthorized={handleLogout} />
        ) : (
          <Login onSuccess={() => setAuthed(true)} />
        )}
      </main>
    </>
  );
}

// Public technician page keeps the brand bar but no auth.
function PublicShell() {
  return (
    <>
      <Navbar authed={false} onLogout={() => {}} />
      <main className="app-main">
        <RendicionForm />
      </main>
    </>
  );
}

function Footer() {
  return (
    <footer className="app-footer">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        RindePe · Elaborado por
        <img src={percytechLogo} alt="PercyTech Solutions" style={{ height: '18px', width: 'auto' }} />
        · RUC 10463288271
      </span>
      <span className="app-footer-sep">·</span>
      <span>
        Soporte:{' '}
        <a href="https://wa.me/51966804286" target="_blank" rel="noreferrer">+51 966 804 286 (WhatsApp)</a>
      </span>
      <span className="app-footer-sep">·</span>
      <span>Versión de demostración con datos ficticios</span>
    </footer>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<AdminGate />} />
          <Route path="/rendir/:token" element={<PublicShell />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
