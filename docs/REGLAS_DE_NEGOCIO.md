# Reglas de negocio

Son las mismas del sistema original (`rendicionesNexos`), salvo donde se indica **Demo**.
Las reglas se validan en el servidor (`backend/server.js`); el navegador solo las repite para
avisar antes.

## Roles

| Rol | Cómo entra | Qué puede hacer |
|---|---|---|
| Supervisor | Clave compartida (`demo2026`), enviada en el header `x-admin-key` | Todo el panel: depósitos, validación, maestros, restaurar demo. |
| Técnico | Link único `/rendir/{token}` (token aleatorio de 32 caracteres), sin contraseña | Ver su depósito, cargar comprobantes y enviar su rendición. |

## Estados del depósito

```
Registrar depósito ──► Rindiendo ──(técnico envía)──► Por Revisar ──(aprueba)──► Finalizado
                          ▲                               │
                          │                          (rechaza con motivo)
                          │                               ▼
                          └────(técnico corrige y reenvía)── Observado

Rindiendo / Por Revisar / Observado ──(anula con motivo)──► Anulado
```

| Acción | Quién | Estado requerido | Resultado |
|---|---|---|---|
| Registrar depósito | Supervisor | — | Rindiendo |
| Cargar comprobante | Técnico | Rindiendo u Observado (**Demo**: antes no se validaba) | sin cambio |
| Enviar rendición | Técnico | Rindiendo u Observado (**Demo**: antes no se validaba) | Por Revisar |
| Aprobar | Supervisor | Por Revisar | Finalizado + Hoja Resumen PDF |
| Rechazar (observar) | Supervisor | Por Revisar (**Demo**: antes no se validaba) | Observado |
| Anular | Supervisor | Rindiendo, Por Revisar u Observado | Anulado |
| Ampliar | Supervisor | Rindiendo u Observado | sin cambio, sube el monto |

Rechazar y anular exigen un motivo, que se guarda en `Observaciones` y que el técnico ve.

## Montos

- `Monto` del depósito es el **total entregado**: inicial + todas las ampliaciones.
- Monto inicial = `Monto − suma de ampliaciones`.
- Total gastado = suma de los comprobantes.
- **Diferencia = total entregado − total gastado**, redondeada a céntimos **antes** de comparar.
  Sin el redondeo, `166.00 + 16.40 + 7.30` da `189.70000000000002` y un balance exacto se
  clasificaba como reembolso de S/ 0.00.

| Diferencia | Tipo de liquidación | Qué se exige |
|---|---|---|
| = 0 | Exacto | Nada. |
| > 0 (sobró) | Devolucion | El técnico deposita el vuelto en la cuenta de la empresa y **sube el voucher** al enviar. |
| < 0 (faltó) | Reembolso | Al **aprobar**, el supervisor sube el voucher del pago al técnico. |

**Demo:** el tipo y la diferencia los calcula el **servidor** con los montos de la base. El
navegador manda los montos que está mostrando; si no coinciden (por ejemplo, el supervisor
amplió el depósito mientras el técnico tenía la página abierta), el servidor responde
"recarga la página" en vez de guardar un balance equivocado. El voucher de devolución también
se exige en el servidor.

Al aprobar, una liquidación guardada como Reembolso o Devolución con diferencia de S/ 0.00
(datos viejos con el error de redondeo) se corrige a Exacto automáticamente.

## Comprobantes

| Tipo | Datos obligatorios | Anti-duplicado |
|---|---|---|
| Boleta, Factura, Recibo de Honorarios | RUC del emisor, Serie, Correlativo (numérico), monto > 0, fecha, archivo | Sí |
| Otros, Declaración Jurada | Descripción, monto > 0, fecha, archivo | No |

- **RUC:** 11 dígitos, prefijo 10, 15, 16, 17 o 20, y dígito verificador SUNAT (módulo 11).
- El número se guarda como `SERIE-CORRELATIVO` (ej. `F001-000412`).
- **Anti-duplicado global:** la combinación RUC + Serie + Correlativo no puede repetirse en
  **ningún** depósito ni técnico. La serie no distingue mayúsculas y el correlativo se compara
  por valor (`000412` = `412`).
- Archivos: solo imagen o PDF, hasta 15 MB (**Demo**).

## Técnicos y supervisores

- Se guardan nombre, celular y (técnicos) DNI. Estado Activo o Inactivo.
- **Demo:** se pueden editar. Editar **no** cambia los depósitos ya registrados: cada depósito
  guarda una copia del nombre y celular del momento.
- **Demo:** desactivar oculta a la persona de los selectores al registrar; su historial se mantiene.
- **Demo:** solo se puede **eliminar** a quien no tiene depósitos (ni ampliaciones, en el caso
  del supervisor). Si tiene, el sistema indica que solo se puede desactivar.

## Indicadores del panel

- Total Depositado: suma del monto de todos los depósitos, **incluidos los anulados** (se indica debajo cuánto es anulado).
- Total Finalizado: suma de los Finalizados.
- Total Pendiente y Cuentas en Proceso: depósitos que no están Finalizados ni Anulados (en soles y en cantidad).
- Los 4 indicadores siguen al buscador y al filtro de técnico, no a la pestaña.
- El contador "por revisar" es siempre global.

## Hoja Resumen PDF

Se genera al aprobar y se guarda en la carpeta del depósito como
`Resumen_Rendicion_{Ticket}.pdf`. Contiene: datos del depósito, depósito inicial y
adicionales, cada comprobante, total gastado, vuelto o reembolso y el visto bueno del técnico
(fecha de envío) y del supervisor (fecha de aprobación). Si el PDF falla, la aprobación no se
revierte.

## Mensajes de WhatsApp (simulados en la demo)

Se muestran con el texto que recibiría el técnico al: enviarle el link, observar su
rendición, reembolsarle y registrar un depósito adicional. **Demo:** no se abre WhatsApp; hay
un botón para copiar el mensaje.
