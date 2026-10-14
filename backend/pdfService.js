import PDFDocument from 'pdfkit';
import fs from 'fs';
import { BRAND } from './config.js';

const AZUL = '#1E63E9';
const MARINO = '#0D1B3E';

function money(n) {
  const v = parseFloat(n);
  return 'S/ ' + (isNaN(v) ? '0.00' : v.toFixed(2));
}

/**
 * Generates the "Hoja Resumen de Rendición" PDF and writes it to outPath.
 * Returns a Promise that resolves with outPath when the file is fully written.
 *
 * data = { deposito, gastos, liquidacion, ampliaciones }
 */
export function generateResumenPdf(data, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const { deposito, gastos = [], liquidacion = null, ampliaciones = [] } = data;

      const totalEntregado = parseFloat(deposito.Monto) || 0;
      const totalAmp = ampliaciones.reduce((a, x) => a + (parseFloat(x.Monto) || 0), 0);
      const inicial = totalEntregado - totalAmp;
      const totalGastado = gastos.reduce((a, g) => a + (parseFloat(g.Monto_Gasto) || 0), 0);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);
      stream.on('finish', () => resolve(outPath));
      stream.on('error', reject);

      const LEFT = 50;
      const RIGHT = 545;

      const section = (title) => {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL).text(title, LEFT);
        doc.moveTo(LEFT, doc.y + 2).lineTo(RIGHT, doc.y + 2).strokeColor('#cccccc').lineWidth(1).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(11).fillColor('#000000');
      };

      // ===== Encabezado =====
      // Logo RindePe dibujado con vectores (pdfkit no admite SVG): recibo con check + nombre.
      const top = doc.y;
      const cx = doc.page.width / 2;
      const mark = 34;
      const markX = cx - 70;
      doc.roundedRect(markX, top, mark, mark, 8).fill(AZUL);
      doc.roundedRect(markX + 9, top + 6, 16, 22, 2).fill('#ffffff');
      doc.moveTo(markX + 12.5, top + 17).lineTo(markX + 16, top + 21).lineTo(markX + 22, top + 12)
        .lineWidth(2.2).strokeColor(AZUL).stroke();
      doc.font('Helvetica-Bold').fontSize(22).fillColor(MARINO).text('Rinde', markX + mark + 8, top + 6, { continued: true })
        .fillColor(AZUL).text('Pe');
      doc.font('Helvetica').fontSize(9).fillColor('#666666')
        .text(BRAND.empresa, LEFT, top + mark + 8, { align: 'center', width: RIGHT - LEFT });
      doc.y = top + mark + 26;

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('Hoja Resumen de Rendición', { align: 'center' });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`Emitida: ${deposito.Fecha_Aprobado || ''}`, { align: 'center' });
      doc.fillColor('#000000');
      doc.moveDown(1);

      doc.fontSize(11);
      const infoLine = (label, value) => {
        doc.font('Helvetica-Bold').text(`${label}: `, LEFT, doc.y, { continued: true });
        doc.font('Helvetica').text(String(value == null || value === '' ? '—' : value));
      };
      infoLine('Ticket', deposito.Ticket);
      infoLine('Técnico', deposito.Tecnico);
      infoLine('Local', deposito.Local);
      infoLine('Supervisor', deposito.Supervisor);

      // ===== Sección Depósitos =====
      section('Depósitos');
      doc.text(`Depósito inicial: ${money(inicial)}   (${deposito.Dia || 's/f'})`);
      ampliaciones.forEach((a, i) => {
        doc.text(`Depósito adicional ${i + 1}: ${money(a.Monto)}   (${a.Fecha || 's/f'})${a.Motivo ? '  -  ' + a.Motivo : ''}`);
      });
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text(`Total entregado: ${money(totalEntregado)}`);

      // ===== Sección Rendición =====
      section('Rendición (comprobantes)');
      if (gastos.length === 0) {
        doc.text('Sin comprobantes presentados.');
      } else {
        gastos.forEach((g) => {
          const detalle = g.Nro_Comprobante || g.Descripcion || '';
          const docNum = `${g.Tipo_Comprobante || ''} ${detalle}`.trim();
          const ruc = g.RUC_Emisor ? `   -   RUC ${g.RUC_Emisor}` : '';
          doc.text(`${docNum}${ruc}   -   ${money(g.Monto_Gasto)}   -   ${g.Fecha_Comprobante || 's/f'}`);
        });
      }
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text(`Total gastado: ${money(totalGastado)}`);

      // ===== Sección Vuelto o Reembolso =====
      section('Vuelto o Reembolso');
      const tipo = liquidacion ? liquidacion.Estado_Liquidacion : '';
      const dif = liquidacion ? Math.abs(parseFloat(liquidacion.Diferencia) || 0) : Math.abs(totalEntregado - totalGastado);
      if (tipo === 'Reembolso') {
        doc.text(`Reembolso al técnico: ${money(dif)}`);
      } else if (tipo === 'Devolucion') {
        doc.text(`Vuelto devuelto por el técnico: ${money(dif)}`);
      } else {
        doc.text('Balance exacto: sin vuelto ni reembolso.');
      }

      // ===== Sección VB° =====
      section('Visto Bueno (VB°)');
      doc.text(`VB Técnico:     ${deposito.Tecnico || '—'}     (${deposito.Fecha_Rendido || '—'})`);
      doc.moveDown(0.2);
      doc.text(`VB Supervisor:  ${deposito.Supervisor || '—'}     (${deposito.Fecha_Aprobado || '—'})`);

      doc.moveDown(2);
      doc.font('Helvetica').fontSize(8).fillColor('#999999')
        .text(`${BRAND.producto} · Elaborado por ${BRAND.desarrollador}  ·  RUC ${BRAND.rucDesarrollador}`, LEFT, doc.y, { align: 'center', width: RIGHT - LEFT })
        .text(`Soporte: ${BRAND.soporte} (WhatsApp)`, { align: 'center', width: RIGHT - LEFT })
        .text('Documento de demostración: los datos son ficticios.', { align: 'center', width: RIGHT - LEFT });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
