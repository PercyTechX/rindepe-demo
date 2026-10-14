# RindePe — demo local

Versión de demostración del sistema de rendición de cuentas (caja chica de técnicos de campo),
para **presentar a clientes y capacitar usuarios**. Es una copia del sistema en producción
(`DEV/rendicionesNexos`) con la misma lógica y pantallas, pero **todo funciona en esta PC**:
sin Google Sheets, sin Google Drive y sin internet.

- Marca: **RindePe** para la empresa ficticia **Empresa Demo SAC**, elaborado por PercyTech.
- Todos los datos (nombres, DNI, celulares, RUC, cuentas, comprobantes) son inventados.

## Documentación

| Documento | Para qué |
|---|---|
| [docs/GUIA_PRESENTACION.md](docs/GUIA_PRESENTACION.md) | Guion para presentar y capacitar, con qué depósito de ejemplo mostrar cada caso. |
| [docs/REGLAS_DE_NEGOCIO.md](docs/REGLAS_DE_NEGOCIO.md) | Estados, montos (vuelto y reembolso), comprobantes, anti-duplicado, maestros. |
| [docs/API.md](docs/API.md) | Todos los endpoints del servidor. |
| [docs/MODELO_DE_DATOS.md](docs/MODELO_DE_DATOS.md) | Tablas de SQLite, carpetas de archivos, respaldo. |
| [docs/SOLUCION_DE_PROBLEMAS.md](docs/SOLUCION_DE_PROBLEMAS.md) | El celular no abre el link, puerto ocupado, firewall, Node. |
| [docs/ESTADO.md](docs/ESTADO.md) | Decisiones tomadas, qué está hecho y qué falta (para retomar). |

## Cómo iniciarla

1. Doble clic en **`Iniciar RindePe.bat`**.
   - La primera vez instala y compila; tarda un par de minutos.
   - Si Windows pregunta por el **firewall**, acepta en **redes privadas**: es lo que permite abrir los links desde el celular.
2. Se abre el navegador en `http://localhost:4000`.
3. Entra con la clave **`demo2026`** (se muestra en la pantalla de login).

Para detenerla, cierra la ventana negra.

Requisito: Node.js 22.13 o superior (usa el SQLite que ya trae Node; no hay que instalar ninguna base de datos).

## Qué se puede hacer

| Quién | Dónde | Qué |
|---|---|---|
| Supervisor | `http://localhost:4000` | Registrar depósitos, ampliar, aprobar / observar / anular, ver detalles, archivos y la Hoja Resumen PDF, gestionar técnicos y supervisores. |
| Técnico | Link `/rendir/...` (botón **Link** o **QR**) | Subir comprobantes, ver su balance, enviar la rendición con vuelto o con reembolso. |

**Desde el celular:** en la lista, botón **QR** → escanéalo con un celular conectado **al mismo WiFi** que la PC.
Se abre la vista del técnico y se pueden subir fotos reales de boletas.

**Restaurar demo** (arriba a la derecha) borra todo lo hecho y vuelve a cargar los datos de ejemplo.
Úsalo antes de cada presentación o capacitación.

### Datos de ejemplo

11 depósitos que cubren todos los casos: rindiendo (vacío, a medias, con depósito adicional),
por revisar (exacto, con devolución, con reembolso), observado, anulado y finalizados con su PDF.
Un técnico está **inactivo** para mostrar que el historial se conserva.

## Diferencias con el sistema original

| Original (NEXOS) | Demo |
|---|---|
| Google Sheets | SQLite: `data/rindepe.db` |
| Google Drive | Carpeta `data/archivos/TICKET-.../` (botón **Archivos**) |
| WhatsApp abre `wa.me` | WhatsApp **simulado**: muestra el mensaje con botón copiar, no envía nada |
| Técnicos y supervisores: solo alta | También editar, desactivar y eliminar (solo si no tienen depósitos) |
| — | Link con IP de la red + código QR, botón Restaurar demo, clave visible |

**Fallas del original corregidas aquí** (ver `rendicionesNexos/docs/PENDIENTES.md` §7 y §9):

- Enviar la rendición (`/liquidar`) solo se acepta en *Rindiendo* u *Observado*. Antes se podía reabrir una finalizada.
- El balance lo calcula el servidor. Si los montos de la página quedaron viejos (por ejemplo, el supervisor amplió el depósito mientras el técnico la tenía abierta), pide recargar en vez de guardar un balance equivocado.
- La devolución exige el voucher también en el servidor.
- No se pueden agregar comprobantes a una rendición ya enviada, ni observar una que no esté *Por Revisar*.
- El detalle dice "Pendiente: reembolsar S/ X" hasta que se aprueba (antes hablaba en pasado).
- Las fechas usan la hora de Perú (antes, después de las 7 p. m. se registraba el día siguiente).
- Solo se aceptan imágenes o PDF de hasta 15 MB.

## Para cambiar cosas

- Nombre, empresa, clave, cuentas para devolver el vuelto: `backend/config.js`.
- Datos de ejemplo: `backend/seed.js` (después usa **Restaurar demo**).
- Colores: variables al inicio de `frontend/src/index.css`.
- Después de cambiar algo en `frontend/`, vuelve a compilar con `"Iniciar RindePe.bat" build` (o borra la carpeta `frontend/dist`).

## Para desarrollar y probar

```bash
npm run install-all     # instala backend y frontend
npm test                # prueba automática de todo el flujo (usa una carpeta temporal, no toca la demo)
npm run dev:backend     # API en :4000 con recarga automática
npm run dev:frontend    # interfaz en :5173 con recarga en caliente (usa la API de :4000)
```

## Estructura

```text
DemoRendiciones/
├── Iniciar RindePe.bat     # arranque con doble clic
├── backend/
│   ├── config.js           # marca, clave, cuentas, puerto, detección de la IP de red
│   ├── server.js           # API (mismos endpoints que el original + maestros, archivos, QR, reset)
│   ├── db.js               # SQLite (reemplaza a sheetsService.js)
│   ├── storage.js          # archivos locales (reemplaza a driveService.js)
│   ├── pdfService.js       # Hoja Resumen PDF
│   ├── resumen.js          # genera y archiva el PDF al aprobar
│   ├── seed.js             # datos de ejemplo + imágenes de muestra
│   └── test/flujo.test.js  # prueba de punta a punta
├── frontend/               # React + Vite (Dashboard, RendicionForm, Login)
└── data/                   # se crea al iniciar: base de datos y archivos (no va a git)
```
