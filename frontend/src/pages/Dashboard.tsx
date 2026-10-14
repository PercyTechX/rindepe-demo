import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Copy,
  Check,
  FolderOpen,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  Calendar,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Ban,
  UserPlus,
  Wallet,
  Filter,
  X,
  QrCode,
  Users,
  Pencil,
  Trash2,
  ExternalLink,
  Paperclip
} from 'lucide-react';
import { API_URL, adminHeaders, qrUrl } from '../utils/api';
import { copiarTexto } from '../utils/clipboard';
import mascotaRindepe from '../assets/mascota-rindepe.svg';

interface Deposito {
  Item: string;
  Tecnico: string;
  Ticket: string;
  Local: string;
  Monto: string;
  Dia: string;
  Token: string;
  LinkRendicion: string;
  DriveFolderId: string;
  Estado: string;
  Telefono?: string;
  Observaciones?: string;
  Tecnico_Id?: string;
  Supervisor?: string;
  Supervisor_Id?: string;
  Fecha_Rendido?: string;
  Fecha_Aprobado?: string;
  Resumen_Pdf?: string;
}

interface Tecnico {
  Item: string;
  Nombre: string;
  Celular: string;
  DNI: string;
  Estado: string;
}

interface Supervisor {
  Item: string;
  Nombre: string;
  Celular: string;
  Estado: string;
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
  Supervisor: string;
  Supervisor_Id: string;
}

interface ArchivoDeposito {
  name: string;
  url: string;
  size: number;
  modified: string;
}

interface MaestroEnEdicion {
  kind: 'tecnico' | 'supervisor';
  Item: string;
  Nombre: string;
  Celular: string;
  DNI: string;
  Estado: string;
}

const TABS: { key: string; label: string; estados: string[] | null }[] = [
  { key: 'Pendientes', label: 'Pendientes', estados: ['Rindiendo', 'Por Revisar', 'Observado'] },
  { key: 'PorRevisar', label: 'Por revisar', estados: ['Por Revisar'] },
  { key: 'Finalizados', label: 'Finalizados', estados: ['Finalizado'] },
  { key: 'Anulados', label: 'Anulados', estados: ['Anulado'] },
  { key: 'Todos', label: 'Todos', estados: null },
];

export default function Dashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Registration form states
  const [tecnicoId, setTecnicoId] = useState('');
  const [ticket, setTicket] = useState('');
  const [localName, setLocalName] = useState('');
  const [monto, setMonto] = useState('');
  const [dia, setDia] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);

  // Filters
  const [filterTecnico, setFilterTecnico] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('Pendientes');

  // Details modal
  const [selectedDeposito, setSelectedDeposito] = useState<Deposito | null>(null);
  const [selectedGastos, setSelectedGastos] = useState<any[]>([]);
  const [selectedLiquidacion, setSelectedLiquidacion] = useState<Liquidacion | null>(null);
  const [selectedAmpliaciones, setSelectedAmpliaciones] = useState<Ampliacion[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Ampliar (additional deposit) modal
  const [ampliarDep, setAmpliarDep] = useState<Deposito | null>(null);
  const [ampMonto, setAmpMonto] = useState('');
  const [ampMotivo, setAmpMotivo] = useState('');
  const [ampFecha, setAmpFecha] = useState('');
  const [ampSupervisorId, setAmpSupervisorId] = useState('');
  const [ampFile, setAmpFile] = useState<File | null>(null);
  const [ampLoading, setAmpLoading] = useState(false);

  // Action modal (aprobar / rechazar / anular)
  const [actionModal, setActionModal] = useState<{ type: 'aprobar' | 'rechazar' | 'anular'; dep: Deposito } | null>(null);
  const [actionMotivo, setActionMotivo] = useState('');
  const [actionFile, setActionFile] = useState<File | null>(null);
  const [actionLiquidacion, setActionLiquidacion] = useState<Liquidacion | null>(null);
  const [actionLiqLoading, setActionLiqLoading] = useState(false);
  const [actionLiqError, setActionLiqError] = useState(false);
  const liqReqRef = useRef(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Quick-add master data modal
  const [quickAdd, setQuickAdd] = useState<'tecnico' | 'supervisor' | null>(null);
  const [qaNombre, setQaNombre] = useState('');
  const [qaCelular, setQaCelular] = useState('');
  const [qaDni, setQaDni] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  // WhatsApp simulado: en la demo no se abre WhatsApp, se muestra el mensaje que se enviaría.
  const [waPrompt, setWaPrompt] = useState<{ title: string; phone: string; message: string } | null>(null);
  const [waCopiado, setWaCopiado] = useState(false);

  // Link del técnico con QR (para abrirlo desde un celular en el mismo WiFi).
  const [linkDep, setLinkDep] = useState<Deposito | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Archivos del depósito (reemplaza al botón "Drive" del sistema original).
  const [archivosDep, setArchivosDep] = useState<Deposito | null>(null);
  const [archivos, setArchivos] = useState<ArchivoDeposito[]>([]);
  const [archivosLoading, setArchivosLoading] = useState(false);

  // Gestión de técnicos y supervisores (editar / desactivar / eliminar).
  const [maestrosOpen, setMaestrosOpen] = useState(false);
  const [maestrosTab, setMaestrosTab] = useState<'tecnico' | 'supervisor'>('tecnico');
  const [editMaestro, setEditMaestro] = useState<MaestroEnEdicion | null>(null);
  const [maestroSaving, setMaestroSaving] = useState(false);

  // Aviso de bienvenida con la mascota. La visibilidad es derivada, no un setState en un efecto:
  // así no reaparece en cada refresco de datos ni hace falta un ref para recordar que ya se mostró.
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  // Depende del booleano, no de `depositos`: el array cambia de identidad en cada refresco y
  // reiniciaría la cuenta de 5 s cada vez que se aprueba o anula algo.
  const hayPorRevisar = depositos.some(d => d.Estado === 'Por Revisar');
  useEffect(() => {
    if (loading || error || avisoCerrado || !hayPorRevisar) return;
    const t = setTimeout(() => setAvisoCerrado(true), 5000);
    return () => clearTimeout(t);
  }, [loading, error, hayPorRevisar, avisoCerrado]);

  // Cada mensaje simulado empieza sin la marca de "copiado".
  useEffect(() => { setWaCopiado(false); }, [waPrompt]);

  // Freeze the page behind any open modal so the wheel/touch scroll doesn't move the list.
  const anyModalOpen = !!(selectedDeposito || actionModal || ampliarDep || quickAdd || waPrompt || linkDep || archivosDep || maestrosOpen);
  useEffect(() => {
    if (!anyModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [anyModalOpen]);

  useEffect(() => {
    fetchAll();
  }, []);

  // Detects an expired/invalid session and bounces to login.
  const authFetch = async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, { ...opts, headers: { ...adminHeaders(), ...(opts.headers || {}) } });
    if (res.status === 401) {
      onUnauthorized();
      throw new Error('Sesión expirada. Vuelve a ingresar.');
    }
    return res;
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [depRes, tecRes, supRes] = await Promise.all([
        authFetch(`${API_URL}/api/depositos`),
        authFetch(`${API_URL}/api/tecnicos`),
        authFetch(`${API_URL}/api/supervisores`),
      ]);
      if (!depRes.ok) throw new Error('Error al conectar con la base de datos');
      setDepositos(await depRes.json());
      if (tecRes.ok) setTecnicos(await tecRes.json());
      if (supRes.ok) setSupervisores(await supRes.json());
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('No se pudo conectar al servidor. Asegúrate de que el backend esté corriendo y configurado.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepositos = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/depositos`);
      if (!res.ok) throw new Error('Error al conectar');
      setDepositos(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const selectedTecnico = tecnicos.find(t => t.Item === tecnicoId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tecnicoId || !ticket || !localName || !monto || !dia || !supervisorId || !voucher) {
      alert('Completa todos los campos (técnico, supervisor, ticket, local, monto, fecha y voucher).');
      return;
    }

    const tec = tecnicos.find(t => t.Item === tecnicoId);
    const sup = supervisores.find(s => s.Item === supervisorId);
    if (!tec || !sup) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.append('Tecnico', tec.Nombre);
    formData.append('Tecnico_Id', tec.Item);
    formData.append('Telefono', tec.Celular || '');
    formData.append('Supervisor', sup.Nombre);
    formData.append('Supervisor_Id', sup.Item);
    formData.append('Ticket', ticket);
    formData.append('Local', localName);
    formData.append('Monto', monto);
    formData.append('Dia', dia);
    formData.append('voucher', voucher);

    try {
      const res = await authFetch(`${API_URL}/api/depositos`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al guardar depósito');
      }
      // Clear form
      setTecnicoId('');
      setTicket('');
      setLocalName('');
      setMonto('');
      setDia('');
      setSupervisorId('');
      setVoucher(null);
      const fileInput = document.getElementById('voucher-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      alert('¡Depósito registrado con éxito!');
      fetchDepositos();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = (link: string, token: string) => {
    copiarTexto(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openLink = (dep: Deposito) => {
    setLinkDep(dep);
    setLinkCopiado(false);
  };

  const openArchivos = async (dep: Deposito) => {
    setArchivosDep(dep);
    setArchivos([]);
    setArchivosLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/depositos/${dep.Item}/archivos`);
      if (!res.ok) throw new Error('No se pudieron listar los archivos.');
      const data = await res.json();
      setArchivos(data.archivos || []);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setArchivosLoading(false);
    }
  };

  // ---- Maestros: editar / desactivar / eliminar ----
  const recargarMaestros = async () => {
    const [tRes, sRes] = await Promise.all([authFetch(`${API_URL}/api/tecnicos`), authFetch(`${API_URL}/api/supervisores`)]);
    if (tRes.ok) setTecnicos(await tRes.json());
    if (sRes.ok) setSupervisores(await sRes.json());
  };

  const guardarMaestro = async (m: MaestroEnEdicion) => {
    if (!m.Nombre.trim()) { alert('El nombre es obligatorio.'); return; }
    setMaestroSaving(true);
    try {
      const url = m.kind === 'tecnico' ? '/api/tecnicos' : '/api/supervisores';
      const body: Record<string, string> = { Nombre: m.Nombre.trim(), Celular: m.Celular.trim(), Estado: m.Estado };
      if (m.kind === 'tecnico') body.DNI = m.DNI.trim();
      const res = await authFetch(`${API_URL}${url}/${m.Item}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar');
      // Un inactivo no puede quedar elegido en el formulario de registro.
      if (m.Estado === 'Inactivo' && m.kind === 'tecnico' && tecnicoId === m.Item) setTecnicoId('');
      if (m.Estado === 'Inactivo' && m.kind === 'supervisor' && supervisorId === m.Item) setSupervisorId('');
      await recargarMaestros();
      setEditMaestro(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setMaestroSaving(false);
    }
  };

  const toggleEstadoMaestro = (kind: 'tecnico' | 'supervisor', m: Tecnico | Supervisor) =>
    guardarMaestro({
      kind, Item: m.Item, Nombre: m.Nombre, Celular: m.Celular || '', DNI: (m as Tecnico).DNI || '',
      Estado: m.Estado === 'Inactivo' ? 'Activo' : 'Inactivo',
    });

  const eliminarMaestro = async (kind: 'tecnico' | 'supervisor', m: Tecnico | Supervisor) => {
    if (!window.confirm(`¿Eliminar a ${m.Nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      const url = kind === 'tecnico' ? '/api/tecnicos' : '/api/supervisores';
      const res = await authFetch(`${API_URL}${url}/${m.Item}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'No se pudo eliminar');
      await recargarMaestros();
      if (kind === 'tecnico' && tecnicoId === m.Item) setTecnicoId('');
      if (kind === 'supervisor' && supervisorId === m.Item) setSupervisorId('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewDetails = async (deposito: Deposito) => {
    setSelectedDeposito(deposito);
    setSelectedGastos([]);
    setSelectedLiquidacion(null);
    setSelectedAmpliaciones([]);
    setLoadingDetails(true);
    try {
      const res = await authFetch(`${API_URL}/api/depositos/${deposito.Item}`);
      if (!res.ok) throw new Error('Error al obtener los detalles');
      const data = await res.json();
      setSelectedGastos(data.gastos || []);
      setSelectedLiquidacion(data.liquidacion || null);
      setSelectedAmpliaciones(data.ampliaciones || []);
    } catch (err: any) {
      alert(`No se pudieron obtener los detalles: ${err.message}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  // ---- WhatsApp helpers ----
  const sendLinkWhatsapp = (dep: Deposito) => {
    if (!dep.Telefono) {
      alert('Este técnico no tiene un celular registrado.');
      return;
    }
    const msg =
`Hola ${dep.Tecnico}

Te comparto el enlace para rendir tu depósito

Ticket ${dep.Ticket}
Local ${dep.Local}
Monto S/ ${parseFloat(dep.Monto).toFixed(2)}

Ingresa y sube tus comprobantes aquí
${dep.LinkRendicion}`;
    setWaPrompt({ title: 'Enviar link de rendición', phone: dep.Telefono, message: msg });
  };

  // ---- Validation actions ----
  const openAction = async (type: 'aprobar' | 'rechazar' | 'anular', dep: Deposito) => {
    setActionModal({ type, dep });
    setActionMotivo('');
    setActionFile(null);
    setActionLiquidacion(null);
    setActionLiqError(false);
    if (type === 'aprobar') {
      // Load liquidation to know whether a reimbursement voucher is required. Until it lands we
      // can't tell, so the Aprobar button stays disabled rather than defaulting to "no voucher".
      const reqId = ++liqReqRef.current;
      setActionLiqLoading(true);
      try {
        const res = await authFetch(`${API_URL}/api/depositos/${dep.Item}`);
        if (!res.ok) throw new Error('No se pudo cargar la liquidación.');
        const data = await res.json();
        // Discard a response that arrived after the supervisor moved on to another deposit.
        if (reqId !== liqReqRef.current) return;
        setActionLiquidacion(data.liquidacion || null);
      } catch {
        if (reqId === liqReqRef.current) setActionLiqError(true);
      } finally {
        if (reqId === liqReqRef.current) setActionLiqLoading(false);
      }
    }
  };

  // A liquidation filed as Reembolso/Devolucion but worth 0.00 is a misclassified exact balance
  // (an old floating-point residue). The server reclassifies it on approval, so the client must
  // not demand a voucher for it — otherwise it blocks the request before the server can help.
  // Parsed as strictly as the server does, so both agree on what counts as zero.
  const rawDif = actionLiquidacion ? String(actionLiquidacion.Diferencia ?? '').trim() : '';
  const difLiq = /^-?\d+(\.\d+)?$/.test(rawDif) ? parseFloat(rawDif) : NaN;
  const liqEsCero = Number.isFinite(difLiq) && Math.abs(difLiq) < 0.005;
  const isReembolso = actionLiquidacion?.Estado_Liquidacion === 'Reembolso' && !liqEsCero;
  const isDevolucionAction = actionLiquidacion?.Estado_Liquidacion === 'Devolucion' && !liqEsCero;

  const submitAction = async () => {
    if (!actionModal) return;
    const { type, dep } = actionModal;

    if ((type === 'rechazar' || type === 'anular') && !actionMotivo.trim()) {
      alert('Indica el motivo.');
      return;
    }
    if (type === 'aprobar' && isReembolso && !actionFile) {
      alert('Debes adjuntar el voucher del reembolso al técnico.');
      return;
    }

    setActionLoading(true);
    try {
      let res: Response;
      if (type === 'aprobar') {
        const fd = new FormData();
        if (actionFile) fd.append('voucherReembolso', actionFile);
        res = await authFetch(`${API_URL}/api/depositos/${dep.Item}/aprobar`, { method: 'POST', body: fd });
      } else {
        res = await authFetch(`${API_URL}/api/depositos/${dep.Item}/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: actionMotivo.trim() }),
        });
      }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error en la operación');
      }

      // Post-action WhatsApp prompt
      if (type === 'rechazar' && dep.Telefono) {
        setWaPrompt({
          title: 'Rendición observada',
          phone: dep.Telefono,
          message:
`Hola ${dep.Tecnico}

Tu rendición del ticket ${dep.Ticket} fue OBSERVADA

Motivo ${actionMotivo.trim()}

Por favor corrígela e ingresa nuevamente
${dep.LinkRendicion}`,
        });
      } else if (type === 'aprobar' && isReembolso && dep.Telefono) {
        const monto = actionLiquidacion ? Math.abs(parseFloat(actionLiquidacion.Diferencia)).toFixed(2) : '';
        setWaPrompt({
          title: 'Reembolso realizado',
          phone: dep.Telefono,
          message:
`Hola ${dep.Tecnico}

Se te reembolsó S/ ${monto} del ticket ${dep.Ticket}

Puedes ver el comprobante e ingresar aquí
${dep.LinkRendicion}`,
        });
      }

      setActionModal(null);
      fetchDepositos();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ---- Ampliar (depósito adicional) ----
  const openAmpliar = (dep: Deposito) => {
    setAmpliarDep(dep);
    setAmpMonto('');
    setAmpMotivo('');
    setAmpFecha(new Date().toISOString().slice(0, 10));
    setAmpSupervisorId(dep.Supervisor_Id || '');
    setAmpFile(null);
  };

  const submitAmpliar = async () => {
    if (!ampliarDep) return;
    const montoNum = parseFloat(ampMonto);
    if (!montoNum || montoNum <= 0) { alert('Ingresa un monto adicional válido.'); return; }
    if (!ampFile) { alert('Adjunta el voucher del depósito adicional.'); return; }
    if (!ampSupervisorId) { alert('Selecciona el supervisor.'); return; }

    const sup = supervisores.find(s => s.Item === ampSupervisorId);
    setAmpLoading(true);
    const fd = new FormData();
    fd.append('monto', String(montoNum));
    fd.append('motivo', ampMotivo);
    fd.append('Fecha', ampFecha);
    fd.append('Supervisor', sup ? sup.Nombre : '');
    fd.append('Supervisor_Id', ampSupervisorId);
    fd.append('voucher', ampFile);

    try {
      const res = await authFetch(`${API_URL}/api/depositos/${ampliarDep.Item}/ampliar`, { method: 'POST', body: fd });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al ampliar el depósito');
      }
      const data = await res.json();
      const dep = ampliarDep;
      if (dep.Telefono) {
        setWaPrompt({
          title: 'Depósito adicional registrado',
          phone: dep.Telefono,
          message:
`Hola ${dep.Tecnico}

Se te depositó S/ ${data.montoAdicional} adicionales para el ticket ${dep.Ticket}
Nuevo total entregado S/ ${data.nuevoTotal}${ampMotivo ? `\nMotivo ${ampMotivo}` : ''}

Revisa tu rendición aquí
${dep.LinkRendicion}`,
        });
      }
      setAmpliarDep(null);
      fetchDepositos();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAmpLoading(false);
    }
  };

  // ---- Quick add master data ----
  const openQuickAdd = (kind: 'tecnico' | 'supervisor') => {
    setQuickAdd(kind);
    setQaNombre('');
    setQaCelular('');
    setQaDni('');
  };

  const submitQuickAdd = async () => {
    if (!quickAdd || !qaNombre.trim()) {
      alert('El nombre es obligatorio.');
      return;
    }
    setQaLoading(true);
    try {
      const url = quickAdd === 'tecnico' ? '/api/tecnicos' : '/api/supervisores';
      const body: any = { Nombre: qaNombre.trim(), Celular: qaCelular.trim() };
      if (quickAdd === 'tecnico') body.DNI = qaDni.trim();
      const res = await authFetch(`${API_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al crear');
      }
      const saved = await res.json();
      if (quickAdd === 'tecnico') {
        const tRes = await authFetch(`${API_URL}/api/tecnicos`);
        if (tRes.ok) setTecnicos(await tRes.json());
        setTecnicoId(saved.Item);
      } else {
        const sRes = await authFetch(`${API_URL}/api/supervisores`);
        if (sRes.ok) setSupervisores(await sRes.json());
        setSupervisorId(saved.Item);
      }
      setQuickAdd(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setQaLoading(false);
    }
  };

  // ---- Filtering ----
  // Buscador y técnico se aplican también a los KPIs; la pestaña solo recorta la lista.
  const q = searchText.trim().toLowerCase();
  const hayFiltro = !!filterTecnico || !!q;
  const kpiDepositos = depositos.filter(d => {
    const matchesTecnico = !filterTecnico || d.Tecnico === filterTecnico;
    const matchesSearch = !q ||
      d.Tecnico.toLowerCase().includes(q) ||
      (d.Ticket || '').toLowerCase().includes(q) ||
      (d.Local || '').toLowerCase().includes(q) ||
      (d.Supervisor || '').toLowerCase().includes(q);
    return matchesTecnico && matchesSearch;
  });

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const filteredDepositos = kpiDepositos.filter(d =>
    currentTab.estados === null || currentTab.estados.includes(d.Estado)
  );

  // ---- KPIs (siguen al buscador y al filtro de técnico) ----
  const esPendiente = (estado: string) => !['Finalizado', 'Anulado'].includes(estado);
  const sumarMontos = (lista: Deposito[]) => lista.reduce((acc, d) => acc + (parseFloat(d.Monto) || 0), 0);

  const totalDepositado = sumarMontos(kpiDepositos);
  const totalRendido = sumarMontos(kpiDepositos.filter(d => d.Estado === 'Finalizado'));
  const totalPendienteMonto = sumarMontos(kpiDepositos.filter(d => esPendiente(d.Estado)));
  const totalPendientesCount = kpiDepositos.filter(d => esPendiente(d.Estado)).length;
  // Global a propósito: es el trabajo por hacer, no debe encogerse al filtrar.
  const porRevisarCount = depositos.filter(d => d.Estado === 'Por Revisar').length;

  const montoAnulado = sumarMontos(kpiDepositos.filter(d => d.Estado === 'Anulado'));

  // Se oculta con un modal abierto: el overlay es semitransparente, así que si no, la mascota
  // se vería oscurecida en la esquina y sin responder al clic.
  const mostrarAviso = !loading && !error && !anyModalOpen && porRevisarCount > 0 && !avisoCerrado;

  const badgeClass = (estado: string) => `badge badge-${estado.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }} className="animate-fade-in">
      {/* Header */}
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ fontSize: '32px', color: 'var(--text-primary)', marginBottom: '4px' }}>Rendición de Cuentas</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Control de Depósitos, Caja Chica y Comprobantes de Técnicos.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => { setMaestrosOpen(true); setEditMaestro(null); }}>
            <Users size={16} /> Técnicos y supervisores
          </button>
          <button className="btn btn-secondary" onClick={fetchAll}>Actualizar Datos</button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '16px', background: 'var(--accent-error-glow)', border: '1px solid var(--accent-error)', borderRadius: '10px', marginBottom: '24px', color: 'var(--accent-error)' }}>
          {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid-stats">
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--accent-primary-glow)', color: 'var(--accent-primary)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', fontWeight: 600 }}>Total Depositado</div>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '4px' }}>
              S/ {totalDepositado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {/* Sin esto, Depositado − Finalizado − Pendiente no cuadra y el hueco no se explica. */}
            {montoAnulado > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                incluye S/ {montoAnulado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} anulados
              </div>
            )}
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--accent-success-glow)', color: 'var(--accent-success)' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', fontWeight: 600 }}>Total Finalizado</div>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '4px' }}>
              S/ {totalRendido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--accent-warning-glow)', color: 'var(--accent-warning)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', fontWeight: 600 }}>Total Pendiente</div>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '4px' }}>
              S/ {totalPendienteMonto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--accent-warning-glow)', color: 'var(--accent-warning)' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', fontWeight: 600 }}>Cuentas en Proceso</div>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '4px' }}>
              {totalPendientesCount} <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)' }}>pendientes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Las tarjetas siguen al buscador y al filtro de técnico: avisar para que nadie las lea
          como totales globales. */}
      {hayFiltro && (
        <div style={{ marginTop: '-14px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Filter size={14} />
          <span>
            Totales filtrados: <strong>{kpiDepositos.length}</strong> de {depositos.length} depósitos
            {filterTecnico && <> · técnico <strong>{filterTecnico}</strong></>}
            {q && <> · búsqueda “<strong>{searchText.trim()}</strong>”</>}
          </span>
        </div>
      )}

      {/* Registration Form (horizontal, full width) */}
      <section className="glass-card" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Plus size={20} style={{ color: 'var(--accent-primary)' }} />
          Registrar Nuevo Depósito
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'start' }}>
            <div>
              <label style={labelStyle}>Técnico Beneficiario</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="glass-input" value={tecnicoId} onChange={e => setTecnicoId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {tecnicos.filter(t => t.Estado !== 'Inactivo').map(t => (
                    <option key={t.Item} value={t.Item}>{t.Nombre}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" style={{ padding: '0 12px' }} onClick={() => openQuickAdd('tecnico')} title="Nuevo técnico">
                  <UserPlus size={16} />
                </button>
              </div>
              {selectedTecnico && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Cel: {selectedTecnico.Celular || '—'} · DNI: {selectedTecnico.DNI || '—'}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Supervisor que registra</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="glass-input" value={supervisorId} onChange={e => setSupervisorId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {supervisores.filter(s => s.Estado !== 'Inactivo').map(s => (
                    <option key={s.Item} value={s.Item}>{s.Nombre}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" style={{ padding: '0 12px' }} onClick={() => openQuickAdd('supervisor')} title="Nuevo supervisor">
                  <UserPlus size={16} />
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Número de Ticket</label>
              <input type="text" className="glass-input" placeholder="Ej: 10294" value={ticket} onChange={e => setTicket(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Local del Trabajo</label>
              <input type="text" className="glass-input" placeholder="Ej: Local Centro" value={localName} onChange={e => setLocalName(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Monto Depositado (S/)</label>
              <input type="number" step="0.01" className="glass-input" placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Fecha de Depósito</label>
              <input type="date" className="glass-input" value={dia} onChange={e => setDia(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Voucher del Depósito</label>
              <input id="voucher-file" type="file" accept="image/*,application/pdf" className="glass-input" onChange={e => setVoucher(e.target.files ? e.target.files[0] : null)} required />
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" style={{ minWidth: '200px' }} disabled={submitting}>
              {submitting ? 'Registrando...' : 'Registrar Depósito'}
            </button>
          </div>
        </form>
      </section>

      {/* Main Table */}
      <section className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
            Lista de Depósitos ({filteredDepositos.length})
          </h2>
          {porRevisarCount > 0 && (
            <span className="badge badge-por-revisar" style={{ fontSize: '13px' }}>
              {porRevisarCount} por revisar
            </span>
          )}
        </div>

        {/* Tabs + compact tecnico filter */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '7px 14px', fontSize: '13px' }}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Buscar ticket, local, técnico…"
              style={{ width: 'auto', minWidth: '210px', padding: '7px 12px', fontSize: '13px' }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select className="glass-input" style={{ width: 'auto', minWidth: '170px', padding: '7px 12px', fontSize: '13px' }} value={filterTecnico} onChange={e => setFilterTecnico(e.target.value)}>
              <option value="">Todos los técnicos</option>
              {tecnicos.map(t => <option key={t.Item} value={t.Nombre}>{t.Nombre}</option>)}
            </select>
            {(searchText || filterTecnico) && (
              <button className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '13px' }} onClick={() => { setSearchText(''); setFilterTecnico(''); }}>
                Limpiar
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner" style={spinnerStyle}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Cargando registros...</p>
          </div>
        ) : filteredDepositos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No hay depósitos en esta vista.
          </div>
        ) : (
          <div className="custom-table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Técnico</th>
                  <th>Supervisor</th>
                  <th>Ticket</th>
                  <th>Monto</th>
                  <th>Día</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepositos.map((dep) => (
                  <tr key={dep.Item}>
                    <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>#{dep.Item}</td>
                    <td><div style={{ fontWeight: 500 }}>{dep.Tecnico}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dep.Local}</div></td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{dep.Supervisor || '—'}</td>
                    <td><span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{dep.Ticket}</span></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>S/ {parseFloat(dep.Monto).toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <Calendar size={14} />{dep.Dia}
                      </div>
                    </td>
                    <td><span className={badgeClass(dep.Estado)}>{dep.Estado}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" style={miniBtn} onClick={() => handleCopyLink(dep.LinkRendicion, dep.Token)}>
                          {copiedToken === dep.Token ? (<><Check size={12} style={{ color: 'var(--accent-success)' }} />Copiado</>) : (<><Copy size={12} />Link</>)}
                        </button>
                        <button className="btn btn-secondary" style={miniBtn} onClick={() => openLink(dep)} title="Código QR para abrir desde el celular">
                          <QrCode size={12} />QR
                        </button>
                        <button className="btn btn-secondary" style={miniBtn} onClick={() => sendLinkWhatsapp(dep)} disabled={!dep.Telefono} title={dep.Telefono ? 'Enviar por WhatsApp' : 'Sin celular'}>
                          <MessageCircle size={12} />WhatsApp
                        </button>
                        <button className="btn btn-secondary" style={miniBtn} onClick={() => handleViewDetails(dep)}>Detalles</button>
                        {dep.Estado === 'Por Revisar' && (
                          <>
                            <button className="btn btn-success" style={miniBtn} onClick={() => openAction('aprobar', dep)}><ThumbsUp size={12} />Aprobar</button>
                            <button className="btn btn-secondary" style={{ ...miniBtn, color: 'var(--accent-warning)' }} onClick={() => openAction('rechazar', dep)}><ThumbsDown size={12} />Rechazar</button>
                          </>
                        )}
                        {['Rindiendo', 'Observado'].includes(dep.Estado) && (
                          <button className="btn btn-secondary" style={{ ...miniBtn, color: 'var(--accent-primary)' }} onClick={() => openAmpliar(dep)}><Plus size={12} />Ampliar</button>
                        )}
                        {['Rindiendo', 'Por Revisar', 'Observado'].includes(dep.Estado) && (
                          <button className="btn btn-secondary" style={{ ...miniBtn, color: 'var(--accent-error)' }} onClick={() => openAction('anular', dep)}><Ban size={12} />Anular</button>
                        )}
                        <button className="btn btn-secondary" style={miniBtn} onClick={() => openArchivos(dep)}>
                          <FolderOpen size={12} />Archivos
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* State legend (bottom) */}
      <section className="glass-card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <FileText size={16} style={{ color: 'var(--accent-primary)' }} />
          Leyenda de estados
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          {[
            { e: 'Rindiendo', d: 'El técnico está subiendo sus comprobantes.' },
            { e: 'Por Revisar', d: 'El técnico envió su rendición; requiere tu validación.' },
            { e: 'Finalizado', d: 'Aprobada y cerrada correctamente.' },
            { e: 'Observado', d: 'La rechazaste con un motivo; el técnico la corrige.' },
            { e: 'Anulado', d: 'Depósito cancelado por error.' },
          ].map(item => (
            <div key={item.e} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`badge badge-${item.e.toLowerCase().replace(/\s+/g, '-')}`} style={{ minWidth: '108px', justifyContent: 'center' }}>{item.e}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{item.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Aviso de bienvenida con la mascota. Portal a <body> por el mismo motivo que los modales:
          el transform del contenedor raíz rompería el `position: fixed`. */}
      {mostrarAviso && createPortal(
        <div className="aviso-mascota" role="status">
          <button
            className="aviso-mascota-cerrar"
            onClick={() => setAvisoCerrado(true)}
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
          <button
            className="aviso-mascota-cuerpo"
            onClick={() => {
              // Limpia los filtros: el conteo es global, así que sin esto el aviso puede anunciar
              // 5 y llevar a una lista con 1, o vacía.
              setFilterTecnico('');
              setSearchText('');
              setActiveTab('PorRevisar');
              setAvisoCerrado(true);
            }}
          >
            <img src={mascotaRindepe} alt="" width={64} height={83} />
            <span>
              <strong style={{ display: 'block', fontSize: '15px', marginBottom: '2px' }}>
                Tienes {porRevisarCount} {porRevisarCount === 1 ? 'depósito' : 'depósitos'} por revisar
              </strong>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Toca para verlos</span>
            </span>
          </button>
        </div>,
        document.body
      )}

      {/* Details Modal */}
      {selectedDeposito && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '700px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '20px' }}>Detalles de Rendición #{selectedDeposito.Item}</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => { setSelectedDeposito(null); setSelectedGastos([]); setSelectedLiquidacion(null); setSelectedAmpliaciones([]); }}>Cerrar</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div><p style={miniLabel}>TÉCNICO</p><p style={{ fontWeight: 500 }}>{selectedDeposito.Tecnico}</p></div>
              <div><p style={miniLabel}>SUPERVISOR</p><p style={{ fontWeight: 500 }}>{selectedDeposito.Supervisor || '—'}</p></div>
              <div><p style={miniLabel}>TICKET / LOCAL</p><p style={{ fontWeight: 500 }}>{selectedDeposito.Ticket} - {selectedDeposito.Local}</p></div>
              <div><p style={miniLabel}>MONTO</p><p style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>S/ {parseFloat(selectedDeposito.Monto).toFixed(2)}</p></div>
              <div><p style={miniLabel}>ESTADO</p><span className={badgeClass(selectedDeposito.Estado)} style={{ marginTop: '4px' }}>{selectedDeposito.Estado}</span></div>
              {selectedDeposito.Observaciones && (
                <div style={{ gridColumn: '1 / -1' }}><p style={miniLabel}>OBSERVACIÓN</p><p style={{ fontSize: '13px', color: 'var(--accent-warning)' }}>{selectedDeposito.Observaciones}</p></div>
              )}
            </div>

            {selectedDeposito.Resumen_Pdf && (
              <a href={selectedDeposito.Resumen_Pdf} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <FileText size={16} /> Ver Hoja Resumen (PDF)
              </a>
            )}

            {/* Desglose de depósitos (inicial + ampliaciones) */}
            {selectedAmpliaciones.length > 0 && (() => {
              const totalAmp = selectedAmpliaciones.reduce((a, x) => a + (parseFloat(x.Monto) || 0), 0);
              const total = parseFloat(selectedDeposito.Monto) || 0;
              const inicial = total - totalAmp;
              return (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>Depósitos entregados</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={rowItemStyle}>
                      <div style={{ fontSize: '14px' }}>Depósito inicial</div>
                      <span style={{ fontWeight: 600 }}>S/ {inicial.toFixed(2)}</span>
                    </div>
                    {selectedAmpliaciones.map((amp) => (
                      <div key={amp.Item} style={rowItemStyle}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '14px' }}>Depósito adicional <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {amp.Fecha}</span></div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{amp.Motivo || 'Sin motivo'}{amp.Supervisor ? ` · ${amp.Supervisor}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>+ S/ {parseFloat(amp.Monto).toFixed(2)}</span>
                          {amp.DriveFileId && <a href={amp.DriveFileId} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Ver voucher</a>}
                        </div>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px' }}>
                      <span>Total entregado:</span>
                      <span>S/ {total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>Comprobantes Presentados ({selectedGastos.length})</h4>
            {loadingDetails ? (
              <div style={{ textAlign: 'center', padding: '20px' }}><div className="spinner" style={{ ...spinnerStyle, width: '24px', height: '24px' }}></div></div>
            ) : selectedGastos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>No se han subido comprobantes todavía.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedGastos.map((gasto: any, idx: number) => (
                  <div key={idx} style={rowItemStyle}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{gasto.Tipo_Comprobante}{(gasto.Nro_Comprobante || gasto.Descripcion) ? ' - ' : ''}<span style={{ color: 'var(--text-secondary)' }}>{gasto.Nro_Comprobante || gasto.Descripcion}</span></div>
                      {gasto.RUC_Emisor && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>RUC: {gasto.RUC_Emisor}</div>}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fecha: {gasto.Fecha_Comprobante}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 600 }}>S/ {parseFloat(gasto.Monto_Gasto).toFixed(2)}</span>
                      <a href={gasto.DriveFileId} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Ver Doc</a>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '15px' }}>
                  <span>Total Gastado:</span>
                  <span>S/ {selectedGastos.reduce((a, b) => a + parseFloat(b.Monto_Gasto), 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Liquidación: vuelto / reembolso */}
            {selectedLiquidacion && (() => {
              const liq = selectedLiquidacion;
              const tipo = liq.Estado_Liquidacion;
              const dif = Math.abs(parseFloat(liq.Diferencia) || 0);
              const isReembolso = tipo === 'Reembolso';
              const isDevolucion = tipo === 'Devolucion';
              const accent = isReembolso ? 'var(--accent-error)' : isDevolucion ? 'var(--accent-warning)' : 'var(--accent-success)';
              return (
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>Liquidación / Cierre</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><p style={miniLabel}>DEPOSITADO</p><p style={{ fontWeight: 600 }}>S/ {parseFloat(liq.Monto_Depositado).toFixed(2)}</p></div>
                    <div><p style={miniLabel}>GASTADO</p><p style={{ fontWeight: 600 }}>S/ {parseFloat(liq.Total_Gastado).toFixed(2)}</p></div>
                    <div><p style={miniLabel}>{isReembolso ? 'REEMBOLSO' : isDevolucion ? 'VUELTO' : 'DIFERENCIA'}</p><p style={{ fontWeight: 700, color: accent }}>S/ {dif.toFixed(2)}</p></div>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {/* El reembolso recién ocurre al aprobar: antes no se puede hablar en pasado. */}
                      {isReembolso
                        ? (selectedDeposito.Estado === 'Finalizado'
                          ? `Se reembolsó al técnico S/ ${dif.toFixed(2)} que gastó de más.`
                          : `Pendiente: reembolsar S/ ${dif.toFixed(2)} al técnico al aprobar.`)
                        : isDevolucion ? `El técnico devolvió el vuelto de S/ ${dif.toFixed(2)}.`
                        : 'Balance exacto, sin vuelto ni reembolso.'}
                    </div>
                    {liq.Comprobante_Liquidacion_Id && (
                      <a href={liq.Comprobante_Liquidacion_Id} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        {isReembolso ? 'Ver voucher de reembolso' : 'Ver voucher de devolución'}
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* Action Modal */}
      {actionModal && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '460px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>
              {actionModal.type === 'aprobar' ? 'Aprobar rendición' : actionModal.type === 'rechazar' ? 'Observar (rechazar) rendición' : 'Anular depósito'} #{actionModal.dep.Item}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>Técnico: {actionModal.dep.Tecnico} · Ticket {actionModal.dep.Ticket}</p>

            {actionModal.type === 'aprobar' && (
              actionLiqLoading ? (
                <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>Cargando la liquidación…</p>
              ) : actionLiqError ? (
                <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--accent-error-glow)', color: 'var(--accent-error)', fontSize: '13px' }}>
                  No se pudo cargar la liquidación, así que no se sabe si corresponde un reembolso. Cierra y vuelve a intentarlo.
                </div>
              ) : isReembolso ? (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--accent-warning-glow)', color: 'var(--accent-warning)', fontSize: '13px', marginBottom: '12px' }}>
                    💰 Reembolso al técnico: <strong>S/ {actionLiquidacion ? Math.abs(parseFloat(actionLiquidacion.Diferencia)).toFixed(2) : ''}</strong>. Adjunta el voucher del depósito que le hiciste al técnico.
                  </div>
                  <label style={labelStyle}>Voucher de reembolso (Imagen/PDF)</label>
                  <input type="file" accept="image/*,application/pdf" className="glass-input" onChange={e => setActionFile(e.target.files ? e.target.files[0] : null)} required />
                </div>
              ) : isDevolucionAction ? (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--accent-warning-glow)', color: 'var(--accent-warning)', fontSize: '13px', marginBottom: '12px' }}>
                    ↩️ El técnico devolvió un vuelto de <strong>S/ {actionLiquidacion ? Math.abs(parseFloat(actionLiquidacion.Diferencia)).toFixed(2) : ''}</strong>. Revisa su voucher antes de aprobar.
                  </div>
                  {actionLiquidacion?.Comprobante_Liquidacion_Id ? (
                    <a href={actionLiquidacion.Comprobante_Liquidacion_Id} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '13px' }}>
                      <FileText size={15} /> Ver voucher de devolución
                    </a>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--accent-error)' }}>⚠️ No hay voucher de devolución adjunto en esta rendición.</p>
                  )}
                </div>
              ) : (
                <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>Se marcará como <strong>Finalizado</strong>. ¿Confirmas?</p>
              )
            )}

            {(actionModal.type === 'rechazar' || actionModal.type === 'anular') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{actionModal.type === 'rechazar' ? 'Motivo del rechazo' : 'Motivo de la anulación'}</label>
                <textarea className="glass-input" rows={3} placeholder="Escribe el motivo…" value={actionMotivo} onChange={e => setActionMotivo(e.target.value)} />
                {actionModal.type === 'rechazar' && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>El técnico verá este motivo y podrá corregir su rendición.</p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActionModal(null)} disabled={actionLoading}>Cancelar</button>
              <button
                className={`btn ${actionModal.type === 'aprobar' ? 'btn-success' : 'btn-primary'}`}
                onClick={submitAction}
                disabled={actionLoading || (actionModal.type === 'aprobar' && (actionLiqLoading || actionLiqError))}
              >
                {actionLoading ? 'Procesando…' : actionModal.type === 'aprobar' ? 'Aprobar' : actionModal.type === 'rechazar' ? 'Rechazar' : 'Anular'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Ampliar (depósito adicional) modal */}
      {ampliarDep && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '460px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Depósito adicional · #{ampliarDep.Item}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
              Técnico: {ampliarDep.Tecnico} · Ticket {ampliarDep.Ticket} · Monto actual: <strong>S/ {parseFloat(ampliarDep.Monto).toFixed(2)}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Monto adicional (S/)</label>
                  <input type="number" step="0.01" className="glass-input" placeholder="0.00" value={ampMonto} onChange={e => setAmpMonto(e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" className="glass-input" value={ampFecha} onChange={e => setAmpFecha(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Supervisor que deposita</label>
                <select className="glass-input" value={ampSupervisorId} onChange={e => setAmpSupervisorId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {supervisores.filter(s => s.Estado !== 'Inactivo').map(s => <option key={s.Item} value={s.Item}>{s.Nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Motivo</label>
                <input type="text" className="glass-input" placeholder="Ej: se requirió gasto extra en materiales" value={ampMotivo} onChange={e => setAmpMotivo(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Voucher del depósito adicional</label>
                <input type="file" accept="image/*,application/pdf" className="glass-input" onChange={e => setAmpFile(e.target.files ? e.target.files[0] : null)} />
              </div>
              {ampMonto && parseFloat(ampMonto) > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--accent-primary-glow)', fontSize: '13px', color: 'var(--text-primary)' }}>
                  Nuevo total entregado: <strong>S/ {(parseFloat(ampliarDep.Monto) + parseFloat(ampMonto)).toFixed(2)}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="btn btn-secondary" onClick={() => setAmpliarDep(null)} disabled={ampLoading}>Cancelar</button>
              <button className="btn btn-primary" onClick={submitAmpliar} disabled={ampLoading}>{ampLoading ? 'Guardando…' : 'Registrar adicional'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick-add master modal */}
      {quickAdd && (
        <Modal encima>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Nuevo {quickAdd === 'tecnico' ? 'Técnico' : 'Supervisor'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div><label style={labelStyle}>Nombre</label><input className="glass-input" value={qaNombre} onChange={e => setQaNombre(e.target.value)} autoFocus /></div>
              <div><label style={labelStyle}>Celular</label><input className="glass-input" type="tel" placeholder="9XXXXXXXX" value={qaCelular} onChange={e => setQaCelular(e.target.value)} /></div>
              {quickAdd === 'tecnico' && (
                <div><label style={labelStyle}>DNI</label><input className="glass-input" value={qaDni} onChange={e => setQaDni(e.target.value)} /></div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="btn btn-secondary" onClick={() => setQuickAdd(null)} disabled={qaLoading}>Cancelar</button>
              <button className="btn btn-primary" onClick={submitQuickAdd} disabled={qaLoading}>{qaLoading ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* WhatsApp prompt (post-action) */}
      {waPrompt && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle size={20} style={{ color: 'var(--accent-success)' }} /> {waPrompt.title}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
              Así le llegaría el aviso al técnico por WhatsApp (<strong>+51 {waPrompt.phone}</strong>). En la demo no se envía nada.
            </p>
            <div className="wa-chat">
              <div className="wa-bubble">
                {waPrompt.message}
                <span className="wa-bubble-hora">{new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} ✓✓</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { copiarTexto(waPrompt.message); setWaCopiado(true); }}>
                {waCopiado ? (<><Check size={16} style={{ color: 'var(--accent-success)' }} /> Copiado</>) : (<><Copy size={16} /> Copiar mensaje</>)}
              </button>
              <button className="btn btn-primary" onClick={() => setWaPrompt(null)}>Listo</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Link del técnico + QR */}
      {linkDep && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QrCode size={20} style={{ color: 'var(--accent-primary)' }} /> Link de rendición #{linkDep.Item}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '14px' }}>
              {linkDep.Tecnico} · Ticket {linkDep.Ticket}. Escanéalo con un celular conectado al mismo WiFi que esta PC.
            </p>
            <div className="qr-box" style={{ marginBottom: '14px' }}>
              <img src={qrUrl(linkDep.LinkRendicion)} alt="Código QR del link de rendición" />
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '8px', wordBreak: 'break-all', marginBottom: '14px' }}>
              {linkDep.LinkRendicion}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => { copiarTexto(linkDep.LinkRendicion); setLinkCopiado(true); }}>
                {linkCopiado ? (<><Check size={16} style={{ color: 'var(--accent-success)' }} /> Copiado</>) : (<><Copy size={16} /> Copiar</>)}
              </button>
              <a className="btn btn-secondary" href={`/rendir/${linkDep.Token}`} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Abrir como técnico
              </a>
              <button className="btn btn-primary" onClick={() => setLinkDep(null)}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Archivos del depósito */}
      {archivosDep && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '560px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderOpen size={20} style={{ color: 'var(--accent-primary)' }} /> Archivos #{archivosDep.Item}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setArchivosDep(null)}>Cerrar</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {archivosDep.DriveFolderId}
            </p>
            {archivosLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}><div className="spinner" style={{ ...spinnerStyle, width: '24px', height: '24px' }}></div></div>
            ) : archivos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>No hay archivos en este depósito.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {archivos.map(a => (
                  <div key={a.name} className="file-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <Paperclip size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="file-row-name">{a.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {tamanoLegible(a.size)} · {new Date(a.modified).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}>Abrir</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Técnicos y supervisores */}
      {maestrosOpen && (
        <Modal>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '760px', maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} style={{ color: 'var(--accent-primary)' }} /> Técnicos y supervisores
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => { setMaestrosOpen(false); setEditMaestro(null); }}>Cerrar</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {(['tecnico', 'supervisor'] as const).map(k => (
                <button key={k} className={`btn ${maestrosTab === k ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '7px 14px', fontSize: '13px' }}
                  onClick={() => { setMaestrosTab(k); setEditMaestro(null); }}>
                  {k === 'tecnico' ? `Técnicos (${tecnicos.length})` : `Supervisores (${supervisores.length})`}
                </button>
              ))}
              <button className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: '13px', marginLeft: 'auto' }} onClick={() => openQuickAdd(maestrosTab)}>
                <UserPlus size={14} /> Nuevo {maestrosTab === 'tecnico' ? 'técnico' : 'supervisor'}
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Quien ya tiene depósitos solo se puede desactivar (deja de aparecer al registrar). Editar no cambia los depósitos ya registrados.
            </p>
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Celular</th>
                    {maestrosTab === 'tecnico' && <th>DNI</th>}
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(maestrosTab === 'tecnico' ? tecnicos : supervisores).map(m => {
                    const enEdicion = editMaestro && editMaestro.kind === maestrosTab && editMaestro.Item === m.Item ? editMaestro : null;
                    if (enEdicion) {
                      return (
                        <tr key={m.Item}>
                          <td><input className="glass-input" style={editInput} value={enEdicion.Nombre} onChange={e => setEditMaestro({ ...enEdicion, Nombre: e.target.value })} autoFocus /></td>
                          <td><input className="glass-input" style={editInput} value={enEdicion.Celular} onChange={e => setEditMaestro({ ...enEdicion, Celular: e.target.value })} /></td>
                          {maestrosTab === 'tecnico' && (
                            <td><input className="glass-input" style={editInput} value={enEdicion.DNI} onChange={e => setEditMaestro({ ...enEdicion, DNI: e.target.value })} /></td>
                          )}
                          <td><span className={estadoMaestroClass(enEdicion.Estado)}>{enEdicion.Estado}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-success" style={miniBtn} onClick={() => guardarMaestro(enEdicion)} disabled={maestroSaving}>{maestroSaving ? 'Guardando…' : 'Guardar'}</button>
                              <button className="btn btn-secondary" style={miniBtn} onClick={() => setEditMaestro(null)} disabled={maestroSaving}>Cancelar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={m.Item} style={{ opacity: m.Estado === 'Inactivo' ? 0.6 : 1 }}>
                        <td style={{ fontWeight: 500 }}>{m.Nombre}</td>
                        <td style={{ fontSize: '13px' }}>{m.Celular || '—'}</td>
                        {maestrosTab === 'tecnico' && <td style={{ fontSize: '13px' }}>{(m as Tecnico).DNI || '—'}</td>}
                        <td><span className={estadoMaestroClass(m.Estado)}>{m.Estado || 'Activo'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" style={miniBtn} disabled={maestroSaving}
                              onClick={() => setEditMaestro({ kind: maestrosTab, Item: m.Item, Nombre: m.Nombre, Celular: m.Celular || '', DNI: (m as Tecnico).DNI || '', Estado: m.Estado || 'Activo' })}>
                              <Pencil size={12} />Editar
                            </button>
                            <button className="btn btn-secondary" style={miniBtn} disabled={maestroSaving} onClick={() => toggleEstadoMaestro(maestrosTab, m)}>
                              {m.Estado === 'Inactivo' ? 'Activar' : 'Desactivar'}
                            </button>
                            <button className="btn btn-secondary" style={{ ...miniBtn, color: 'var(--accent-error)' }} disabled={maestroSaving} onClick={() => eliminarMaestro(maestrosTab, m)}>
                              <Trash2 size={12} />Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function tamanoLegible(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const estadoMaestroClass = (estado: string) => `badge ${estado === 'Inactivo' ? 'badge-anulado' : 'badge-finalizado'}`;
const editInput: React.CSSProperties = { padding: '6px 8px', fontSize: '13px' };

// Modals mount straight into <body>. Rendered inside the dashboard tree they would inherit the
// root's `animate-fade-in` transform, which turns that div into the containing block for
// `position: fixed` — the overlay would then anchor to the whole list instead of the viewport.
// Must stay at module scope: declared inside Dashboard, React would remount the portal (and drop
// focus / clear file inputs) on every keystroke.
function Modal({ children, encima = false }: { children: React.ReactNode; encima?: boolean }) {
  // "encima": para un modal que se abre desde otro (alta rápida desde la gestión de maestros).
  return createPortal(
    <div style={encima ? { ...overlayStyle, zIndex: 110 } : overlayStyle} role="dialog" aria-modal="true">{children}</div>,
    document.body
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 };
const miniLabel: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)' };
const miniBtn: React.CSSProperties = { padding: '6px 10px', fontSize: '12px' };
const spinnerStyle: React.CSSProperties = { width: '30px', height: '30px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', margin: '0 auto 10px auto' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' };
const rowItemStyle: React.CSSProperties = { padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
