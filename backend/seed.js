import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TMP_DIR, BRAND, COMPANY_ACCOUNTS } from './config.js';
import {
  wipeAll, addTecnico, updateTecnico, addSupervisor, addDeposito, updateDeposito, addGasto,
  addAmpliacion, saveLiquidacion, getGastosByDeposito, getDepositoById
} from './db.js';
import { createFolder, uploadFile, wipeFiles } from './storage.js';
import { generarResumen } from './resumen.js';

// Datos de ejemplo de la demo: Empresa Demo SAC, rubro mantenimiento industrial.
// Todos los nombres, DNI, celulares, RUC y montos son inventados. Las fechas se calculan
// respecto de hoy para que la demo siempre se vea "al día".

/* ---------------------------------- utilidades ---------------------------------- */

function fechaHace(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round2 = (n) => Math.round(n * 100) / 100;
const soles = (n) => `S/ ${Number(n).toFixed(2)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Completa un RUC de 10 dígitos con su dígito verificador SUNAT (módulo 11). */
function ruc(base10) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = [...base10].reduce((a, c, i) => a + Number(c) * pesos[i], 0);
  let dv = 11 - (suma % 11);
  if (dv === 10) dv = 0;
  if (dv === 11) dv = 1;
  return `${base10}${dv}`;
}

const EMISORES = {
  ferreteria: { nombre: 'FERRETERÍA INDUSTRIAL DEMO S.A.C.', ruc: ruc('2060100001') },
  electricos: { nombre: 'SUMINISTROS ELÉCTRICOS DEMO E.I.R.L.', ruc: ruc('2060200002') },
  rodamientos: { nombre: 'RODAMIENTOS Y FAJAS DEMO S.A.C.', ruc: ruc('2060300003') },
  restaurante: { nombre: 'RESTAURANTE EL BUEN SABOR DEMO', ruc: ruc('1040400004') },
  grifo: { nombre: 'GRIFO SERVICENTRO DEMO S.A.C.', ruc: ruc('2060500005') },
  hidraulica: { nombre: 'HIDRÁULICA Y MANGUERAS DEMO S.A.C.', ruc: ruc('2060600006') },
  soldador: { nombre: 'TEODORO ARIAS DEMO (SOLDADOR)', ruc: ruc('1040700007') },
};

/* ------------------------------ imágenes de muestra ------------------------------ */

const marcaDemo = (w, h) => `
  <text x="${w / 2}" y="${h / 2}" transform="rotate(-30 ${w / 2} ${h / 2})" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="96" font-weight="700" fill="#1E63E9" fill-opacity="0.08">DEMO</text>`;

/** Constancia de transferencia bancaria (voucher). */
function voucherSvg({ titulo, monto, fecha, operacion, origen, destino, concepto }) {
  const w = 420; const h = 560;
  const fila = (y, k, v) => `
    <text x="32" y="${y}" font-size="12" fill="#6b7280">${esc(k)}</text>
    <text x="${w - 32}" y="${y}" font-size="13" fill="#111827" text-anchor="end" font-weight="600">${esc(v)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial, sans-serif">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <rect width="${w}" height="92" fill="#0D1B3E"/>
  <text x="32" y="44" font-size="22" font-weight="700" fill="#ffffff">BANCO DEMO</text>
  <text x="32" y="68" font-size="12" fill="#c7d2fe">${esc(titulo)}</text>
  <circle cx="${w / 2}" cy="140" r="26" fill="#16a34a"/>
  <path d="M${w / 2 - 11} 140 l8 8 l15 -16" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${w / 2}" y="196" font-size="13" fill="#6b7280" text-anchor="middle">Operación exitosa</text>
  <text x="${w / 2}" y="236" font-size="32" font-weight="700" fill="#111827" text-anchor="middle">${esc(soles(monto))}</text>
  <line x1="32" y1="264" x2="${w - 32}" y2="264" stroke="#e5e7eb"/>
  ${fila(296, 'Fecha', fecha)}
  ${fila(326, 'N.° de operación', operacion)}
  ${fila(356, 'Cuenta origen', origen)}
  ${fila(386, 'Cuenta destino', destino)}
  ${fila(416, 'Concepto', concepto)}
  <line x1="32" y1="444" x2="${w - 32}" y2="444" stroke="#e5e7eb"/>
  <text x="${w / 2}" y="480" font-size="11" fill="#9ca3af" text-anchor="middle">Constancia de demostración generada por ${esc(BRAND.producto)}.</text>
  <text x="${w / 2}" y="498" font-size="11" fill="#9ca3af" text-anchor="middle">No tiene validez como documento bancario.</text>
  ${marcaDemo(w, h)}
</svg>`;
}

/** Boleta / factura / recibo por honorarios simplificado. */
function comprobanteSvg({ tipo, emisor, nro, fecha, items }) {
  const w = 420;
  const h = 330 + items.length * 26;
  const total = round2(items.reduce((a, i) => a + i.importe, 0));
  const titulo = {
    Boleta: 'BOLETA DE VENTA ELECTRÓNICA',
    Factura: 'FACTURA ELECTRÓNICA',
    'Recibo de Honorarios': 'RECIBO POR HONORARIOS ELECTRÓNICO',
  }[tipo];
  const lineas = items.map((it, i) => `
    <text x="28" y="${232 + i * 26}" font-size="12" fill="#111827">${esc(it.desc)}</text>
    <text x="${w - 28}" y="${232 + i * 26}" font-size="12" fill="#111827" text-anchor="end">${esc(it.importe.toFixed(2))}</text>`).join('');
  const yTotal = 232 + items.length * 26 + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Courier New, monospace">
  <rect width="${w}" height="${h}" fill="#fffef8"/>
  <text x="${w / 2}" y="40" font-size="14" font-weight="700" fill="#111827" text-anchor="middle">${esc(emisor.nombre)}</text>
  <text x="${w / 2}" y="60" font-size="12" fill="#374151" text-anchor="middle">RUC ${esc(emisor.ruc)}</text>
  <rect x="70" y="76" width="${w - 140}" height="52" fill="none" stroke="#111827" stroke-width="1.5"/>
  <text x="${w / 2}" y="98" font-size="11" font-weight="700" fill="#111827" text-anchor="middle">${esc(titulo)}</text>
  <text x="${w / 2}" y="118" font-size="13" font-weight="700" fill="#111827" text-anchor="middle">${esc(nro)}</text>
  <text x="28" y="156" font-size="11" fill="#374151">Fecha de emisión: ${esc(fecha)}</text>
  <text x="28" y="174" font-size="11" fill="#374151">Cliente: ${esc(BRAND.empresa.toUpperCase())}</text>
  <line x1="28" y1="190" x2="${w - 28}" y2="190" stroke="#111827" stroke-dasharray="4 3"/>
  <text x="28" y="208" font-size="11" font-weight="700" fill="#111827">DESCRIPCIÓN</text>
  <text x="${w - 28}" y="208" font-size="11" font-weight="700" fill="#111827" text-anchor="end">IMPORTE</text>
  ${lineas}
  <line x1="28" y1="${yTotal - 12}" x2="${w - 28}" y2="${yTotal - 12}" stroke="#111827" stroke-dasharray="4 3"/>
  <text x="28" y="${yTotal + 8}" font-size="14" font-weight="700" fill="#111827">TOTAL</text>
  <text x="${w - 28}" y="${yTotal + 8}" font-size="14" font-weight="700" fill="#111827" text-anchor="end">${esc(soles(total))}</text>
  <text x="${w / 2}" y="${h - 22}" font-size="10" fill="#9ca3af" text-anchor="middle">Comprobante de demostración - sin valor tributario</text>
  ${marcaDemo(w, h)}
</svg>`;
}

/** Declaración jurada / otros gastos sin comprobante. */
function declaracionSvg({ tecnico, descripcion, monto, fecha }) {
  const w = 420; const h = 420;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial, sans-serif">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <text x="${w / 2}" y="52" font-size="16" font-weight="700" fill="#111827" text-anchor="middle">DECLARACIÓN JURADA DE GASTOS</text>
  <text x="${w / 2}" y="74" font-size="11" fill="#6b7280" text-anchor="middle">${esc(BRAND.empresa)}</text>
  <text x="32" y="122" font-size="12" fill="#374151">Yo, ${esc(tecnico)}, declaro haber realizado</text>
  <text x="32" y="142" font-size="12" fill="#374151">el siguiente gasto sin comprobante de pago:</text>
  <rect x="32" y="160" width="${w - 64}" height="64" rx="6" fill="#f3f4f6"/>
  <text x="46" y="188" font-size="12" fill="#111827">${esc(descripcion)}</text>
  <text x="46" y="210" font-size="12" font-weight="700" fill="#111827">Importe: ${esc(soles(monto))}</text>
  <text x="32" y="262" font-size="12" fill="#374151">Fecha: ${esc(fecha)}</text>
  <path d="M120 330 c20 -30 40 10 60 -10 s30 20 50 -5" stroke="#1E3A8A" stroke-width="2" fill="none"/>
  <line x1="100" y1="344" x2="${w - 100}" y2="344" stroke="#111827"/>
  <text x="${w / 2}" y="362" font-size="11" fill="#374151" text-anchor="middle">Firma del técnico</text>
  ${marcaDemo(w, h)}
</svg>`;
}

/* ------------------------------ operaciones de carga ------------------------------ */

let opSeq = 0;
const nroOperacion = () => String(48210375 + (opSeq++) * 7919).padStart(8, '0');

/** Guarda un SVG de muestra en la carpeta del depósito y devuelve su link. */
async function guardarSvg(folderId, fileName, svg) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmp = path.join(TMP_DIR, `seed-${crypto.randomBytes(6).toString('hex')}.svg`);
  fs.writeFileSync(tmp, svg, 'utf8');
  try {
    const up = await uploadFile(tmp, fileName, 'image/svg+xml', folderId);
    return up.webViewLink;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function crearDeposito({ tec, sup, ticket, local, monto, dia }) {
  const folder = await createFolder(`TICKET-${ticket}_${tec.Nombre}_${local}`);
  await guardarSvg(folder.id, `Voucher_Deposito_${ticket}.svg`, voucherSvg({
    titulo: 'Constancia de transferencia', monto, fecha: dia, operacion: nroOperacion(),
    origen: `${BRAND.empresa} ****0000`, destino: `${tec.Nombre} ****${tec.Celular.slice(-4)}`,
    concepto: `Ticket ${ticket} - ${local}`,
  }));
  return addDeposito({
    Tecnico: tec.Nombre, Ticket: ticket, Local: local, Monto: monto, Dia: dia,
    Token: crypto.randomBytes(16).toString('hex'), DriveFolderId: folder.id, Estado: 'Rindiendo',
    Telefono: tec.Celular, Tecnico_Id: tec.Item, Supervisor: sup.Nombre, Supervisor_Id: sup.Item,
  });
}

/** Agrega un comprobante con RUC (Boleta / Factura / Recibo de Honorarios). */
async function gastoConRuc(dep, { tipo, emisor, serie, correlativo, fecha, items }) {
  const nro = `${serie}-${correlativo}`;
  const monto = round2(items.reduce((a, i) => a + i.importe, 0));
  const link = await guardarSvg(dep.DriveFolderId, `Gasto_${tipo}_${nro}.svg`, comprobanteSvg({ tipo, emisor, nro, fecha, items }));
  addGasto({
    Item_Deposito: dep.Item, Tipo_Comprobante: tipo, Nro_Comprobante: nro, Monto_Gasto: monto,
    Fecha_Comprobante: fecha, DriveFileId: link, RUC_Emisor: emisor.ruc, Descripcion: '',
  });
}

/** Agrega un gasto "libre" (Otros / Declaración Jurada) con descripción. */
async function gastoLibre(dep, { tipo, descripcion, monto, fecha }) {
  const link = await guardarSvg(dep.DriveFolderId, `Gasto_${tipo}_OTROS.svg`,
    declaracionSvg({ tecnico: dep.Tecnico, descripcion, monto, fecha }));
  addGasto({
    Item_Deposito: dep.Item, Tipo_Comprobante: tipo, Nro_Comprobante: '', Monto_Gasto: monto,
    Fecha_Comprobante: fecha, DriveFileId: link, RUC_Emisor: '', Descripcion: descripcion,
  });
}

async function ampliar(dep, { sup, monto, fecha, motivo }) {
  const link = await guardarSvg(dep.DriveFolderId, `Voucher_Deposito_Adicional_1_${dep.Ticket}.svg`, voucherSvg({
    titulo: 'Constancia de transferencia', monto, fecha, operacion: nroOperacion(),
    origen: `${BRAND.empresa} ****0000`, destino: `${dep.Tecnico} ****${dep.Telefono.slice(-4)}`,
    concepto: `Adicional ticket ${dep.Ticket}`,
  }));
  addAmpliacion({ Item_Deposito: dep.Item, Monto: monto, Fecha: fecha, Motivo: motivo, DriveFileId: link, Supervisor: sup.Nombre, Supervisor_Id: sup.Item });
  const actual = getDepositoById(dep.Item);
  updateDeposito(dep.Item, { Monto: round2(parseFloat(actual.Monto) + monto) });
  return getDepositoById(dep.Item);
}

/** Envía la rendición con la misma regla del servidor (balance a céntimos). */
async function liquidar(dep, fechaRendido) {
  const d = getDepositoById(dep.Item);
  const monto = round2(parseFloat(d.Monto));
  const total = round2(getGastosByDeposito(d.Item).reduce((a, g) => a + parseFloat(g.Monto_Gasto), 0));
  const dif = round2(monto - total);
  const tipo = dif > 0 ? 'Devolucion' : dif < 0 ? 'Reembolso' : 'Exacto';
  let voucher = '';
  if (tipo === 'Devolucion') {
    const cuenta = COMPANY_ACCOUNTS[0];
    voucher = await guardarSvg(d.DriveFolderId, `Voucher_Devolucion_Saldo_${d.Ticket}.svg`, voucherSvg({
      titulo: 'Constancia de depósito', monto: dif, fecha: fechaRendido, operacion: nroOperacion(),
      origen: `${d.Tecnico} ****${d.Telefono.slice(-4)}`, destino: `${cuenta.titular} ${cuenta.number}`,
      concepto: `Vuelto ticket ${d.Ticket}`,
    }));
  }
  saveLiquidacion({ Item_Deposito: d.Item, Monto_Depositado: monto, Total_Gastado: total, Diferencia: dif, Estado_Liquidacion: tipo, Comprobante_Liquidacion_Id: voucher });
  updateDeposito(d.Item, { Estado: 'Por Revisar', Fecha_Rendido: fechaRendido });
  return { tipo, dif };
}

async function aprobar(dep, fechaAprobado) {
  const d = getDepositoById(dep.Item);
  const total = round2(getGastosByDeposito(d.Item).reduce((a, g) => a + parseFloat(g.Monto_Gasto), 0));
  const dif = round2(parseFloat(d.Monto) - total);
  if (dif < 0) {
    const link = await guardarSvg(d.DriveFolderId, `Voucher_Reembolso_${d.Ticket}.svg`, voucherSvg({
      titulo: 'Constancia de transferencia', monto: -dif, fecha: fechaAprobado, operacion: nroOperacion(),
      origen: `${BRAND.empresa} ****0000`, destino: `${d.Tecnico} ****${d.Telefono.slice(-4)}`,
      concepto: `Reembolso ticket ${d.Ticket}`,
    }));
    saveLiquidacion({ Item_Deposito: d.Item, Monto_Depositado: d.Monto, Total_Gastado: total, Diferencia: dif, Estado_Liquidacion: 'Reembolso', Comprobante_Liquidacion_Id: link });
  }
  updateDeposito(d.Item, { Estado: 'Finalizado', Fecha_Aprobado: fechaAprobado });
  await generarResumen(d.Item);
}

/* ------------------------------------ escenario ------------------------------------ */

async function cargarEscenario() {
  const t = {
    luis: addTecnico({ Nombre: 'Luis Quispe Mamani', Celular: '900100201', DNI: '45120871' }),
    carlos: addTecnico({ Nombre: 'Carlos Huamán Torres', Celular: '900100202', DNI: '42318845' }),
    jorge: addTecnico({ Nombre: 'Jorge Mendoza Ccori', Celular: '900100203', DNI: '47011296' }),
    miguel: addTecnico({ Nombre: 'Miguel Ríos Paredes', Celular: '900100204', DNI: '44876310' }),
    kevin: addTecnico({ Nombre: 'Kevin Salazar Rojas', Celular: '900100205', DNI: '46239957' }),
    raul: addTecnico({ Nombre: 'Raúl Vega Ticona', Celular: '900100206', DNI: '41702238' }),
  };
  const s = {
    rosa: addSupervisor({ Nombre: 'Rosa Gutiérrez Vargas', Celular: '900200301' }),
    martin: addSupervisor({ Nombre: 'Martín Castillo Poma', Celular: '900200302' }),
  };
  const E = EMISORES;

  // 1. Finalizado, balance exacto (técnico que luego se desactivó).
  let d = await crearDeposito({ tec: t.raul, sup: s.rosa, ticket: '24031', local: 'Planta Lurín', monto: 350, dia: fechaHace(30) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.ferreteria, serie: 'F001', correlativo: '004512', fecha: fechaHace(29), items: [
    { desc: 'Pernos hexagonales 1/2" x 50', importe: 140.0 }, { desc: 'Empaquetadura de bomba', importe: 80.0 }] });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018233', fecha: fechaHace(29), items: [
    { desc: 'Menú x 3 (cuadrilla)', importe: 45.0 }] });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.grifo, serie: 'F002', correlativo: '009871', fecha: fechaHace(28), items: [
    { desc: 'Diésel B5 - 5 gal', importe: 85.0 }] });
  await liquidar(d, fechaHace(26));
  await aprobar(d, fechaHace(25));

  // 2. Finalizado con reembolso al técnico.
  d = await crearDeposito({ tec: t.luis, sup: s.martin, ticket: '24035', local: 'Planta Ate', monto: 400, dia: fechaHace(21) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.rodamientos, serie: 'F001', correlativo: '002217', fecha: fechaHace(20), items: [
    { desc: 'Rodamiento SKF 6205-2RS x 2', importe: 186.5 }, { desc: 'Faja en V B-52', importe: 99.0 }] });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.ferreteria, serie: 'F001', correlativo: '004588', fecha: fechaHace(20), items: [
    { desc: 'Grasa industrial EP2 - 1 kg', importe: 98.0 }] });
  await gastoLibre(d, { tipo: 'Otros', descripcion: 'Taxi a Planta Ate con repuestos', monto: 35.0, fecha: fechaHace(20) });
  await liquidar(d, fechaHace(18));
  await aprobar(d, fechaHace(17));

  // 3. Finalizado con devolución del vuelto.
  d = await crearDeposito({ tec: t.carlos, sup: s.rosa, ticket: '24038', local: 'Almacén Callao', monto: 500, dia: fechaHace(16) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.electricos, serie: 'F003', correlativo: '000731', fecha: fechaHace(15), items: [
    { desc: 'Contactor trifásico 25A', importe: 212.4 }, { desc: 'Cable NYY 3x10 mm2 - 5 m', importe: 100.0 }] });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018390', fecha: fechaHace(15), items: [
    { desc: 'Menú x 4 (cuadrilla)', importe: 60.0 }] });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.grifo, serie: 'F002', correlativo: '010102', fecha: fechaHace(14), items: [
    { desc: 'Gasolina 90 - 5 gal', importe: 90.0 }] });
  await liquidar(d, fechaHace(13));
  await aprobar(d, fechaHace(12));

  // 4. Por revisar, balance exacto.
  d = await crearDeposito({ tec: t.jorge, sup: s.martin, ticket: '24042', local: 'Tienda Miraflores', monto: 250, dia: fechaHace(8) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.electricos, serie: 'F003', correlativo: '000802', fecha: fechaHace(7), items: [
    { desc: 'Tablero de distribución 12 polos', importe: 180.0 }] });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018512', fecha: fechaHace(7), items: [
    { desc: 'Menú x 2', importe: 40.0 }] });
  await gastoLibre(d, { tipo: 'Declaración Jurada', descripcion: 'Movilidad local ida y vuelta', monto: 30.0, fecha: fechaHace(7) });
  await liquidar(d, fechaHace(3));

  // 5. Por revisar, con depósito adicional y devolución del vuelto.
  d = await crearDeposito({ tec: t.miguel, sup: s.rosa, ticket: '24044', local: 'Planta Huachipa', monto: 300, dia: fechaHace(7) });
  d = await ampliar(d, { sup: s.rosa, monto: 150, fecha: fechaHace(6), motivo: 'Se requirió cambiar mangueras hidráulicas adicionales' });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.hidraulica, serie: 'F001', correlativo: '001145', fecha: fechaHace(6), items: [
    { desc: 'Manguera hidráulica 1/2" 2 hilos - 4 m', importe: 209.9 }, { desc: 'Terminales y conectores', importe: 80.0 }] });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.ferreteria, serie: 'F001', correlativo: '004701', fecha: fechaHace(6), items: [
    { desc: 'Abrazaderas y teflón', importe: 120.0 }] });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018577', fecha: fechaHace(5), items: [
    { desc: 'Menú x 1 + bebida', importe: 28.0 }] });
  await liquidar(d, fechaHace(2));

  // 6. Por revisar, con reembolso (gastó de más; incluye recibo por honorarios).
  d = await crearDeposito({ tec: t.kevin, sup: s.martin, ticket: '24046', local: 'Tienda San Isidro', monto: 200, dia: fechaHace(6) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.electricos, serie: 'F003', correlativo: '000845', fecha: fechaHace(5), items: [
    { desc: 'Luminaria LED hermética 2x18W x 2', importe: 176.8 }] });
  await gastoConRuc(d, { tipo: 'Recibo de Honorarios', emisor: E.soldador, serie: 'E001', correlativo: '000094', fecha: fechaHace(5), items: [
    { desc: 'Servicio de soldadura de soporte', importe: 80.0 }] });
  await liquidar(d, fechaHace(1));

  // 7. Observado: el supervisor la rechazó con un motivo.
  d = await crearDeposito({ tec: t.luis, sup: s.rosa, ticket: '24048', local: 'Planta Chilca', monto: 300, dia: fechaHace(5) });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018601', fecha: fechaHace(4), items: [
    { desc: 'Menú x 3 (cuadrilla)', importe: 55.0 }] });
  await gastoLibre(d, { tipo: 'Otros', descripcion: 'Compra de repuesto de válvula', monto: 120.0, fecha: fechaHace(4) });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.grifo, serie: 'F002', correlativo: '010388', fecha: fechaHace(4), items: [
    { desc: 'Diésel B5 - 7 gal', importe: 125.0 }] });
  await liquidar(d, fechaHace(3));
  updateDeposito(d.Item, {
    Estado: 'Observado',
    Observaciones: 'El repuesto de válvula (S/ 120.00) se compró en una ferretería: pide la factura y súbela en lugar del gasto en "Otros".',
  });

  // 8. Anulado.
  d = await crearDeposito({ tec: t.kevin, sup: s.martin, ticket: '24049', local: 'Planta Lurín', monto: 150, dia: fechaHace(5) });
  updateDeposito(d.Item, { Estado: 'Anulado', Observaciones: 'Depósito duplicado: el ticket 24046 ya cubría este trabajo.' });

  // 9. Rindiendo, con depósito adicional y un comprobante.
  d = await crearDeposito({ tec: t.carlos, sup: s.martin, ticket: '24050', local: 'Planta Ate', monto: 250, dia: fechaHace(4) });
  d = await ampliar(d, { sup: s.martin, monto: 200, fecha: fechaHace(3), motivo: 'Cambio del rodamiento del motor principal' });
  await gastoConRuc(d, { tipo: 'Factura', emisor: E.rodamientos, serie: 'F001', correlativo: '002298', fecha: fechaHace(3), items: [
    { desc: 'Rodamiento SKF 6310 C3', importe: 310.0 }] });

  // 10. Rindiendo, con un comprobante.
  d = await crearDeposito({ tec: t.jorge, sup: s.rosa, ticket: '24052', local: 'Tienda Surco', monto: 180, dia: fechaHace(2) });
  await gastoConRuc(d, { tipo: 'Boleta', emisor: E.restaurante, serie: 'B001', correlativo: '018655', fecha: fechaHace(1), items: [
    { desc: 'Menú x 2', importe: 32.5 }] });

  // 11. Rindiendo, recién creado (sin comprobantes).
  await crearDeposito({ tec: t.miguel, sup: s.martin, ticket: '24054', local: 'Almacén Villa El Salvador', monto: 220, dia: fechaHace(0) });

  // El técnico del depósito 1 ya no trabaja en la empresa: queda inactivo pero su historial se conserva.
  updateTecnico(t.raul.Item, { ...t.raul, Estado: 'Inactivo' });
}

/** Borra todo (base y archivos) y carga el escenario de ejemplo. */
export async function resetDemo() {
  wipeAll();
  wipeFiles();
  opSeq = 0;
  await cargarEscenario();
}

