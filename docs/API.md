# API

Servidor: `backend/server.js`, en `http://localhost:4000`. Todas las respuestas son JSON; los
errores tienen la forma `{ "error": "mensaje en español" }`.

- **Admin**: requiere el header `x-admin-key: demo2026` (si no, `401`).
- **Público**: lo usa el técnico; la seguridad es el token del link.
- Los campos usan los mismos nombres que el sistema original (PascalCase, valores como texto:
  `"Item": "3"`, `"Monto": "150.00"`), para que el frontend sea el mismo.
- Los endpoints con archivo usan `multipart/form-data`; solo imagen o PDF, hasta 15 MB.

## Depósitos

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/depositos` | Admin | Crea el depósito en Rindiendo, su carpeta y guarda el voucher. Campos: `Tecnico`, `Tecnico_Id`, `Telefono`, `Supervisor`, `Supervisor_Id`, `Ticket`, `Local`, `Monto` (> 0), `Dia` (AAAA-MM-DD), archivo `voucher`. |
| GET | `/api/depositos` | Admin | Lista todos, del más reciente al más antiguo. |
| GET | `/api/depositos/:item` | Admin | `{ deposito, gastos, liquidacion, ampliaciones }`. |
| GET | `/api/depositos/token/:token` | Público | Lo mismo, buscando por token (vista del técnico). |
| POST | `/api/depositos/:item/ampliar` | Admin | Depósito adicional. Campos: `monto` (> 0), `motivo`, `Fecha`, `Supervisor`, `Supervisor_Id`, archivo `voucher`. Solo en Rindiendo u Observado. Responde `{ montoAdicional, nuevoTotal }`. |
| POST | `/api/depositos/:item/aprobar` | Admin | Solo en Por Revisar. Si es Reembolso exige el archivo `voucherReembolso`. Pasa a Finalizado y genera el PDF. |
| POST | `/api/depositos/:item/rechazar` | Admin | JSON `{ "motivo": "..." }`. Solo en Por Revisar. Pasa a Observado. |
| POST | `/api/depositos/:item/anular` | Admin | JSON `{ "motivo": "..." }`. Desde Rindiendo, Por Revisar u Observado. |

## Rendición del técnico

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/depositos/:item/comprobantes` | Público | Carga un comprobante. Campos: `Tipo_Comprobante`, `Monto_Gasto`, `Fecha_Comprobante`, archivo `comprobante`; con RUC: `RUC_Emisor`, `Serie`, `Correlativo`; libres: `Descripcion`. `409` si está duplicado o si la rendición ya no es editable. |
| POST | `/api/depositos/:item/liquidar` | Público | Envía la rendición. Campos: `Monto_Depositado` y `Total_Gastado` (los que ve el técnico) y, si hay vuelto, archivo `voucherDevolucion`. El servidor calcula la diferencia y el tipo. `409` si el estado no lo permite o si los montos quedaron desactualizados; `400` si es devolución sin voucher. Responde `{ estado, estadoLiquidacion, diferencia }`. |

## Archivos

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/depositos/:item/archivos` | Admin | `{ carpeta, archivos: [{ name, url, size, modified }] }`. |
| GET | `/api/depositos/token/:token/archivos` | Público | Lo mismo, para el técnico. |
| GET | `/archivos/{carpeta}/{archivo}` | Público | Sirve el archivo. Se envía con `Content-Security-Policy: sandbox` para que un SVG subido no pueda ejecutar código. |

## Técnicos y supervisores

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET / POST | `/api/tecnicos` | Admin | Listar / crear (`Nombre` obligatorio, `Celular`, `DNI`). |
| PUT | `/api/tecnicos/:id` | Admin | Editar `Nombre`, `Celular`, `DNI`, `Estado` (Activo / Inactivo). |
| DELETE | `/api/tecnicos/:id` | Admin | `409` si tiene depósitos (solo se puede desactivar). |
| GET / POST | `/api/supervisores` | Admin | Listar / crear (`Nombre`, `Celular`). |
| PUT | `/api/supervisores/:id` | Admin | Editar `Nombre`, `Celular`, `Estado`. |
| DELETE | `/api/supervisores/:id` | Admin | `409` si registró depósitos o ampliaciones. |

## Demo y utilidades

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/info` | Público | Marca, clave demo, cuentas de devolución y dirección de red (`baseUrl`). |
| GET | `/api/qr?text=...` | Público | Código QR en SVG (máx. 500 caracteres). |
| POST | `/api/demo/reset` | Admin | Borra base y archivos y vuelve a cargar los datos de ejemplo. |
| GET | `/api/status` | Público | `{ status: "online" }`. |

## Diferencias con la API original

- Nuevos: `/api/info`, `/api/qr`, los dos de archivos, `PUT`/`DELETE` de maestros y `/api/demo/reset`.
- `LinkRendicion` se arma al leer con la IP actual de la PC (no se guarda), porque la IP puede cambiar.
- `liquidar` ignora `Diferencia` y `Estado_Liquidacion` enviados por el navegador.
- `comprobantes` y `rechazar` validan el estado; `POST /api/depositos` exige monto > 0.
