import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import QRCode from 'qrcode';

import {
  PORT, FILES_DIR, TMP_DIR, SUPERVISOR_PASSWORD, AUTO_SEED, BRAND, COMPANY_ACCOUNTS, hoy, baseUrl, detectarIp
} from './config.js';
import {
  openDb,
  isEmpty,
  getDepositos,
  getDepositoByToken,
  getDepositoById,
  addDeposito,
  updateDeposito,
  getGastosByDeposito,
  addGasto,
  buscarComprobanteDuplicado,
  saveLiquidacion,
  getLiquidacionByDeposito,
  getTecnicos,
  getTecnicoById,
  addTecnico,
  updateTecnico,
  deleteTecnico,
  countDepositosDeTecnico,
  getSupervisores,
  getSupervisorById,
  addSupervisor,
  updateSupervisor,
  deleteSupervisor,
  countMovimientosDeSupervisor,
  getAmpliacionesByDeposito,
  addAmpliacion
} from './db.js';
import { createFolder, uploadFile, listFiles } from './storage.js';
import { generarResumen } from './resumen.js';
import { validarRuc, soloDigitos } from './rucUtil.js';
import { resetDemo } from './seed.js';

// Tipos de comprobante "libres": no exigen RUC ni número, requieren Descripción y NO se
// validan contra duplicados (mantener en sincronía con el frontend).
const TIPOS_LIBRES = ['Otros', 'Declaración Jurada'];
const TIPOS_VALIDOS = ['Boleta', 'Factura', 'Recibo de Honorarios', ...TIPOS_LIBRES];
// Estados en los que el técnico puede cargar comprobantes y enviar su rendición.
const ESTADOS_EDITABLES = ['Rindiendo', 'Observado'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

// Dinero comparado a céntimos: la suma en coma flotante deja residuos (189.70000000000002).
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sumGastos = (gastos) => round2(gastos.reduce((a, g) => a + (parseFloat(g.Monto_Gasto) || 0), 0));

// Multer: archivos temporales en data/tmp, solo imagen o PDF, máximo 15 MB.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se aceptan imágenes o PDF.'));
  }
});

// Envuelve upload.single para responder los errores de multer como JSON (archivo muy grande, tipo inválido).
function uploadSingle(field) {
  const mw = upload.single(field);
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 15 MB.' : err.message;
    res.status(400).json({ error: msg });
  });
}

const app = express();
app.use(express.json());

await detectarIp();
openDb();
if (AUTO_SEED && isEmpty()) {
  console.log('Base vacía: cargando datos de ejemplo...');
  await resetDemo();
  console.log('Datos de ejemplo cargados.');
}

// Helper: Safely delete local temporary file
function cleanLocalFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting temp file:', filePath, err.message);
    }
  }
}

/**
 * Admin auth middleware. Protects the supervisor panel actions.
 * Uses a single shared password sent in the `x-admin-key` header.
 */
function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== SUPERVISOR_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  next();
}

// Archivos subidos (equivalente a los links de Drive). Se sirven sin ejecutar scripts:
// un SVG subido como "imagen" podría traer JavaScript.
app.use('/archivos', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(FILES_DIR));

/**
 * Datos públicos de la demo: marca, clave visible del login, cuentas de devolución y la
 * dirección de red con la que se arman los links del técnico.
 */
app.get('/api/info', (req, res) => {
  res.json({
    ...BRAND,
    demoPassword: SUPERVISOR_PASSWORD,
    cuentas: COMPANY_ACCOUNTS,
    baseUrl: baseUrl(),
  });
});

/** Código QR (SVG) de un texto, para abrir el link del técnico desde el celular. */
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 500) return res.status(400).json({ error: 'Texto inválido.' });
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el QR.' });
  }
});

/**
 * 1. POST /api/depositos
 * Created by Supervisor. Creates deposit registry, folder, and stores voucher.
 */
app.post('/api/depositos', requireAdmin, uploadSingle('voucher'), async (req, res) => {
  const { Tecnico, Ticket, Local, Monto, Dia, Telefono, Tecnico_Id, Supervisor, Supervisor_Id } = req.body;
  const voucherFile = req.file;

  const montoNum = parseFloat(Monto);
  if (!Tecnico || !Ticket || !Local || !Monto || !Dia) {
    if (voucherFile) cleanLocalFile(voucherFile.path);
    return res.status(400).json({ error: 'Faltan campos obligatorios en el formulario.' });
  }
  if (!(montoNum > 0)) {
    if (voucherFile) cleanLocalFile(voucherFile.path);
    return res.status(400).json({ error: 'El monto debe ser mayor a 0.' });
  }

  try {
    // Generate secure unique token for the technician link
    const token = crypto.randomBytes(16).toString('hex');

    const folderName = `TICKET-${Ticket}_${Tecnico}_${Local}`;
    const folder = await createFolder(folderName);

    if (voucherFile) {
      await uploadFile(
        voucherFile.path,
        `Voucher_Deposito_${Ticket}${path.extname(voucherFile.originalname)}`,
        voucherFile.mimetype,
        folder.id
      );
    }

    const saved = addDeposito({
      Tecnico,
      Ticket,
      Local,
      Monto: montoNum,
      Dia,
      Token: token,
      DriveFolderId: folder.id,
      Estado: 'Rindiendo', // Starts directly in Rindiendo since voucher is uploaded
      Telefono: Telefono || '',
      Observaciones: '',
      Tecnico_Id: Tecnico_Id || '',
      Supervisor: Supervisor || '',
      Supervisor_Id: Supervisor_Id || ''
    });
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({ error: 'Error interno del servidor al crear el depósito.' });
  } finally {
    if (voucherFile) cleanLocalFile(voucherFile.path);
  }
});

/**
 * 2. GET /api/depositos
 * Returns all deposits (admin panel).
 */
app.get('/api/depositos', requireAdmin, (req, res) => {
  try {
    res.json(getDepositos());
  } catch (error) {
    console.error('Error listing deposits:', error);
    res.status(500).json({ error: 'Error al obtener la lista de depósitos.' });
  }
});

function detalleCompleto(deposito) {
  return {
    deposito,
    gastos: getGastosByDeposito(deposito.Item),
    liquidacion: getLiquidacionByDeposito(deposito.Item) || null,
    ampliaciones: getAmpliacionesByDeposito(deposito.Item),
  };
}

/**
 * 3. GET /api/depositos/token/:token
 * Used by technician. Gets deposit info, its uploaded expenses, and liquidation (if any).
 */
app.get('/api/depositos/token/:token', (req, res) => {
  try {
    const deposito = getDepositoByToken(req.params.token);
    if (!deposito) {
      return res.status(404).json({ error: 'Depósito no encontrado o el enlace es inválido.' });
    }
    res.json(detalleCompleto(deposito));
  } catch (error) {
    console.error('Error getting deposit by token:', error);
    res.status(500).json({ error: 'Error al obtener datos del depósito.' });
  }
});

/** Archivos del depósito, para el técnico (por token). */
app.get('/api/depositos/token/:token/archivos', (req, res) => {
  const deposito = getDepositoByToken(req.params.token);
  if (!deposito) return res.status(404).json({ error: 'Depósito no encontrado o el enlace es inválido.' });
  res.json({ carpeta: deposito.DriveFolderId, archivos: listFiles(deposito.DriveFolderId) });
});

/**
 * 4. GET /api/depositos/:itemId
 * Returns a specific deposit, its expenses, and liquidation status (admin).
 */
app.get('/api/depositos/:itemId', requireAdmin, (req, res) => {
  try {
    const deposito = getDepositoById(req.params.itemId);
    if (!deposito) {
      return res.status(404).json({ error: 'Depósito no encontrado.' });
    }
    res.json(detalleCompleto(deposito));
  } catch (error) {
    console.error('Error getting deposit details:', error);
    res.status(500).json({ error: 'Error al obtener detalles del depósito.' });
  }
});

/** Archivos del depósito (reemplaza al botón "Drive" del original). */
app.get('/api/depositos/:itemId/archivos', requireAdmin, (req, res) => {
  const deposito = getDepositoById(req.params.itemId);
  if (!deposito) return res.status(404).json({ error: 'Depósito no encontrado.' });
  res.json({ carpeta: deposito.DriveFolderId, archivos: listFiles(deposito.DriveFolderId) });
});

/**
 * 5. POST /api/depositos/:itemId/comprobantes
 * Technicians upload one expense receipt.
 */
app.post('/api/depositos/:itemId/comprobantes', uploadSingle('comprobante'), async (req, res) => {
  const { itemId } = req.params;
  const { Tipo_Comprobante, Serie, Correlativo, RUC_Emisor, Monto_Gasto, Fecha_Comprobante, Descripcion } = req.body;
  const file = req.file;

  // fail(): responde con error y limpia el archivo temporal (evita huérfanos).
  const fail = (status, error) => {
    if (file) cleanLocalFile(file.path);
    return res.status(status).json({ error });
  };

  if (!file) {
    return res.status(400).json({ error: 'Se requiere el archivo del comprobante.' });
  }

  const deposito = getDepositoById(itemId);
  if (!deposito) {
    return fail(404, 'Depósito no encontrado.');
  }
  // El endpoint es público: sin esto se podrían agregar gastos a una rendición ya enviada o cerrada.
  if (!ESTADOS_EDITABLES.includes(deposito.Estado)) {
    return fail(409, `No se pueden agregar comprobantes: la rendición está en estado "${deposito.Estado}". Recarga la página.`);
  }

  // ----- Validaciones (antes de guardar el archivo) -----
  if (!TIPOS_VALIDOS.includes(Tipo_Comprobante)) {
    return fail(400, 'Tipo de comprobante inválido.');
  }
  const esLibre = TIPOS_LIBRES.includes(Tipo_Comprobante);

  const montoNum = parseFloat(Monto_Gasto);
  if (!montoNum || montoNum <= 0) {
    return fail(400, 'El monto del comprobante debe ser mayor a 0.');
  }
  if (!Fecha_Comprobante) {
    return fail(400, 'La fecha del comprobante es obligatoria.');
  }

  let nroComprobante = '';
  let descripcion = '';
  let rucNormalizado = '';

  if (esLibre) {
    if (!Descripcion || !Descripcion.trim()) {
      return fail(400, 'La descripción del gasto es obligatoria para este tipo de comprobante.');
    }
    descripcion = Descripcion.trim();
  } else {
    rucNormalizado = soloDigitos(RUC_Emisor);
    if (!validarRuc(rucNormalizado)) {
      return fail(400, 'El RUC del emisor no es válido. Verifica los 11 dígitos.');
    }
    const serie = (Serie || '').trim().toUpperCase();
    const correlativo = (Correlativo || '').trim();
    if (!serie) return fail(400, 'La serie del comprobante es obligatoria (ej. F001).');
    if (!/^\d+$/.test(correlativo)) return fail(400, 'El correlativo debe ser numérico (ej. 000412).');

    nroComprobante = `${serie}-${correlativo}`;

    // Control anti-duplicado global (RUC + Serie + Correlativo).
    const dup = buscarComprobanteDuplicado(rucNormalizado, serie, correlativo);
    if (dup) {
      return fail(409, `Este comprobante (RUC ${rucNormalizado} · ${nroComprobante}) ya fue rendido y no puede repetirse.`);
    }
  }

  try {
    const cleanDocNum = esLibre ? 'OTROS' : nroComprobante;
    const uploadedFile = await uploadFile(
      file.path,
      `Gasto_${Tipo_Comprobante}_${cleanDocNum}${path.extname(file.originalname)}`,
      file.mimetype,
      deposito.DriveFolderId
    );

    const savedGasto = addGasto({
      Item_Deposito: itemId,
      Tipo_Comprobante,
      Nro_Comprobante: nroComprobante,
      Monto_Gasto: montoNum,
      Fecha_Comprobante,
      DriveFileId: uploadedFile.webViewLink,
      RUC_Emisor: rucNormalizado,
      Descripcion: descripcion
    });
    res.status(201).json(savedGasto);
  } catch (error) {
    console.error('Error uploading expense:', error);
    res.status(500).json({ error: 'Error al guardar el comprobante.' });
  } finally {
    cleanLocalFile(file.path);
  }
});

/**
 * 6. POST /api/depositos/:itemId/liquidar
 * Technician submits the report and leaves the deposit in "Por Revisar".
 *
 * Endurecido respecto al original (docs/PENDIENTES.md §7):
 *  - Solo acepta rendiciones en Rindiendo/Observado: reenviar una ya Finalizada la reabría.
 *  - El balance lo calcula el servidor. Los montos que manda el navegador solo se usan para
 *    detectar que la página quedó desactualizada (p. ej. el supervisor amplió el depósito
 *    mientras el técnico la tenía abierta): en ese caso responde 409 y pide recargar, en vez de
 *    reclasificar la rendición a una devolución que nadie hizo.
 *  - Una devolución exige el voucher también en el servidor.
 */
app.post('/api/depositos/:itemId/liquidar', uploadSingle('voucherDevolucion'), async (req, res) => {
  const { itemId } = req.params;
  const { Monto_Depositado, Total_Gastado } = req.body;
  const voucherDevolucionFile = req.file;
  const fail = (status, error) => {
    if (voucherDevolucionFile) cleanLocalFile(voucherDevolucionFile.path);
    return res.status(status).json({ error });
  };

  try {
    const deposito = getDepositoById(itemId);
    if (!deposito) {
      return fail(404, 'Depósito no encontrado.');
    }
    if (!ESTADOS_EDITABLES.includes(deposito.Estado)) {
      return fail(409, `Esta rendición ya no se puede enviar (estado actual: ${deposito.Estado}). Recarga la página.`);
    }

    const montoServidor = round2(deposito.Monto);
    const totalServidor = sumGastos(getGastosByDeposito(itemId));
    const montoCliente = parseFloat(Monto_Depositado);
    const totalCliente = parseFloat(Total_Gastado);
    if (!Number.isFinite(montoCliente) || !Number.isFinite(totalCliente)
      || Math.abs(montoCliente - montoServidor) >= 0.005 || Math.abs(totalCliente - totalServidor) >= 0.005) {
      return fail(409, 'Los montos de tu rendición cambiaron (por ejemplo, el supervisor registró un depósito adicional). Recarga la página y revisa tu balance antes de enviar.');
    }

    const diferencia = round2(montoServidor - totalServidor);
    const estadoLiquidacion = diferencia > 0 ? 'Devolucion' : diferencia < 0 ? 'Reembolso' : 'Exacto';

    if (estadoLiquidacion === 'Devolucion' && !voucherDevolucionFile) {
      return fail(400, 'Debes adjuntar el voucher de la devolución del dinero restante.');
    }

    let devVoucherUrl = '';
    // Only archive the file when this really is a return.
    if (voucherDevolucionFile && estadoLiquidacion === 'Devolucion') {
      const uploadedFile = await uploadFile(
        voucherDevolucionFile.path,
        `Voucher_Devolucion_Saldo_${deposito.Ticket}${path.extname(voucherDevolucionFile.originalname)}`,
        voucherDevolucionFile.mimetype,
        deposito.DriveFolderId
      );
      devVoucherUrl = uploadedFile.webViewLink;
    }

    saveLiquidacion({
      Item_Deposito: itemId,
      Monto_Depositado: montoServidor,
      Total_Gastado: totalServidor,
      Diferencia: diferencia,
      Estado_Liquidacion: estadoLiquidacion,
      // For Devolucion, store the technician's return voucher. For Reembolso this stays
      // empty until the supervisor uploads the reimbursement voucher on approval.
      Comprobante_Liquidacion_Id: devVoucherUrl
    });

    // All submissions go to supervisor review; record técnico's VB date
    updateDeposito(itemId, { Estado: 'Por Revisar', Fecha_Rendido: hoy() });

    res.json({ message: 'Rendición enviada para revisión.', estado: 'Por Revisar', estadoLiquidacion, diferencia: diferencia.toFixed(2) });
  } catch (error) {
    console.error('Error finalizing liquidation:', error);
    res.status(500).json({ error: 'Error al finalizar la rendición.' });
  } finally {
    if (voucherDevolucionFile) cleanLocalFile(voucherDevolucionFile.path);
  }
});

/**
 * 7. POST /api/depositos/:itemId/aprobar
 * Supervisor approves a deposit under review. For Reembolso, requires the reimbursement voucher.
 */
app.post('/api/depositos/:itemId/aprobar', requireAdmin, uploadSingle('voucherReembolso'), async (req, res) => {
  const { itemId } = req.params;
  const voucherReembolsoFile = req.file;
  const fail = (status, error) => {
    if (voucherReembolsoFile) cleanLocalFile(voucherReembolsoFile.path);
    return res.status(status).json({ error });
  };

  try {
    const deposito = getDepositoById(itemId);
    if (!deposito) {
      return fail(404, 'Depósito no encontrado.');
    }
    if (deposito.Estado !== 'Por Revisar') {
      return fail(400, 'Solo se pueden aprobar rendiciones en estado "Por Revisar".');
    }

    const liquidacion = getLiquidacionByDeposito(itemId);
    let tipo = liquidacion ? liquidacion.Estado_Liquidacion : '';
    let reclasificada = false;

    // Rescue rows filed as Reembolso/Devolucion with a zero difference (floating-point residue
    // in old data). Normalize them to Exacto so the record, the PDF and the técnico's view agree.
    if (tipo === 'Reembolso' || tipo === 'Devolucion') {
      const raw = String(liquidacion.Diferencia ?? '').trim();
      const dif = /^-?\d+(\.\d+)?$/.test(raw) ? parseFloat(raw) : NaN;
      if (Number.isFinite(dif) && Math.abs(dif) < 0.005) {
        saveLiquidacion({
          ...liquidacion,
          Diferencia: 0,
          Estado_Liquidacion: 'Exacto',
          Comprobante_Liquidacion_Id: liquidacion.Comprobante_Liquidacion_Id || ''
        });
        tipo = 'Exacto';
        reclasificada = true;
      }
    }

    if (tipo === 'Reembolso') {
      if (!voucherReembolsoFile) {
        return res.status(400).json({ error: 'Debes adjuntar el voucher del reembolso al técnico para aprobar.' });
      }
      const uploadedFile = await uploadFile(
        voucherReembolsoFile.path,
        `Voucher_Reembolso_${deposito.Ticket}${path.extname(voucherReembolsoFile.originalname)}`,
        voucherReembolsoFile.mimetype,
        deposito.DriveFolderId
      );
      saveLiquidacion({ ...liquidacion, Comprobante_Liquidacion_Id: uploadedFile.webViewLink });
    }

    updateDeposito(itemId, { Estado: 'Finalizado', Fecha_Aprobado: hoy() });

    // Generar la Hoja Resumen PDF. Si falla, la aprobación NO debe romperse.
    try {
      await generarResumen(itemId);
    } catch (pdfErr) {
      console.error('Error generando la Hoja Resumen PDF (aprobación no afectada):', pdfErr.message);
    }

    res.json({
      message: reclasificada ? 'Rendición aprobada (balance corregido a Exacto).' : 'Rendición aprobada.',
      estado: 'Finalizado'
    });
  } catch (error) {
    console.error('Error approving deposit:', error);
    res.status(500).json({ error: 'Error al aprobar la rendición.' });
  } finally {
    if (voucherReembolsoFile) cleanLocalFile(voucherReembolsoFile.path);
  }
});

/**
 * 8. POST /api/depositos/:itemId/rechazar
 * Supervisor rejects a deposit under review; it reopens for the technician with a reason.
 */
app.post('/api/depositos/:itemId/rechazar', requireAdmin, (req, res) => {
  const { itemId } = req.params;
  const { motivo } = req.body;

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debes indicar el motivo del rechazo.' });
  }

  try {
    const deposito = getDepositoById(itemId);
    if (!deposito) {
      return res.status(404).json({ error: 'Depósito no encontrado.' });
    }
    // El original no lo validaba: se podía "observar" una rendición ya finalizada y reabrirla.
    if (deposito.Estado !== 'Por Revisar') {
      return res.status(400).json({ error: 'Solo se pueden observar rendiciones en estado "Por Revisar".' });
    }

    updateDeposito(itemId, { Estado: 'Observado', Observaciones: motivo.trim() });
    res.json({ message: 'Rendición observada.', estado: 'Observado' });
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    res.status(500).json({ error: 'Error al observar la rendición.' });
  }
});

/**
 * 9. POST /api/depositos/:itemId/anular
 * Supervisor annuls a deposit created by mistake (allowed while not finalized).
 */
app.post('/api/depositos/:itemId/anular', requireAdmin, (req, res) => {
  const { itemId } = req.params;
  const { motivo } = req.body;

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debes indicar el motivo de la anulación.' });
  }

  try {
    const deposito = getDepositoById(itemId);
    if (!deposito) {
      return res.status(404).json({ error: 'Depósito no encontrado.' });
    }
    const allowed = ['Rindiendo', 'Por Revisar', 'Observado'];
    if (!allowed.includes(deposito.Estado)) {
      return res.status(400).json({ error: `No se puede anular un depósito en estado "${deposito.Estado}".` });
    }

    updateDeposito(itemId, { Estado: 'Anulado', Observaciones: motivo.trim() });
    res.json({ message: 'Depósito anulado.', estado: 'Anulado' });
  } catch (error) {
    console.error('Error annulling deposit:', error);
    res.status(500).json({ error: 'Error al anular el depósito.' });
  }
});

/**
 * 10. POST /api/depositos/:itemId/ampliar
 * Supervisor registers an additional deposit (top-up) to an active rendición.
 * The deposit's Monto is a running total, so it is increased by the added amount.
 */
app.post('/api/depositos/:itemId/ampliar', requireAdmin, uploadSingle('voucher'), async (req, res) => {
  const { itemId } = req.params;
  const { monto, motivo, Fecha, Supervisor, Supervisor_Id } = req.body;
  const voucherFile = req.file;
  const fail = (status, error) => {
    if (voucherFile) cleanLocalFile(voucherFile.path);
    return res.status(status).json({ error });
  };

  const montoNum = parseFloat(monto);
  if (!montoNum || montoNum <= 0) {
    return fail(400, 'El monto adicional debe ser mayor a 0.');
  }
  if (!voucherFile) {
    return fail(400, 'Se requiere el voucher del depósito adicional.');
  }

  try {
    const deposito = getDepositoById(itemId);
    if (!deposito) {
      return fail(404, 'Depósito no encontrado.');
    }
    if (!ESTADOS_EDITABLES.includes(deposito.Estado)) {
      return fail(400, `Solo se puede ampliar mientras el técnico rinde (estado actual: ${deposito.Estado}).`);
    }

    // Correlativo del adicional para nombrar el archivo
    const nroAdicional = getAmpliacionesByDeposito(itemId).length + 1;

    const uploaded = await uploadFile(
      voucherFile.path,
      `Voucher_Deposito_Adicional_${nroAdicional}_${deposito.Ticket}${path.extname(voucherFile.originalname)}`,
      voucherFile.mimetype,
      deposito.DriveFolderId
    );

    addAmpliacion({
      Item_Deposito: itemId,
      Monto: montoNum,
      Fecha: Fecha || hoy(),
      Motivo: motivo || '',
      DriveFileId: uploaded.webViewLink,
      Supervisor: Supervisor || '',
      Supervisor_Id: Supervisor_Id || ''
    });

    const nuevoTotal = round2(parseFloat(deposito.Monto) + montoNum);
    updateDeposito(itemId, { Monto: nuevoTotal });

    res.status(201).json({ message: 'Depósito adicional registrado.', montoAdicional: montoNum.toFixed(2), nuevoTotal: nuevoTotal.toFixed(2) });
  } catch (error) {
    console.error('Error adding additional deposit:', error);
    res.status(500).json({ error: 'Error al registrar el depósito adicional.' });
  } finally {
    if (voucherFile) cleanLocalFile(voucherFile.path);
  }
});

/* ============================ Maestros ============================ */

const ESTADOS_MAESTRO = ['Activo', 'Inactivo'];

app.get('/api/tecnicos', requireAdmin, (req, res) => {
  try {
    res.json(getTecnicos());
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener técnicos.' });
  }
});

app.post('/api/tecnicos', requireAdmin, (req, res) => {
  const { Nombre, Celular, DNI } = req.body;
  if (!Nombre || !Nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del técnico es obligatorio.' });
  }
  try {
    res.status(201).json(addTecnico({ Nombre: Nombre.trim(), Celular: (Celular || '').trim(), DNI: (DNI || '').trim() }));
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el técnico.' });
  }
});

// Editar no cambia los depósitos ya registrados: guardan el nombre y celular del momento (snapshot).
app.put('/api/tecnicos/:id', requireAdmin, (req, res) => {
  const { Nombre, Celular, DNI, Estado } = req.body;
  if (!getTecnicoById(req.params.id)) return res.status(404).json({ error: 'Técnico no encontrado.' });
  if (!Nombre || !Nombre.trim()) return res.status(400).json({ error: 'El nombre del técnico es obligatorio.' });
  if (Estado && !ESTADOS_MAESTRO.includes(Estado)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    res.json(updateTecnico(req.params.id, { Nombre: Nombre.trim(), Celular: (Celular || '').trim(), DNI: (DNI || '').trim(), Estado: Estado || 'Activo' }));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el técnico.' });
  }
});

// Solo se elimina si no tiene historial; con depósitos, se desactiva.
app.delete('/api/tecnicos/:id', requireAdmin, (req, res) => {
  if (!getTecnicoById(req.params.id)) return res.status(404).json({ error: 'Técnico no encontrado.' });
  const n = countDepositosDeTecnico(req.params.id);
  if (n > 0) {
    return res.status(409).json({ error: `Tiene ${n} ${n === 1 ? 'depósito' : 'depósitos'} registrados: solo se puede desactivar.` });
  }
  deleteTecnico(req.params.id);
  res.json({ message: 'Técnico eliminado.' });
});

app.get('/api/supervisores', requireAdmin, (req, res) => {
  try {
    res.json(getSupervisores());
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener supervisores.' });
  }
});

app.post('/api/supervisores', requireAdmin, (req, res) => {
  const { Nombre, Celular } = req.body;
  if (!Nombre || !Nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del supervisor es obligatorio.' });
  }
  try {
    res.status(201).json(addSupervisor({ Nombre: Nombre.trim(), Celular: (Celular || '').trim() }));
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el supervisor.' });
  }
});

app.put('/api/supervisores/:id', requireAdmin, (req, res) => {
  const { Nombre, Celular, Estado } = req.body;
  if (!getSupervisorById(req.params.id)) return res.status(404).json({ error: 'Supervisor no encontrado.' });
  if (!Nombre || !Nombre.trim()) return res.status(400).json({ error: 'El nombre del supervisor es obligatorio.' });
  if (Estado && !ESTADOS_MAESTRO.includes(Estado)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    res.json(updateSupervisor(req.params.id, { Nombre: Nombre.trim(), Celular: (Celular || '').trim(), Estado: Estado || 'Activo' }));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el supervisor.' });
  }
});

app.delete('/api/supervisores/:id', requireAdmin, (req, res) => {
  if (!getSupervisorById(req.params.id)) return res.status(404).json({ error: 'Supervisor no encontrado.' });
  const n = countMovimientosDeSupervisor(req.params.id);
  if (n > 0) {
    return res.status(409).json({ error: `Tiene ${n} ${n === 1 ? 'depósito registrado' : 'depósitos registrados'}: solo se puede desactivar.` });
  }
  deleteSupervisor(req.params.id);
  res.json({ message: 'Supervisor eliminado.' });
});

/* ============================ Demo ============================ */

/** Borra todo y vuelve a cargar los datos de ejemplo. */
app.post('/api/demo/reset', requireAdmin, async (req, res) => {
  try {
    await resetDemo();
    res.json({ message: 'Datos de ejemplo restaurados.' });
  } catch (error) {
    console.error('Error restoring demo data:', error);
    res.status(500).json({ error: 'No se pudieron restaurar los datos de ejemplo.' });
  }
});

/**
 * Health check / info endpoint
 */
app.get('/api/status', (req, res) => {
  res.json({ status: 'online', storage: 'local' });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Serve the compiled frontend
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.warn('ADVERTENCIA: no se encontró frontend/dist - compílalo con "npm run build".');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  ${BRAND.producto} (demo) en marcha`);
  console.log(`  En esta PC:          http://localhost:${PORT}`);
  console.log(`  Desde el celular:    ${baseUrl()}   (mismo WiFi)`);
  console.log(`  Clave del supervisor: ${SUPERVISOR_PASSWORD}`);
  console.log('');
  console.log('  Para detener: cierra esta ventana o presiona Ctrl+C.');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  El puerto ${PORT} ya está en uso: probablemente la demo ya está abierta en otra ventana.`);
    console.error(`  Abre http://localhost:${PORT} en el navegador, o cierra la otra ventana y vuelve a intentar.\n`);
  } else {
    console.error('No se pudo iniciar el servidor:', err.message);
  }
  process.exit(1);
});
