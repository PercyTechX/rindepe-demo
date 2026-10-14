import path from 'path';
import os from 'os';
import dgram from 'dgram';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuración central de la demo. Todo lo "de marca" y de negocio vive aquí para poder
// cambiarlo sin tocar la lógica. Las variables de entorno solo existen para el script de pruebas.
export const PORT = parseInt(process.env.PORT || '4000', 10);
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
export const DB_PATH = path.join(DATA_DIR, 'rindepe.db');
export const FILES_DIR = path.join(DATA_DIR, 'archivos');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

// Contraseña del supervisor. En la demo se muestra en la pantalla de login a propósito.
export const SUPERVISOR_PASSWORD = process.env.SUPERVISOR_PASSWORD || 'demo2026';

// Si es '0', no se cargan datos de ejemplo al arrancar con la base vacía (lo usa el script de pruebas).
export const AUTO_SEED = process.env.AUTO_SEED !== '0';

export const BRAND = {
  producto: 'RindePe',
  empresa: 'Empresa Demo SAC',
  desarrollador: 'PercyTech',
  rucDesarrollador: '10463288271',
  soporte: '+51 966 804 286',
};

// Cuentas para que el técnico devuelva el vuelto.
export const COMPANY_ACCOUNTS = [
  { bank: 'Banco Demo', number: '000-0000000000', cci: '000-000-000000000000-00', titular: 'EMPRESA DEMO' },
];

// Fecha local (YYYY-MM-DD). toISOString() usa UTC: en Perú, después de las 7 p. m. daría el día siguiente.
export function hoy() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// IP de esta PC en la red local, para que el link del técnico (y su QR) abra desde un celular
// conectado al mismo WiFi. Se puede forzar con la variable RINDEPE_IP.
let ipDetectada = null;

const privada = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// Plan B si no hay ruta de salida: primera IP privada que no sea de un adaptador virtual.
// Se filtra por MAC porque Windows nombra a VirtualBox o Hyper-V como "Ethernet 5", etc.
function ipPorInterfaces() {
  const macVirtual = /^(0a:00:27|08:00:27|00:15:5d|00:50:56|00:0c:29|00:05:69|00:1c:14)/i;
  const nombreVirtual = /(vethernet|virtualbox|vmware|wsl|hyper-v|docker|bluetooth|tailscale|zerotier)/i;
  for (const [nombre, addrs] of Object.entries(os.networkInterfaces())) {
    if (nombreVirtual.test(nombre)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && privada(a.address) && !macVirtual.test(a.mac)) return a.address;
    }
  }
  return null;
}

/**
 * Detecta la IP de la interfaz por la que esta PC sale a la red (la del WiFi/cable real).
 * "Conectar" un socket UDP no envía ningún paquete: solo le pregunta al sistema qué ruta usaría.
 */
export function detectarIp() {
  if (process.env.RINDEPE_IP) {
    ipDetectada = process.env.RINDEPE_IP;
    return Promise.resolve(ipDetectada);
  }
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const fin = (ip) => {
      try { sock.close(); } catch { /* ya cerrado */ }
      ipDetectada = ip && privada(ip) ? ip : ipPorInterfaces();
      resolve(ipDetectada);
    };
    sock.on('error', () => fin(null));
    try {
      sock.connect(53, '8.8.8.8', () => fin(sock.address().address));
    } catch {
      fin(null);
    }
  });
}

export function lanIp() {
  return ipDetectada || 'localhost';
}

export function baseUrl() {
  return `http://${lanIp()}:${PORT}`;
}
