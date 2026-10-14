import { useEffect, useState } from 'react';

// El frontend se sirve desde el mismo servidor que la API (también en desarrollo, vía el proxy
// de Vite), así que las rutas son relativas. Los links de archivos (/archivos/...) también.
export const API_URL = '';

const ADMIN_KEY_STORAGE = 'adminKey';

export function getAdminKey(): string {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string): void {
  try {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // Sin almacenamiento (modo privado estricto): la sesión dura lo que la pestaña.
  }
}

export function clearAdminKey(): void {
  try {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // nada que limpiar
  }
}

// Headers for admin (JSON) requests.
export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-admin-key': getAdminKey(), ...extra };
}

export interface CuentaBancaria {
  bank: string;
  number: string;
  cci?: string;
  titular?: string;
}

export interface DemoInfo {
  producto: string;
  empresa: string;
  desarrollador: string;
  rucDesarrollador: string;
  soporte: string;
  demoPassword: string;
  cuentas: CuentaBancaria[];
  baseUrl: string;
}

let infoPromise: Promise<DemoInfo | null> | null = null;

function fetchInfo(): Promise<DemoInfo | null> {
  if (!infoPromise) {
    infoPromise = fetch(`${API_URL}/api/info`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return infoPromise;
}

/** Datos públicos de la demo (marca, clave visible, cuentas, dirección de red). */
export function useDemoInfo(): DemoInfo | null {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchInfo().then(i => { if (vivo) setInfo(i); });
    return () => { vivo = false; };
  }, []);
  return info;
}

export const qrUrl = (text: string) => `${API_URL}/api/qr?text=${encodeURIComponent(text)}`;
