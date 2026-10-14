# Guía para presentar y capacitar

Guion para mostrar RindePe a un cliente o capacitar a supervisores y técnicos. Dura unos
15 a 20 minutos. Todos los datos son ficticios.

## Antes de empezar

1. Abre `Iniciar RindePe.bat` y entra con la clave `demo2026`.
2. Pulsa **Restaurar demo** (arriba a la derecha) para partir de los datos de ejemplo.
3. Si vas a usar el celular, conéctalo **al mismo WiFi** que la PC y prueba un QR antes de que llegue la persona.
4. Ten a mano una foto de cualquier boleta o ticket (para subirla en vivo) o usa una captura cualquiera.

## Los depósitos de ejemplo

Después de restaurar, la demo siempre queda así. Las fechas se calculan desde el día de hoy.

| # | Ticket | Técnico | Local | Entregado | Estado | Para mostrar |
|---|---|---|---|---|---|---|
| 1 | 24031 | Raúl Vega Ticona | Planta Lurín | S/ 350.00 | Finalizado | Balance exacto con PDF. Técnico ya **inactivo**: su historial se conserva. |
| 2 | 24035 | Luis Quispe Mamani | Planta Ate | S/ 400.00 | Finalizado | **Reembolso** de S/ 18.50 con voucher del supervisor y PDF. |
| 3 | 24038 | Carlos Huamán Torres | Almacén Callao | S/ 500.00 | Finalizado | **Devolución** de S/ 37.60 con voucher del técnico y PDF. |
| 4 | 24042 | Jorge Mendoza Ccori | Tienda Miraflores | S/ 250.00 | Por Revisar | Aprobación simple (balance exacto, incluye una Declaración Jurada). |
| 5 | 24044 | Miguel Ríos Paredes | Planta Huachipa | S/ 450.00 | Por Revisar | Depósito **adicional** (300 + 150) y **devolución** de S/ 12.10. |
| 6 | 24046 | Kevin Salazar Rojas | Tienda San Isidro | S/ 200.00 | Por Revisar | **Reembolso** de S/ 56.80 pendiente: al aprobar se exige el voucher. |
| 7 | 24048 | Luis Quispe Mamani | Planta Chilca | S/ 300.00 | Observado | Rendición **rechazada con motivo**: el técnico debe corregir. |
| 8 | 24049 | Kevin Salazar Rojas | Planta Lurín | S/ 150.00 | Anulado | Depósito anulado por duplicado. |
| 9 | 24050 | Carlos Huamán Torres | Planta Ate | S/ 450.00 | Rindiendo | Con depósito adicional (250 + 200) y un comprobante. |
| 10 | 24052 | Jorge Mendoza Ccori | Tienda Surco | S/ 180.00 | Rindiendo | A medias: un comprobante cargado. |
| 11 | 24054 | Miguel Ríos Paredes | Almacén Villa El Salvador | S/ 220.00 | Rindiendo | Recién creado, sin comprobantes. |

Supervisores: Rosa Gutiérrez Vargas y Martín Castillo Poma.

## Guion sugerido

### 1. El panel del supervisor (3 min)

- Al entrar aparece la mascota: "Tienes 3 depósitos por revisar". Tócala y lleva a esa pestaña.
- Muestra las 4 tarjetas: total depositado, finalizado, pendiente y cuentas en proceso.
- Escribe "Carlos" en el buscador: las tarjetas se recalculan solo para él. Pulsa **Limpiar**.
- Recorre las pestañas: Pendientes, Por revisar, Finalizados, Anulados, Todos.

### 2. Registrar un depósito (2 min)

- En **Registrar Nuevo Depósito** elige técnico y supervisor, ticket `24060`, local `Planta Ventanilla`, monto `300`, la fecha de hoy y cualquier imagen como voucher.
- Al registrar aparece en la lista como **Rindiendo**.
- Pulsa **WhatsApp**: se ve el mensaje exacto que recibiría el técnico. En la demo no se envía nada.

### 3. El técnico rinde desde su celular (5 min)

- En el depósito recién creado pulsa **QR** y escanéalo con el celular. Sin celular, usa **Abrir como técnico**.
- Muestra que el técnico **no necesita usuario ni contraseña**: entra con su link.
- Agrega una **Factura** con estos datos (RUC válido que no se usa en los ejemplos):
  - RUC `20555000112`, serie `F001`, correlativo `000150`, monto `180.00`, fecha de hoy, foto de la boleta.
- Agrega un gasto **Otros** con descripción "Movilidad a planta" por `20.00`: no pide RUC.
- El balance se actualiza en tiempo real: sobran S/ 100.00, así que pide devolver el vuelto y muestra la cuenta de la empresa.
- Adjunta cualquier imagen como voucher de devolución y pulsa **Enviar rendición (con vuelto)**.

### 4. Control anti-duplicado (1 min)

- En otro depósito en Rindiendo (por ejemplo el #10) intenta cargar una factura ya rendida:
  RUC `20601000017`, serie `F001`, correlativo `4512` (ya usada en el #1 como `004512`).
- El sistema la rechaza aunque los ceros iniciales sean distintos y aunque sea otro técnico.
- Un RUC inventado (por ejemplo `20123456789`) también se rechaza: se valida el dígito verificador de SUNAT.

### 5. Validar como supervisor (4 min)

- **Aprobar el #4**: balance exacto, se aprueba directo.
- **Aprobar el #6**: es un reembolso, el sistema exige adjuntar el voucher del pago al técnico. Después muestra el aviso de WhatsApp de reembolso.
- **Rechazar** una rendición con un motivo: queda **Observado** y el técnico ve el motivo al abrir su link.
- **Ampliar** el #11: depósito adicional con motivo y voucher; el monto total sube.
- **Anular** un depósito creado por error.

### 6. Constancias y archivos (2 min)

- En un Finalizado (por ejemplo el #2) abre **Detalles** y luego **Ver Hoja Resumen (PDF)**: depósitos, comprobantes, reembolso y visto bueno del técnico y del supervisor.
- Pulsa **Archivos**: todos los vouchers, comprobantes y el PDF de ese depósito ordenados en su carpeta.

### 7. Maestros (1 min)

- **Técnicos y supervisores**: editar un celular, desactivar a alguien (deja de aparecer al registrar).
- Intenta **Eliminar** a un técnico con depósitos: no se permite, solo desactivar.

## Capacitación por rol

**Técnicos** (5 min, desde su propio celular):
abrir el link, leer el balance, cargar cada tipo de comprobante (con RUC o libre), qué hacer
si sobra dinero (depositar y subir el voucher) o si falta (se solicita reembolso), y cómo
corregir una rendición observada.

**Supervisores** (10 min): registrar, compartir el link, revisar detalles, aprobar con y sin
voucher, rechazar con un motivo claro, ampliar, anular y gestionar técnicos.

## Al terminar

Pulsa **Restaurar demo** para dejarla lista para la siguiente persona.
