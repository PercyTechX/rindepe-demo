import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Calendar,
  Clock,
  Ban,
  Wallet,
  Copy,
  Check,
  FolderOpen,
  Paperclip
} from 'lucide-react';
import { API_URL, useDemoInfo, type CuentaBancaria } from '../utils/api';
import { copiarTexto } from '../utils/clipboard';
import { validarRuc } from '../utils/ruc';

// Tipos de comprobante "libres": no exigen RUC ni número, piden Descripción y no se validan
// contra duplicados (mantener en sincronía con el backend).
const TIPOS_LIBRES = ['Otros', 'Declaración Jurada'];

interface Deposito {
  Item: string;
  Tecnico: string;
  Ticket: string;
  Local: string;
  Monto: string;
  Dia: string;
  Token: string;
  DriveFolderId: string;
  Estado: string;
  Telefono?: string;
  Observaciones?: string;
  Resumen_Pdf?: string;
}

interface Gasto {
  Item_Gasto: string;
  Item_Deposito: string;
  Tipo_Comprobante: string;
  Nro_Comprobante: string;
  Monto_Gasto: string;
  Fecha_Comprobante: string;
  DriveFileId: string;
  RUC_Emisor?: string;
  Descripcion?: string;
}

interface Liquidacion {
  Item_Deposito: string;
  Monto_Depositado: string;
  Total_Gastado: string;
  Diferencia: string;
  Estado_Liquidacion: string;
  Comprobante_Liquidacion_Id: string;
}

interface Ampliacion {
  Item: string;
  Item_Deposito: string;
  Monto: string;
  Fecha: string;
  Motivo: string;
  DriveFileId: string;
}

// Money must be compared at cent precision: summing amounts in floating point leaves residues
// like -2.8e-14, which read as "spent more" and file an exact balance as a reimbursement.
const redondearCentimos = (n: number) => Math.round(n * 100) / 100;

export default function RendicionForm() {
  const { token } = useParams<{ token: string }>();
  const [deposito, setDeposito] = useState<Deposito | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [liquidacion, setLiquidacion] = useState<Liquidacion | null>(null);
  const [ampliaciones, setAmpliaciones] = useState<Ampliacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingGasto, setSubmittingGasto] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gasto Form State
  const [tipoComprobante, setTipoComprobante] = useState('Boleta');
  const [rucEmisor, setRucEmisor] = useState('');
  const [serie, setSerie] = useState('');
  const [correlativo, setCorrelativo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoGasto, setMontoGasto] = useState('');
  const [fechaComprobante, setFechaComprobante] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);

  const esTipoLibre = TIPOS_LIBRES.includes(tipoComprobante);

  // Liquidation Form State
  const [voucherDevolucion, setVoucherDevolucion] = useState<File | null>(null);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const info = useDemoInfo();
  const cuentas: CuentaBancaria[] = info?.cuentas?.length ? info.cuentas : COMPANY_ACCOUNTS;

  // Archivos del depósito (reemplaza al botón "Ver carpeta en Drive" del original).
  const [archivos, setArchivos] = useState<{ name: string; url: string }[] | null>(null);
  const [archivosLoading, setArchivosLoading] = useState(false);

  const toggleArchivos = async () => {
    if (archivos) { setArchivos(null); return; }
    setArchivosLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/depositos/token/${token}/archivos`);
      if (!res.ok) throw new Error('No se pudieron listar los archivos.');
      setArchivos((await res.json()).archivos || []);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setArchivosLoading(false);
    }
  };

  const copyAccount = (value: string, key: string) => {
    copiarTexto(value);
    setCopiedAccount(key);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  useEffect(() => {
    fetchDepositoDetails();
  }, [token]);

  const fetchDepositoDetails = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/depositos/token/${token}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Código de enlace inválido o expirado.');
      }
      const data = await res.json();
      setDeposito(data.deposito);
      setGastos(data.gastos || []);
      setLiquidacion(data.liquidacion || null);
      setAmpliaciones(data.ampliaciones || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deposito) return;

    // Validaciones comunes
    if (!montoGasto || parseFloat(montoGasto) <= 0) {
      alert('Ingresa un monto mayor a 0.');
      return;
    }
    if (!fechaComprobante || !comprobanteFile) {
      alert('Ingresa la fecha y adjunta el archivo del comprobante.');
      return;
    }

    const formData = new FormData();
    formData.append('Tipo_Comprobante', tipoComprobante);
    formData.append('Monto_Gasto', montoGasto);
    formData.append('Fecha_Comprobante', fechaComprobante);
    formData.append('comprobante', comprobanteFile);

    if (esTipoLibre) {
      // Otros / Declaración Jurada: solo descripción, sin RUC ni número.
      if (!descripcion.trim()) {
        alert('Describe el gasto (obligatorio para este tipo de comprobante).');
        return;
      }
      formData.append('Descripcion', descripcion.trim());
    } else {
      // Boleta / Factura / Recibo de Honorarios: RUC + serie + correlativo, con anti-duplicado.
      if (!validarRuc(rucEmisor)) {
        alert('El RUC del emisor no es válido. Verifica los 11 dígitos.');
        return;
      }
      if (!serie.trim()) {
        alert('Ingresa la serie del comprobante (ej. F001).');
        return;
      }
      if (!/^\d+$/.test(correlativo.trim())) {
        alert('El correlativo debe ser numérico (ej. 000412).');
        return;
      }
      // Chequeo instantáneo contra los comprobantes ya cargados en este depósito.
      const rucDigits = rucEmisor.replace(/\D/g, '');
      const serieNorm = serie.trim().toUpperCase();
      const corrNum = String(parseInt(correlativo.trim(), 10));
      const yaExiste = gastos.some(g => {
        if (!g.RUC_Emisor) return false;
        const [gs, gc] = String(g.Nro_Comprobante || '').split('-');
        return g.RUC_Emisor.replace(/\D/g, '') === rucDigits
          && (gs || '').toUpperCase() === serieNorm
          && String(parseInt((gc || '0'), 10)) === corrNum;
      });
      if (yaExiste) {
        alert(`Este comprobante (RUC ${rucDigits} · ${serieNorm}-${correlativo.trim()}) ya lo agregaste en esta rendición.`);
        return;
      }
      formData.append('RUC_Emisor', rucEmisor.replace(/\D/g, ''));
      formData.append('Serie', serieNorm);
      formData.append('Correlativo', correlativo.trim());
    }

    setSubmittingGasto(true);
    try {
      const res = await fetch(`${API_URL}/api/depositos/${deposito.Item}/comprobantes`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 409 && !String(errData.error || '').includes('ya fue rendido')) {
          alert(errData.error);
          fetchDepositoDetails();
          return;
        }
        throw new Error(errData.error || 'Error al subir comprobante.');
      }
      setRucEmisor('');
      setSerie('');
      setCorrelativo('');
      setDescripcion('');
      setMontoGasto('');
      setFechaComprobante('');
      setComprobanteFile(null);
      // A new expense changes the balance, so any return voucher already picked is stale: it was
      // for a different amount, and its file input may not even be on screen any more.
      setVoucherDevolucion(null);
      const fileInput = document.getElementById('comprobante-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // Clear the DOM too, or the input keeps showing the old filename while state is null and
      // the submit button looks disabled for no visible reason.
      const devInput = document.getElementById('voucher-devolucion-file') as HTMLInputElement;
      if (devInput) devInput.value = '';

      alert('Comprobante agregado con éxito.');
      fetchDepositoDetails();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmittingGasto(false);
    }
  };

  const handleFinalizarRendicion = async () => {
    if (!deposito) return;
    const confirmMsg = '¿Estás seguro de enviar la rendición para revisión? Ya no podrás agregar más comprobantes hasta que el supervisor la valide.';
    if (!window.confirm(confirmMsg)) return;

    setFinalizing(true);
    const montoOriginal = parseFloat(deposito.Monto);
    const totalGasto = gastos.reduce((acc, g) => acc + (parseFloat(g.Monto_Gasto) || 0), 0);
    // Round to cents BEFORE comparing: 166.00 + 16.40 + 7.30 sums to 189.70000000000002 in
    // floating point, so an exact balance would land at -2.8e-14 and be filed as a reimbursement.
    const diferencia = redondearCentimos(montoOriginal - totalGasto);

    let estadoLiquidacion = 'Exacto';
    if (diferencia > 0) {
      estadoLiquidacion = 'Devolucion';
      if (!voucherDevolucion) {
        alert('Debes adjuntar el voucher de la devolución del dinero restante.');
        setFinalizing(false);
        return;
      }
    } else if (diferencia < 0) {
      estadoLiquidacion = 'Reembolso';
    }

    const formData = new FormData();
    formData.append('Monto_Depositado', montoOriginal.toString());
    formData.append('Total_Gastado', totalGasto.toString());
    formData.append('Diferencia', diferencia.toString());
    formData.append('Estado_Liquidacion', estadoLiquidacion);
    // Only send the return voucher when this really is a return. The file stays in state after
    // it's picked, so a later expense that flips the balance would otherwise file the técnico's
    // return voucher as the liquidation's voucher.
    if (estadoLiquidacion === 'Devolucion' && voucherDevolucion) {
      formData.append('voucherDevolucion', voucherDevolucion);
    }

    try {
      const res = await fetch(`${API_URL}/api/depositos/${deposito.Item}/liquidar`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 409) {
          // El servidor detectó que la página quedó desactualizada: recargar para ver el balance real.
          alert(errData.error);
          fetchDepositoDetails();
          return;
        }
        throw new Error(errData.error || 'Error al enviar la rendición.');
      }
      alert('¡Rendición enviada para revisión!');
      fetchDepositoDetails();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', marginBottom: '16px' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos del depósito...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center' }} className="glass-card">
        <AlertTriangle size={48} style={{ color: 'var(--accent-error)', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '22px', marginBottom: '10px' }}>Enlace Inválido</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Por favor, solicita a tu supervisor un nuevo link de rendición válido.</p>
      </div>
    );
  }

  if (!deposito) return null;

  const estado = deposito.Estado;
  const editable = estado === 'Rindiendo' || estado === 'Observado';

  const totalGasto = gastos.reduce((acc, g) => acc + (parseFloat(g.Monto_Gasto) || 0), 0);
  const montoOriginal = parseFloat(deposito.Monto);
  const diferencia = redondearCentimos(montoOriginal - totalGasto);
  const devueltoTotal = diferencia > 0;
  const reembolsarTotal = diferencia < 0;

  // ---- Closing card (shown when Por Revisar / Finalizado) ----
  const renderClosingCard = () => {
    if (estado !== 'Por Revisar' && estado !== 'Finalizado') return null;
    const tipo = liquidacion?.Estado_Liquidacion || 'Exacto';
    const dif = liquidacion ? Math.abs(parseFloat(liquidacion.Diferencia)) : Math.abs(diferencia);
    const enRevision = estado === 'Por Revisar';
    const voucher = liquidacion?.Comprobante_Liquidacion_Id;

    let icon = <CheckCircle size={44} style={{ color: 'var(--accent-success)' }} />;
    let accent = 'var(--accent-success)';
    let glow = 'var(--accent-success-glow)';
    let title = '';
    let body: React.ReactNode = null;

    if (enRevision) {
      icon = <Clock size={44} style={{ color: 'var(--accent-warning)' }} />;
      accent = 'var(--accent-warning)';
      glow = 'var(--accent-warning-glow)';
      title = 'Rendición en revisión';
      if (tipo === 'Reembolso') body = <>Enviada. La empresa te <strong>reembolsará S/ {dif.toFixed(2)}</strong> tras validar tu rendición.</>;
      else if (tipo === 'Devolucion') body = <>Enviada. Devolviste <strong>S/ {dif.toFixed(2)}</strong>. En espera de validación del supervisor.</>;
      else body = <>Enviada con balance exacto. En espera de validación del supervisor.</>;
    } else {
      // Finalizado
      if (tipo === 'Reembolso') {
        icon = <Wallet size={44} style={{ color: 'var(--accent-success)' }} />;
        title = `💰 Te reembolsaron S/ ${dif.toFixed(2)}`;
        body = <>Gastaste S/ {totalGasto.toFixed(2)} de los S/ {montoOriginal.toFixed(2)} recibidos. Estado: <strong>Reembolsado ✓</strong></>;
      } else if (tipo === 'Devolucion') {
        title = 'Rendición aprobada';
        body = <>Devolviste <strong>S/ {dif.toFixed(2)}</strong>. Rendición cerrada correctamente.</>;
      } else {
        title = 'Rendición aprobada';
        body = <>Balance exacto S/ 0.00. Rendición cerrada correctamente.</>;
      }
    }

    return (
      <div className="glass-card" style={{ marginBottom: '32px', border: `1px solid ${accent}`, background: glow, textAlign: 'center', padding: '30px' }}>
        <div style={{ marginBottom: '14px' }}>{icon}</div>
        <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{body}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {estado === 'Finalizado' && deposito.Resumen_Pdf && (
            <a href={deposito.Resumen_Pdf} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} /> Ver Hoja Resumen (PDF)
            </a>
          )}
          {voucher && (
            <a href={voucher} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {tipo === 'Reembolso' ? 'Ver voucher de reembolso' : 'Ver tu voucher de devolución'}
            </a>
          )}
          <button className="btn btn-secondary" onClick={toggleArchivos} disabled={archivosLoading}>
            <FolderOpen size={16} /> {archivosLoading ? 'Cargando…' : archivos ? 'Ocultar archivos' : 'Ver archivos'}
          </button>
        </div>
        {archivos && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
            {archivos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay archivos.</p>}
            {archivos.map(a => (
              <div key={a.name} className="file-row">
                <span className="file-row-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Paperclip size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />{a.name}
                </span>
                <a href={a.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '11px', flexShrink: 0 }}>Abrir</a>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }} className="animate-fade-in">
      {/* Header Info */}
      <header style={{ marginBottom: '28px', textAlign: 'center' }}>
        <span className={`badge badge-${estado.toLowerCase().replace(/\s+/g, '-')}`} style={{ marginBottom: '12px' }}>{estado}</span>
        <h1 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '4px' }}>Hola, {deposito.Tecnico}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {editable ? 'Por favor, ingresa los comprobantes correspondientes a este depósito.' : 'Aquí está el estado de tu rendición.'}
        </p>
      </header>

      {/* Anulado banner */}
      {estado === 'Anulado' && (
        <div className="glass-card" style={{ marginBottom: '32px', border: '1px solid var(--accent-error)', background: 'var(--accent-error-glow)', textAlign: 'center', padding: '30px' }}>
          <Ban size={44} style={{ color: 'var(--accent-error)', marginBottom: '14px' }} />
          <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>Depósito anulado</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Este depósito fue anulado por el supervisor.{deposito.Observaciones ? ` Motivo: ${deposito.Observaciones}` : ''}</p>
        </div>
      )}

      {/* Observado banner (reopened for correction) */}
      {estado === 'Observado' && (
        <div className="glass-card" style={{ marginBottom: '28px', border: '1px solid var(--accent-error)', background: 'var(--accent-error-glow)' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={24} style={{ color: 'var(--accent-error)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h3 style={{ fontSize: '17px', marginBottom: '4px', color: 'var(--accent-error)' }}>Tu rendición fue observada</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                <strong>Motivo:</strong> {deposito.Observaciones || 'Sin especificar'}. Corrige lo indicado y vuelve a finalizar tu rendición.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Closing card for Por Revisar / Finalizado */}
      {renderClosingCard()}

      {/* Details & balance (always visible) */}
      <div className="grid-two-cols" style={{ marginBottom: '30px', alignItems: 'stretch' }}>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Datos del Depósito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={rowTwo}><span style={mutedLabel}>TICKET TRABAJO</span><span style={{ fontWeight: 600 }}>{deposito.Ticket}</span></div>
              <div style={rowTwo}><span style={mutedLabel}>LOCAL DE TRABAJO</span><span>{deposito.Local}</span></div>
              <div style={rowTwo}><span style={mutedLabel}>FECHA RECIBIDO</span><span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' }}><Calendar size={14} style={{ color: 'var(--text-muted)' }} />{deposito.Dia}</span></div>
              <div style={rowTwo}><span style={mutedLabel}>MONTO ENTREGADO</span><span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '16px' }}>S/ {montoOriginal.toFixed(2)}</span></div>
            </div>

            {ampliaciones.length > 0 && (() => {
              const totalAmp = ampliaciones.reduce((a, x) => a + (parseFloat(x.Monto) || 0), 0);
              const inicial = montoOriginal - totalAmp;
              return (
                <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: 'var(--accent-primary-glow)', border: '1px solid rgba(29, 99, 237, 0.2)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>Desglose de depósitos</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Depósito inicial</span>
                    <span>S/ {inicial.toFixed(2)}</span>
                  </div>
                  {ampliaciones.map(amp => (
                    <div key={amp.Item} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Adicional{amp.Fecha ? ` (${amp.Fecha})` : ''}</span>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>+ S/ {parseFloat(amp.Monto).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{ marginTop: '24px', padding: '14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Total Gastos:</span><span style={{ fontWeight: 500 }}>S/ {totalGasto.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '3px solid var(--accent-primary)' }}>
          <div>
            <h3 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Balance de Rendición</h3>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Diferencia calculada</div>
              <div style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'var(--font-display)', color: diferencia >= 0 ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                S/ {Math.abs(diferencia).toFixed(2)}
              </div>
              <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                {diferencia > 0 ? (
                  <span style={{ color: 'var(--accent-success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><TrendingDown size={14} /> Te sobró dinero (debes devolver vuelto)</span>
                ) : diferencia < 0 ? (
                  <span style={{ color: 'var(--accent-error)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><TrendingUp size={14} /> Gastaste de más (reembolso a tu favor)</span>
                ) : (
                  <span>Balance exacto S/ 0.00</span>
                )}
              </div>
            </div>
          </div>

          {editable && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              {devueltoTotal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Nota: a dónde devolver el vuelto */}
                  <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--accent-warning-glow)', border: '1px solid rgba(217, 119, 6, 0.25)' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={15} style={{ color: 'var(--accent-warning)' }} /> Debes devolver el vuelto (S/ {Math.abs(diferencia).toFixed(2)})
                    </p>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      Si tienes vuelto, deposítalo a la siguiente cuenta y luego adjunta aquí el <strong>voucher de la devolución</strong>.
                    </p>
                  </div>

                  {/* Cuenta(s) de devolución */}
                  <div style={accountBox}>
                    <div style={accountHeader}>🏢 Cuenta para devolver el vuelto</div>
                    {cuentas.map(acc => (
                      <div key={acc.bank}>
                        <div style={accountRow}>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{acc.bank} · Cuenta</div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>{acc.number}</div>
                          </div>
                          <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => copyAccount(acc.number, `${acc.bank}-num`)}>
                            {copiedAccount === `${acc.bank}-num` ? (<><Check size={12} style={{ color: 'var(--accent-success)' }} />Copiado</>) : (<><Copy size={12} />Copiar</>)}
                          </button>
                        </div>
                        {acc.cci && (
                          <div style={accountRow}>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>CCI (interbancario)</div>
                              <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>{acc.cci}</div>
                            </div>
                            <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => copyAccount(acc.cci as string, `${acc.bank}-cci`)}>
                              {copiedAccount === `${acc.bank}-cci` ? (<><Check size={12} style={{ color: 'var(--accent-success)' }} />Copiado</>) : (<><Copy size={12} />Copiar</>)}
                            </button>
                          </div>
                        )}
                        {acc.titular && (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', paddingTop: '8px' }}>
                            Titular: <strong>{acc.titular}</strong>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <input id="voucher-devolucion-file" type="file" accept="image/*,application/pdf" className="glass-input" onChange={e => setVoucherDevolucion(e.target.files ? e.target.files[0] : null)} />
                  <button onClick={handleFinalizarRendicion} className="btn btn-success" style={{ width: '100%' }} disabled={finalizing || !voucherDevolucion}>
                    {finalizing ? 'Enviando...' : 'Enviar rendición (con vuelto)'}
                  </button>
                </div>
              )}
              {reembolsarTotal && (
                <button onClick={handleFinalizarRendicion} className="btn btn-primary" style={{ width: '100%' }} disabled={finalizing}>
                  {finalizing ? 'Enviando...' : 'Enviar rendición (solicitar reembolso)'}
                </button>
              )}
              {diferencia === 0 && (
                <button onClick={handleFinalizarRendicion} className="btn btn-primary" style={{ width: '100%' }} disabled={finalizing}>
                  {finalizing ? 'Enviando...' : 'Enviar rendición (exacta)'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editable && (
        <div className="grid-two-cols" style={{ alignItems: 'start' }}>
          {/* Add Expense Form */}
          <section className="glass-card">
            <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Upload size={18} style={{ color: 'var(--accent-primary)' }} />
              Agregar Comprobante de Gasto
            </h3>
            <form onSubmit={handleAddGasto} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={gastoLabel}>Tipo de Comprobante</label>
                <select className="glass-input" value={tipoComprobante} onChange={e => setTipoComprobante(e.target.value)}>
                  <option value="Boleta">Boleta</option>
                  <option value="Factura">Factura</option>
                  <option value="Recibo de Honorarios">Recibo de Honorarios</option>
                  <option value="Declaración Jurada">Declaración Jurada</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              {esTipoLibre ? (
                <div>
                  <label style={gastoLabel}>Descripción del gasto</label>
                  <textarea
                    className="glass-input"
                    placeholder="Describe brevemente el gasto (obligatorio)"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    rows={2}
                    style={{ resize: 'vertical' }}
                    required
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label style={gastoLabel}>RUC del emisor</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={11}
                      className="glass-input"
                      placeholder="Ej: 20123456789"
                      value={rucEmisor}
                      onChange={e => setRucEmisor(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div>
                    <label style={gastoLabel}>Número de Comprobante</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '12px' }}>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Serie (F001)"
                        value={serie}
                        onChange={e => setSerie(e.target.value.toUpperCase())}
                        style={{ textTransform: 'uppercase' }}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        className="glass-input"
                        placeholder="Correlativo (000412)"
                        value={correlativo}
                        onChange={e => setCorrelativo(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                </>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={gastoLabel}>Monto Gastado (S/)</label>
                  <input type="number" step="0.01" className="glass-input" placeholder="0.00" value={montoGasto} onChange={e => setMontoGasto(e.target.value)} required />
                </div>
                <div>
                  <label style={gastoLabel}>Fecha de Gasto</label>
                  <input type="date" className="glass-input" value={fechaComprobante} onChange={e => setFechaComprobante(e.target.value)} required />
                </div>
              </div>
              <div>
                <label style={gastoLabel}>Foto o PDF del Comprobante</label>
                <input id="comprobante-file" type="file" accept="image/*,application/pdf" className="glass-input" onChange={e => setComprobanteFile(e.target.files ? e.target.files[0] : null)} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }} disabled={submittingGasto}>
                {submittingGasto ? 'Subiendo...' : 'Agregar Comprobante'}
              </button>
            </form>
          </section>

          {/* List of expenses */}
          <section className="glass-card">
            <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
              Comprobantes Agregados ({gastos.length})
            </h3>
            {gastos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '14px', border: '1px dashed var(--border-color)', borderRadius: '10px' }}>
                Aún no has agregado ningún comprobante. Comienza rellenando el formulario de la izquierda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '430px', overflowY: 'auto' }}>
                {gastos.map((g, idx) => (
                  <div key={idx} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{g.Tipo_Comprobante}{(g.Nro_Comprobante || g.Descripcion) ? ' - ' : ''}<span style={{ color: 'var(--text-secondary)' }}>{g.Nro_Comprobante || g.Descripcion}</span></div>
                      {g.RUC_Emisor && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>RUC: {g.RUC_Emisor}</div>}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                        <Calendar size={12} /> {g.Fecha_Comprobante}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 600 }}>S/ {parseFloat(g.Monto_Gasto).toFixed(2)}</span>
                      <a href={g.DriveFileId} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '11px' }}>Ver Doc</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Read-only list of expenses when not editable (Por Revisar / Finalizado) */}
      {!editable && estado !== 'Anulado' && gastos.length > 0 && (
        <section className="glass-card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
            Comprobantes Presentados ({gastos.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {gastos.map((g, idx) => (
              <div key={idx} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>{g.Tipo_Comprobante}{(g.Nro_Comprobante || g.Descripcion) ? ' - ' : ''}<span style={{ color: 'var(--text-secondary)' }}>{g.Nro_Comprobante || g.Descripcion}</span></div>
                  {g.RUC_Emisor && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>RUC: {g.RUC_Emisor}</div>}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{g.Fecha_Comprobante}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontWeight: 600 }}>S/ {parseFloat(g.Monto_Gasto).toFixed(2)}</span>
                  <a href={g.DriveFileId} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '11px' }}>Ver Doc</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Cuentas para la devolución del vuelto. Las reales vienen del servidor (backend/config.js);
// este arreglo solo se usa si /api/info no responde.
const COMPANY_ACCOUNTS: CuentaBancaria[] = [
  { bank: 'Banco Demo', number: '000-0000000000', cci: '000-000-000000000000-00', titular: 'EMPRESA DEMO' },
];

const rowTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr' };
const mutedLabel: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '13px' };
const gastoLabel: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' };
const accountBox: React.CSSProperties = { padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' };
const accountHeader: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' };
const accountRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--border-color)' };
