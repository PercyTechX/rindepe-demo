import fs from 'fs';
import path from 'path';
import { TMP_DIR } from './config.js';
import {
  getDepositoById, getGastosByDeposito, getLiquidacionByDeposito, getAmpliacionesByDeposito, updateDeposito
} from './db.js';
import { uploadFile } from './storage.js';
import { generateResumenPdf } from './pdfService.js';

/** Genera la Hoja Resumen PDF de un depósito, la archiva en su carpeta y guarda el link. */
export async function generarResumen(itemId) {
  const deposito = getDepositoById(itemId);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const pdfPath = path.join(TMP_DIR, `resumen-${itemId}-${Date.now()}.pdf`);
  try {
    await generateResumenPdf({
      deposito,
      gastos: getGastosByDeposito(itemId),
      liquidacion: getLiquidacionByDeposito(itemId),
      ampliaciones: getAmpliacionesByDeposito(itemId),
    }, pdfPath);
    const uploadedPdf = await uploadFile(pdfPath, `Resumen_Rendicion_${deposito.Ticket}.pdf`, 'application/pdf', deposito.DriveFolderId);
    updateDeposito(itemId, { Resumen_Pdf: uploadedPdf.webViewLink });
  } finally {
    fs.rmSync(pdfPath, { force: true });
  }
}
