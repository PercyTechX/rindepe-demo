import React, { useState } from 'react';
import { Lock, KeyRound } from 'lucide-react';
import { API_URL, setAdminKey, useDemoInfo } from '../utils/api';
import rindepeLogo from '../assets/rindepe-logo.svg';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useDemoInfo();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      // Validate the password against a protected endpoint.
      const res = await fetch(`${API_URL}/api/depositos`, {
        headers: { 'x-admin-key': password },
      });
      if (res.status === 401) {
        throw new Error('Contraseña incorrecta.');
      }
      if (!res.ok) {
        throw new Error('No se pudo validar el acceso. Intenta de nuevo.');
      }
      setAdminKey(password);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 60px)', padding: '24px' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src={rindepeLogo} alt="RindePe" style={{ height: '64px', width: 'auto', margin: '0 auto 16px auto', display: 'block' }} />
          <div style={{ display: 'grid', placeItems: 'center', width: '52px', height: '52px', borderRadius: '14px', background: 'var(--accent-primary-glow)', color: 'var(--accent-primary)', margin: '0 auto 14px auto' }}>
            <Lock size={26} />
          </div>
          <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>Acceso Supervisor</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Ingresa la contraseña para gestionar las rendiciones.</p>
        </div>

        {/* En la demo la clave se muestra a propósito, para presentar y capacitar sin fricción. */}
        {info?.demoPassword && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', marginBottom: '14px', borderRadius: '10px', background: '#fef3c7', border: '1px solid #fcd34d', fontSize: '13px', color: '#92400e' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <KeyRound size={15} /> Clave demo: <strong style={{ fontFamily: 'monospace', fontSize: '14px' }}>{info.demoPassword}</strong>
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setPassword(info.demoPassword)}>
              Usar
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            type="password"
            className="glass-input"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            required
          />
          {error && (
            <div style={{ fontSize: '13px', color: 'var(--accent-error)', background: 'var(--accent-error-glow)', padding: '10px 12px', borderRadius: '8px' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Validando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
