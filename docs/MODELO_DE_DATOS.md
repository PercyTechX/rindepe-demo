# Modelo de datos

Base SQLite en `data/rindepe.db` (se crea sola al iniciar; esquema en `backend/db.js`).
Se puede abrir con [DB Browser for SQLite](https://sqlitebrowser.org/) **con la demo cerrada**.
Las 6 tablas equivalen a las 6 pestañas del Google Sheet del sistema original.

Los montos se guardan como número (`REAL`) redondeado a 2 decimales. Las fechas como texto
`AAAA-MM-DD`.

## depositos (pestaña Depositos)

| Columna | Campo en la API | Descripción |
|---|---|---|
| item | Item | Correlativo (clave primaria). |
| tecnico, telefono | Tecnico, Telefono | Copia del nombre y celular del técnico al registrar. |
| tecnico_id | Tecnico_Id | Referencia a `tecnicos.item`. |
| supervisor, supervisor_id | Supervisor, Supervisor_Id | Copia del nombre y referencia del supervisor. |
| ticket, local | Ticket, Local | Datos del trabajo. |
| monto | Monto | Total entregado (inicial + ampliaciones). |
| dia | Dia | Fecha del depósito inicial. |
| token | Token | Token secreto del link (único). |
| carpeta | DriveFolderId | Carpeta en `data/archivos/` (se mantiene el nombre del campo original). |
| estado | Estado | Rindiendo, Por Revisar, Observado, Finalizado o Anulado. |
| observaciones | Observaciones | Motivo del rechazo o de la anulación. |
| fecha_rendido | Fecha_Rendido | Visto bueno del técnico (al enviar). |
| fecha_aprobado | Fecha_Aprobado | Visto bueno del supervisor (al aprobar). |
| resumen_pdf | Resumen_Pdf | Link a la Hoja Resumen PDF. |
| — | LinkRendicion | No se guarda: se arma al leer con la IP actual. |

## detalle_gastos (pestaña Detalle_Gastos)

| Columna | Campo en la API | Descripción |
|---|---|---|
| item_gasto | Item_Gasto | Correlativo. |
| item_deposito | Item_Deposito | Depósito al que pertenece. |
| tipo_comprobante | Tipo_Comprobante | Boleta, Factura, Recibo de Honorarios, Declaración Jurada u Otros. |
| nro_comprobante | Nro_Comprobante | `SERIE-CORRELATIVO`; vacío en tipos libres. |
| ruc_emisor | RUC_Emisor | 11 dígitos; vacío en tipos libres. |
| descripcion | Descripcion | Solo en tipos libres. |
| monto_gasto | Monto_Gasto | Importe. |
| fecha_comprobante | Fecha_Comprobante | Fecha del comprobante. |
| archivo | DriveFileId | Link `/archivos/...` del comprobante. |

## liquidacion (pestaña Liquidacion)

Una fila por depósito (se crea o reemplaza cada vez que el técnico envía).

| Columna | Campo en la API | Descripción |
|---|---|---|
| item_deposito | Item_Deposito | Clave primaria y referencia al depósito. |
| monto_depositado | Monto_Depositado | Total entregado al enviar. |
| total_gastado | Total_Gastado | Suma de comprobantes al enviar. |
| diferencia | Diferencia | Entregado − gastado (negativo = reembolso). |
| estado_liquidacion | Estado_Liquidacion | Exacto, Devolucion o Reembolso. |
| comprobante | Comprobante_Liquidacion_Id | Voucher de devolución (técnico) o de reembolso (supervisor). |

## ampliaciones (pestaña Ampliaciones)

| Columna | Campo en la API | Descripción |
|---|---|---|
| item | Item | Correlativo. |
| item_deposito | Item_Deposito | Depósito ampliado. |
| monto, fecha, motivo | Monto, Fecha, Motivo | Datos del depósito adicional. |
| archivo | DriveFileId | Link del voucher. |
| supervisor, supervisor_id | Supervisor, Supervisor_Id | Quién lo registró. |

## tecnicos y supervisores (pestañas Tecnicos y Supervisores)

| Columna | Campo en la API | Descripción |
|---|---|---|
| item | Item | Correlativo. |
| nombre | Nombre | Obligatorio. |
| celular | Celular | Se usa para WhatsApp. |
| dni | DNI | Solo técnicos. |
| estado | Estado | Activo o Inactivo. |

## Archivos

```text
data/archivos/
└── TICKET-{Ticket}_{Tecnico}_{Local}/
    ├── Voucher_Deposito_{Ticket}.ext
    ├── Voucher_Deposito_Adicional_{n}_{Ticket}.ext
    ├── Gasto_{Tipo}_{SERIE-CORRELATIVO}.ext     (tipos libres: Gasto_{Tipo}_OTROS.ext)
    ├── Voucher_Devolucion_Saldo_{Ticket}.ext
    ├── Voucher_Reembolso_{Ticket}.ext
    └── Resumen_Rendicion_{Ticket}.pdf
```

Mismos nombres que en Google Drive en el original. Si un nombre se repite, se agrega `_2`, `_3`.
`data/tmp/` guarda las subidas mientras se procesan.

## Respaldo y borrado

- **Respaldar:** con la demo cerrada, copia la carpeta `data/` completa.
- **Volver a los datos de ejemplo:** botón **Restaurar demo**.
- **Empezar de cero sin ejemplos:** con la demo cerrada, borra `data/`; al iniciar se vuelven a cargar los ejemplos.
