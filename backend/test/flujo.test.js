// Prueba de punta a punta del flujo de rendiciones contra un servidor real.
// Usa una carpeta de datos temporal: no toca los datos de la demo.
// Ejecutar desde la raíz:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4977;
const BASE = `http://localhost:${PORT}`;
const CLAVE = 'clave-de-prueba';
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rindepe-test-'));

let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, AUTO_SEED: '0', SUPERVISOR_PASSWORD: CLAVE, RINDEPE_IP: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok) return;
    } catch { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`El servidor no arrancó:\n${log}`);
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/* ------------------------------- helpers ------------------------------- */

const admin = { 'x-admin-key': CLAVE };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a9c40000000049454e44ae426082', 'hex');

function form(fields, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  for (const [k, name] of Object.entries(files)) fd.append(k, new Blob([PNG], { type: 'image/png' }), name);
  return fd;
}

async function api(method, url, { body, headers = {}, json } = {}) {
  const opts = { method, headers: { ...headers } };
  if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(json);
  } else if (body) {
    opts.body = body;
  }
  const res = await fetch(`${BASE}${url}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

// RUC con dígito verificador válido.
function ruc(base10) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = [...base10].reduce((a, c, i) => a + Number(c) * pesos[i], 0);
  let dv = 11 - (suma % 11);
  if (dv === 10) dv = 0;
  if (dv === 11) dv = 1;
  return `${base10}${dv}`;
}
const RUC_A = ruc('2099900001');

let tec, sup;
let ticketSeq = 90000;

async function nuevoDeposito(monto) {
  const r = await api('POST', '/api/depositos', {
    headers: admin,
    body: form({
      Tecnico: tec.Nombre, Tecnico_Id: tec.Item, Telefono: tec.Celular, Supervisor: sup.Nombre, Supervisor_Id: sup.Item,
      Ticket: String(ticketSeq++), Local: 'Planta Prueba', Monto: monto, Dia: '2026-10-01',
    }, { voucher: 'voucher.png' }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

let corrSeq = 1000;
async function gasto(dep, monto, extra = {}) {
  return api('POST', `/api/depositos/${dep.Item}/comprobantes`, {
    body: form({
      Tipo_Comprobante: 'Factura', RUC_Emisor: RUC_A, Serie: 'F001', Correlativo: String(corrSeq++),
      Monto_Gasto: monto, Fecha_Comprobante: '2026-10-02', ...extra,
    }, { comprobante: 'boleta.png' }),
  });
}

async function liquidar(dep, montoDepositado, totalGastado, conVoucher = false) {
  return api('POST', `/api/depositos/${dep.Item}/liquidar`, {
    body: form({ Monto_Depositado: montoDepositado, Total_Gastado: totalGastado, Diferencia: 0, Estado_Liquidacion: 'Exacto' },
      conVoucher ? { voucherDevolucion: 'devolucion.png' } : {}),
  });
}

const detalle = async (dep) => (await api('GET', `/api/depositos/${dep.Item}`, { headers: admin })).data;

/* -------------------------------- pruebas -------------------------------- */

test('acceso: info pública y clave del supervisor', async () => {
  const info = await api('GET', '/api/info');
  assert.equal(info.status, 200);
  assert.equal(info.data.producto, 'RindePe');
  assert.equal((await api('GET', '/api/depositos')).status, 401);
  assert.equal((await api('GET', '/api/depositos', { headers: { 'x-admin-key': 'mala' } })).status, 401);
  assert.equal((await api('GET', '/api/depositos', { headers: admin })).status, 200);
});

test('maestros: crear, editar y eliminar sin historial', async () => {
  tec = (await api('POST', '/api/tecnicos', { headers: admin, json: { Nombre: 'Técnico Prueba', Celular: '900000001', DNI: '11111111' } })).data;
  sup = (await api('POST', '/api/supervisores', { headers: admin, json: { Nombre: 'Supervisor Prueba', Celular: '900000002' } })).data;
  assert.equal(tec.Estado, 'Activo');

  const ed = await api('PUT', `/api/tecnicos/${tec.Item}`, { headers: admin, json: { ...tec, Celular: '900000009' } });
  assert.equal(ed.status, 200);
  assert.equal(ed.data.Celular, '900000009');
  tec = ed.data;

  const temp = (await api('POST', '/api/supervisores', { headers: admin, json: { Nombre: 'Temporal' } })).data;
  assert.equal((await api('DELETE', `/api/supervisores/${temp.Item}`, { headers: admin })).status, 200);
  assert.equal((await api('PUT', `/api/tecnicos/${tec.Item}`, { headers: admin, json: { Nombre: '' } })).status, 400);
});

test('depósito: se crea en Rindiendo con su carpeta y el link usa la IP de red', async () => {
  const dep = await nuevoDeposito(100);
  assert.equal(dep.Estado, 'Rindiendo');
  assert.equal(dep.Monto, '100.00');
  assert.match(dep.LinkRendicion, new RegExp(`^http://127\\.0\\.0\\.1:${PORT}/rendir/[0-9a-f]{32}$`));
  const porToken = await api('GET', `/api/depositos/token/${dep.Token}`);
  assert.equal(porToken.status, 200);
  assert.equal(porToken.data.deposito.Item, dep.Item);
  assert.equal((await api('GET', '/api/depositos/token/noexiste')).status, 404);

  const arch = await api('GET', `/api/depositos/${dep.Item}/archivos`, { headers: admin });
  assert.deepEqual(arch.data.archivos.map(a => a.name), [`Voucher_Deposito_${dep.Ticket}.png`]);
});

test('comprobantes: validaciones y anti-duplicado global', async () => {
  const dep = await nuevoDeposito(500);
  assert.equal((await gasto(dep, 10, { RUC_Emisor: '20123456780' })).status, 400, 'RUC con dígito verificador inválido');
  assert.equal((await gasto(dep, 0)).status, 400, 'monto 0');
  assert.equal((await gasto(dep, 10, { Correlativo: 'ABC' })).status, 400, 'correlativo no numérico');
  assert.equal((await gasto(dep, 10, { Tipo_Comprobante: 'Inventado' })).status, 400, 'tipo inválido');

  assert.equal((await gasto(dep, 25, { Serie: 'F777', Correlativo: '000412' })).status, 201);
  // Mismo RUC + serie + correlativo (412 == 000412), incluso desde otro depósito.
  const otro = await nuevoDeposito(50);
  const dup = await gasto(otro, 25, { Serie: 'f777', Correlativo: '412' });
  assert.equal(dup.status, 409);

  const libreSinDesc = await gasto(dep, 15, { Tipo_Comprobante: 'Otros', RUC_Emisor: '', Serie: '', Correlativo: '' });
  assert.equal(libreSinDesc.status, 400);
  const libre = await gasto(dep, 15, { Tipo_Comprobante: 'Otros', Descripcion: 'Taxi', RUC_Emisor: '', Serie: '', Correlativo: '' });
  assert.equal(libre.status, 201);
  assert.equal(libre.data.Nro_Comprobante, '');
});

test('balance exacto con residuos de coma flotante (166.00 + 16.40 + 7.30 = 189.70)', async () => {
  const dep = await nuevoDeposito(189.7);
  for (const m of [166, 16.4, 7.3]) assert.equal((await gasto(dep, m)).status, 201);
  const r = await liquidar(dep, 189.7, 166 + 16.4 + 7.3);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.estadoLiquidacion, 'Exacto');
});

test('devolución: exige voucher, rechaza montos desactualizados y no se puede reenviar', async () => {
  const dep = await nuevoDeposito(100);
  await gasto(dep, 80);

  assert.equal((await liquidar(dep, 100, 80)).status, 400, 'devolución sin voucher');
  assert.equal((await liquidar(dep, 100, 50, true)).status, 409, 'total distinto al del servidor');

  // El supervisor amplía mientras el técnico tiene la página abierta con los montos viejos.
  const amp = await api('POST', `/api/depositos/${dep.Item}/ampliar`, {
    headers: admin, body: form({ monto: 30, motivo: 'extra', Supervisor: sup.Nombre, Supervisor_Id: sup.Item }, { voucher: 'adicional.png' }),
  });
  assert.equal(amp.status, 201);
  assert.equal(amp.data.nuevoTotal, '130.00');
  assert.equal((await liquidar(dep, 100, 80, true)).status, 409, 'monto entregado desactualizado');

  const ok = await liquidar(dep, 130, 80, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.estadoLiquidacion, 'Devolucion');
  assert.equal(ok.data.diferencia, '50.00');

  const d = await detalle(dep);
  assert.equal(d.deposito.Estado, 'Por Revisar');
  assert.match(d.liquidacion.Comprobante_Liquidacion_Id, /Voucher_Devolucion_Saldo_/);
  assert.equal(d.ampliaciones.length, 1);

  // Ya enviada: no se puede reenviar, ni agregar comprobantes, ni ampliar.
  assert.equal((await liquidar(dep, 130, 80, true)).status, 409);
  assert.equal((await gasto(dep, 5)).status, 409);
  const amp2 = await api('POST', `/api/depositos/${dep.Item}/ampliar`, { headers: admin, body: form({ monto: 10 }, { voucher: 'x.png' }) });
  assert.equal(amp2.status, 400);
});

test('observar y corregir: vuelve a Por Revisar y al aprobar genera la Hoja Resumen PDF', async () => {
  const dep = await nuevoDeposito(60);
  await gasto(dep, 60);
  assert.equal((await api('POST', `/api/depositos/${dep.Item}/rechazar`, { headers: admin, json: { motivo: 'x' } })).status, 400, 'no se observa si no está Por Revisar');
  assert.equal((await liquidar(dep, 60, 60)).status, 200);

  assert.equal((await api('POST', `/api/depositos/${dep.Item}/rechazar`, { headers: admin, json: { motivo: '' } })).status, 400, 'motivo obligatorio');
  const rech = await api('POST', `/api/depositos/${dep.Item}/rechazar`, { headers: admin, json: { motivo: 'Falta factura' } });
  assert.equal(rech.status, 200);
  let d = await detalle(dep);
  assert.equal(d.deposito.Estado, 'Observado');
  assert.equal(d.deposito.Observaciones, 'Falta factura');

  assert.equal((await liquidar(dep, 60, 60)).status, 200, 'el técnico reenvía');
  const apr = await api('POST', `/api/depositos/${dep.Item}/aprobar`, { headers: admin });
  assert.equal(apr.status, 200, JSON.stringify(apr.data));
  d = await detalle(dep);
  assert.equal(d.deposito.Estado, 'Finalizado');
  assert.ok(d.deposito.Fecha_Aprobado);
  assert.match(d.deposito.Resumen_Pdf, /Resumen_Rendicion_.*\.pdf$/);

  const pdf = await fetch(`${BASE}${d.deposito.Resumen_Pdf}`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(pdf.headers.get('content-security-policy').includes('sandbox'), 'archivos servidos sin scripts');

  // Finalizado: ya no se puede observar, anular ni volver a enviar.
  assert.equal((await api('POST', `/api/depositos/${dep.Item}/rechazar`, { headers: admin, json: { motivo: 'x' } })).status, 400);
  assert.equal((await api('POST', `/api/depositos/${dep.Item}/anular`, { headers: admin, json: { motivo: 'x' } })).status, 400);
  assert.equal((await liquidar(dep, 60, 60)).status, 409);
});

test('reembolso: el supervisor debe adjuntar el voucher para aprobar', async () => {
  const dep = await nuevoDeposito(50);
  await gasto(dep, 80);
  const liq = await liquidar(dep, 50, 80);
  assert.equal(liq.data.estadoLiquidacion, 'Reembolso');

  assert.equal((await api('POST', `/api/depositos/${dep.Item}/aprobar`, { headers: admin })).status, 400);
  const apr = await api('POST', `/api/depositos/${dep.Item}/aprobar`, { headers: admin, body: form({}, { voucherReembolso: 'reembolso.png' }) });
  assert.equal(apr.status, 200);
  const d = await detalle(dep);
  assert.equal(d.liquidacion.Diferencia, '-30.00');
  assert.match(d.liquidacion.Comprobante_Liquidacion_Id, /Voucher_Reembolso_/);
});

test('anular y reglas de maestros con historial', async () => {
  const dep = await nuevoDeposito(40);
  assert.equal((await api('POST', `/api/depositos/${dep.Item}/anular`, { headers: admin, json: { motivo: 'duplicado' } })).status, 200);
  assert.equal((await detalle(dep)).deposito.Estado, 'Anulado');

  const del = await api('DELETE', `/api/tecnicos/${tec.Item}`, { headers: admin });
  assert.equal(del.status, 409, 'con depósitos solo se desactiva');
  const des = await api('PUT', `/api/tecnicos/${tec.Item}`, { headers: admin, json: { ...tec, Estado: 'Inactivo' } });
  assert.equal(des.data.Estado, 'Inactivo');
  assert.equal((await api('DELETE', `/api/supervisores/${sup.Item}`, { headers: admin })).status, 409);
});

test('archivos: solo imagen o PDF', async () => {
  const dep = await nuevoDeposito(10);
  const fd = form({ Tipo_Comprobante: 'Otros', Descripcion: 'x', Monto_Gasto: 1, Fecha_Comprobante: '2026-10-02' });
  fd.append('comprobante', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
  const r = await api('POST', `/api/depositos/${dep.Item}/comprobantes`, { body: fd });
  assert.equal(r.status, 400);
});

test('restaurar demo: carga los 11 depósitos de ejemplo con sus PDF', async () => {
  const r = await api('POST', '/api/demo/reset', { headers: admin });
  assert.equal(r.status, 200);
  const deps = (await api('GET', '/api/depositos', { headers: admin })).data;
  assert.equal(deps.length, 11);
  const porEstado = deps.reduce((a, d) => ({ ...a, [d.Estado]: (a[d.Estado] || 0) + 1 }), {});
  assert.deepEqual(porEstado, { Rindiendo: 3, Anulado: 1, Observado: 1, 'Por Revisar': 3, Finalizado: 3 });
  for (const d of deps.filter(x => x.Estado === 'Finalizado')) {
    assert.equal((await fetch(`${BASE}${d.Resumen_Pdf}`)).status, 200);
  }
  const tecnicos = (await api('GET', '/api/tecnicos', { headers: admin })).data;
  assert.equal(tecnicos.filter(t => t.Estado === 'Inactivo').length, 1);
});
