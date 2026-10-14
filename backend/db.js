import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH, baseUrl } from './config.js';

// Reemplazo local de sheetsService.js (Google Sheets) del sistema original.
// Las funciones conservan los mismos nombres y devuelven los mismos campos en PascalCase,
// con valores en texto (Item "3", Monto "150.00"), para que el frontend no cambie.
// DriveFolderId / DriveFileId se mantienen como nombres de campo por compatibilidad:
// ahora guardan la carpeta local del depósito y el link /archivos/... del archivo.

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tecnicos (
  item INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  celular TEXT NOT NULL DEFAULT '',
  dni TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'Activo'
);
CREATE TABLE IF NOT EXISTS supervisores (
  item INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  celular TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'Activo'
);
CREATE TABLE IF NOT EXISTS depositos (
  item INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnico TEXT NOT NULL,
  ticket TEXT NOT NULL,
  local TEXT NOT NULL,
  monto REAL NOT NULL,
  dia TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  carpeta TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Rindiendo',
  telefono TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  tecnico_id TEXT NOT NULL DEFAULT '',
  supervisor TEXT NOT NULL DEFAULT '',
  supervisor_id TEXT NOT NULL DEFAULT '',
  fecha_rendido TEXT NOT NULL DEFAULT '',
  fecha_aprobado TEXT NOT NULL DEFAULT '',
  resumen_pdf TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS detalle_gastos (
  item_gasto INTEGER PRIMARY KEY AUTOINCREMENT,
  item_deposito INTEGER NOT NULL REFERENCES depositos(item),
  tipo_comprobante TEXT NOT NULL,
  nro_comprobante TEXT NOT NULL DEFAULT '',
  monto_gasto REAL NOT NULL,
  fecha_comprobante TEXT NOT NULL,
  archivo TEXT NOT NULL DEFAULT '',
  ruc_emisor TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS liquidacion (
  item_deposito INTEGER PRIMARY KEY REFERENCES depositos(item),
  monto_depositado REAL NOT NULL,
  total_gastado REAL NOT NULL,
  diferencia REAL NOT NULL,
  estado_liquidacion TEXT NOT NULL,
  comprobante TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ampliaciones (
  item INTEGER PRIMARY KEY AUTOINCREMENT,
  item_deposito INTEGER NOT NULL REFERENCES depositos(item),
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  archivo TEXT NOT NULL DEFAULT '',
  supervisor TEXT NOT NULL DEFAULT '',
  supervisor_id TEXT NOT NULL DEFAULT ''
);
`;

export function openDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Ejecuta fn dentro de una transacción (todo o nada). */
export function transaction(fn) {
  const d = openDb();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

/** Borra todos los datos (para restaurar la demo). */
export function wipeAll() {
  const d = openDb();
  transaction(() => {
    for (const t of ['liquidacion', 'detalle_gastos', 'ampliaciones', 'depositos', 'tecnicos', 'supervisores']) {
      d.exec(`DELETE FROM ${t}`);
    }
    d.exec('DELETE FROM sqlite_sequence');
  });
}

export function isEmpty() {
  return openDb().prepare('SELECT COUNT(*) AS n FROM depositos').get().n === 0
    && openDb().prepare('SELECT COUNT(*) AS n FROM tecnicos').get().n === 0;
}

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ============================ Mapeo a la forma del original ============================ */

function mapDeposito(r) {
  if (!r) return undefined;
  return {
    Item: String(r.item),
    Tecnico: r.tecnico,
    Ticket: r.ticket,
    Local: r.local,
    Monto: money(r.monto),
    Dia: r.dia,
    Token: r.token,
    // Se arma al leer (no se guarda) porque la IP de la PC en la red puede cambiar entre sesiones.
    LinkRendicion: `${baseUrl()}/rendir/${r.token}`,
    DriveFolderId: r.carpeta,
    Estado: r.estado,
    Telefono: r.telefono,
    Observaciones: r.observaciones,
    Tecnico_Id: r.tecnico_id,
    Supervisor: r.supervisor,
    Supervisor_Id: r.supervisor_id,
    Fecha_Rendido: r.fecha_rendido,
    Fecha_Aprobado: r.fecha_aprobado,
    Resumen_Pdf: r.resumen_pdf,
  };
}

function mapGasto(r) {
  return {
    Item_Gasto: String(r.item_gasto),
    Item_Deposito: String(r.item_deposito),
    Tipo_Comprobante: r.tipo_comprobante,
    Nro_Comprobante: r.nro_comprobante,
    Monto_Gasto: money(r.monto_gasto),
    Fecha_Comprobante: r.fecha_comprobante,
    DriveFileId: r.archivo,
    RUC_Emisor: r.ruc_emisor,
    Descripcion: r.descripcion,
  };
}

function mapLiquidacion(r) {
  if (!r) return undefined;
  return {
    Item_Deposito: String(r.item_deposito),
    Monto_Depositado: money(r.monto_depositado),
    Total_Gastado: money(r.total_gastado),
    Diferencia: money(r.diferencia),
    Estado_Liquidacion: r.estado_liquidacion,
    Comprobante_Liquidacion_Id: r.comprobante,
  };
}

function mapAmpliacion(r) {
  return {
    Item: String(r.item),
    Item_Deposito: String(r.item_deposito),
    Monto: money(r.monto),
    Fecha: r.fecha,
    Motivo: r.motivo,
    DriveFileId: r.archivo,
    Supervisor: r.supervisor,
    Supervisor_Id: r.supervisor_id,
  };
}

const mapTecnico = (r) => r && ({ Item: String(r.item), Nombre: r.nombre, Celular: r.celular, DNI: r.dni, Estado: r.estado });
const mapSupervisor = (r) => r && ({ Item: String(r.item), Nombre: r.nombre, Celular: r.celular, Estado: r.estado });

/* ============================ Depósitos ============================ */

export function getDepositos() {
  // Más recientes primero.
  return openDb().prepare('SELECT * FROM depositos ORDER BY item DESC').all().map(mapDeposito);
}

export function getDepositoByToken(token) {
  return mapDeposito(openDb().prepare('SELECT * FROM depositos WHERE token = ?').get(String(token)));
}

export function getDepositoById(id) {
  return mapDeposito(openDb().prepare('SELECT * FROM depositos WHERE item = ?').get(Number(id)));
}

export function addDeposito(d) {
  const r = openDb().prepare(`
    INSERT INTO depositos (tecnico, ticket, local, monto, dia, token, carpeta, estado, telefono, observaciones,
      tecnico_id, supervisor, supervisor_id, fecha_rendido, fecha_aprobado, resumen_pdf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.Tecnico, d.Ticket, d.Local, round2(d.Monto), d.Dia, d.Token, d.DriveFolderId, d.Estado || 'Rindiendo',
    d.Telefono || '', d.Observaciones || '', String(d.Tecnico_Id || ''), d.Supervisor || '', String(d.Supervisor_Id || ''),
    d.Fecha_Rendido || '', d.Fecha_Aprobado || '', d.Resumen_Pdf || ''
  );
  return getDepositoById(r.lastInsertRowid);
}

const DEPOSITO_COLS = {
  Tecnico: 'tecnico', Ticket: 'ticket', Local: 'local', Monto: 'monto', Dia: 'dia', DriveFolderId: 'carpeta',
  Estado: 'estado', Telefono: 'telefono', Observaciones: 'observaciones', Tecnico_Id: 'tecnico_id',
  Supervisor: 'supervisor', Supervisor_Id: 'supervisor_id', Fecha_Rendido: 'fecha_rendido',
  Fecha_Aprobado: 'fecha_aprobado', Resumen_Pdf: 'resumen_pdf',
};

/** Actualiza uno o más campos de un depósito (nombres de campo del original). */
export function updateDeposito(itemId, fields) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    const col = DEPOSITO_COLS[key];
    if (!col) continue;
    sets.push(`${col} = ?`);
    values.push(col === 'monto' ? round2(value) : String(value ?? ''));
  }
  if (sets.length === 0) return true;
  const r = openDb().prepare(`UPDATE depositos SET ${sets.join(', ')} WHERE item = ?`).run(...values, Number(itemId));
  if (r.changes === 0) throw new Error(`Deposito with Item ${itemId} not found`);
  return true;
}

/* ============================ Gastos ============================ */

export function getGastosByDeposito(itemDepositoId) {
  return openDb().prepare('SELECT * FROM detalle_gastos WHERE item_deposito = ? ORDER BY item_gasto')
    .all(Number(itemDepositoId)).map(mapGasto);
}

const soloDigitosStr = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const normSerie = (v) => String(v == null ? '' : v).trim().toUpperCase();
// El correlativo se compara por valor numérico: "000412" === "412".
const normCorrelativo = (v) => {
  const d = soloDigitosStr(v);
  return d ? String(parseInt(d, 10)) : '';
};
const splitNroComprobante = (nro) => {
  const s = String(nro || '');
  const idx = s.indexOf('-');
  if (idx === -1) return { serie: s, correlativo: '' };
  return { serie: s.slice(0, idx), correlativo: s.slice(idx + 1) };
};

/**
 * Busca en todo el sistema (todos los depósitos y técnicos) un comprobante ya rendido con la
 * misma identidad fiscal RUC + Serie + Correlativo. Devuelve el gasto existente o null.
 */
export function buscarComprobanteDuplicado(ruc, serie, correlativo) {
  const R = soloDigitosStr(ruc);
  const S = normSerie(serie);
  const C = normCorrelativo(correlativo);
  if (!R || !S || !C) return null;

  const candidatos = openDb().prepare('SELECT * FROM detalle_gastos WHERE ruc_emisor = ?').all(R);
  const hit = candidatos.find(g => {
    const { serie: gs, correlativo: gc } = splitNroComprobante(g.nro_comprobante);
    return normSerie(gs) === S && normCorrelativo(gc) === C;
  });
  return hit ? mapGasto(hit) : null;
}

export function addGasto(g) {
  const r = openDb().prepare(`
    INSERT INTO detalle_gastos (item_deposito, tipo_comprobante, nro_comprobante, monto_gasto, fecha_comprobante, archivo, ruc_emisor, descripcion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(Number(g.Item_Deposito), g.Tipo_Comprobante, g.Nro_Comprobante || '', round2(g.Monto_Gasto),
    g.Fecha_Comprobante, g.DriveFileId || '', g.RUC_Emisor || '', g.Descripcion || '');
  return { ...g, Item_Gasto: String(r.lastInsertRowid), Monto_Gasto: money(g.Monto_Gasto) };
}

/* ============================ Liquidación ============================ */

export function getLiquidacionByDeposito(itemDepositoId) {
  return mapLiquidacion(openDb().prepare('SELECT * FROM liquidacion WHERE item_deposito = ?').get(Number(itemDepositoId)));
}

/** Crea o reemplaza la liquidación de un depósito (una por depósito). */
export function saveLiquidacion(liq) {
  openDb().prepare(`
    INSERT INTO liquidacion (item_deposito, monto_depositado, total_gastado, diferencia, estado_liquidacion, comprobante)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_deposito) DO UPDATE SET
      monto_depositado = excluded.monto_depositado, total_gastado = excluded.total_gastado,
      diferencia = excluded.diferencia, estado_liquidacion = excluded.estado_liquidacion,
      comprobante = excluded.comprobante
  `).run(Number(liq.Item_Deposito), round2(liq.Monto_Depositado), round2(liq.Total_Gastado), round2(liq.Diferencia),
    liq.Estado_Liquidacion, liq.Comprobante_Liquidacion_Id || '');
  return true;
}

/* ============================ Técnicos ============================ */

export function getTecnicos() {
  return openDb().prepare('SELECT * FROM tecnicos ORDER BY nombre').all().map(mapTecnico);
}

export function getTecnicoById(id) {
  return mapTecnico(openDb().prepare('SELECT * FROM tecnicos WHERE item = ?').get(Number(id)));
}

export function addTecnico(t) {
  const r = openDb().prepare('INSERT INTO tecnicos (nombre, celular, dni, estado) VALUES (?, ?, ?, ?)')
    .run(t.Nombre, t.Celular || '', t.DNI || '', t.Estado || 'Activo');
  return getTecnicoById(r.lastInsertRowid);
}

export function updateTecnico(id, t) {
  openDb().prepare('UPDATE tecnicos SET nombre = ?, celular = ?, dni = ?, estado = ? WHERE item = ?')
    .run(t.Nombre, t.Celular || '', t.DNI || '', t.Estado || 'Activo', Number(id));
  return getTecnicoById(id);
}

export function deleteTecnico(id) {
  openDb().prepare('DELETE FROM tecnicos WHERE item = ?').run(Number(id));
}

/** Cuántos depósitos referencian a este técnico (si hay, solo se puede desactivar). */
export function countDepositosDeTecnico(id) {
  return openDb().prepare('SELECT COUNT(*) AS n FROM depositos WHERE tecnico_id = ?').get(String(id)).n;
}

/* ============================ Supervisores ============================ */

export function getSupervisores() {
  return openDb().prepare('SELECT * FROM supervisores ORDER BY nombre').all().map(mapSupervisor);
}

export function getSupervisorById(id) {
  return mapSupervisor(openDb().prepare('SELECT * FROM supervisores WHERE item = ?').get(Number(id)));
}

export function addSupervisor(s) {
  const r = openDb().prepare('INSERT INTO supervisores (nombre, celular, estado) VALUES (?, ?, ?)')
    .run(s.Nombre, s.Celular || '', s.Estado || 'Activo');
  return getSupervisorById(r.lastInsertRowid);
}

export function updateSupervisor(id, s) {
  openDb().prepare('UPDATE supervisores SET nombre = ?, celular = ?, estado = ? WHERE item = ?')
    .run(s.Nombre, s.Celular || '', s.Estado || 'Activo', Number(id));
  return getSupervisorById(id);
}

export function deleteSupervisor(id) {
  openDb().prepare('DELETE FROM supervisores WHERE item = ?').run(Number(id));
}

/** Depósitos o ampliaciones registrados por este supervisor. */
export function countMovimientosDeSupervisor(id) {
  const a = openDb().prepare('SELECT COUNT(*) AS n FROM depositos WHERE supervisor_id = ?').get(String(id)).n;
  const b = openDb().prepare('SELECT COUNT(*) AS n FROM ampliaciones WHERE supervisor_id = ?').get(String(id)).n;
  return a + b;
}

/* ============================ Ampliaciones ============================ */

export function getAmpliacionesByDeposito(itemDepositoId) {
  return openDb().prepare('SELECT * FROM ampliaciones WHERE item_deposito = ? ORDER BY item')
    .all(Number(itemDepositoId)).map(mapAmpliacion);
}

export function addAmpliacion(a) {
  const r = openDb().prepare(`
    INSERT INTO ampliaciones (item_deposito, monto, fecha, motivo, archivo, supervisor, supervisor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(Number(a.Item_Deposito), round2(a.Monto), a.Fecha, a.Motivo || '', a.DriveFileId || '',
    a.Supervisor || '', String(a.Supervisor_Id || ''));
  return { ...a, Item: String(r.lastInsertRowid) };
}
