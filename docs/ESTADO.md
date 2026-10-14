# Estado del proyecto

Archivo para retomar el trabajo en otra sesión. Actualizarlo al cerrar cada etapa.

**Última actualización:** 2026-10-14
**Repositorio:** https://github.com/PercyTechX/rindepe-demo (privado)
**Origen:** copia de `DEV/rendicionesNexos` (sistema de NEXOS INGENIEROS en producción en Render).

## Propósito

Demo local para **vender a otros clientes** y **capacitar usuarios**. Solo corre en la PC
(no se despliega).

## Decisiones tomadas (con el usuario)

| Tema | Decisión |
|---|---|
| Base | Copia del código original reemplazando Google Sheets por SQLite y Drive por carpeta local. |
| Marca | RindePe para "Empresa Demo SAC", elaborado por PercyTech. Mascota propia (robot técnico con casco). |
| Cuenta de devolución | Banco Demo 000-0000000000, titular EMPRESA DEMO. |
| Datos de ejemplo | Nombres peruanos inventados, rubro mantenimiento de industrias, locales tipo "Tienda Miraflores" / "Planta Ate". Botón Restaurar demo. |
| Login | Clave `demo2026` visible en pantalla. |
| WhatsApp | Simulado (modal con el mensaje y botón copiar). |
| Maestros | Editar, desactivar; eliminar solo sin historial. |
| Fallas del original | Corregidas en la demo (PENDIENTES.md §7 y §9 del original, y otras). |
| Celular | Link con IP de la red local + QR. |
| Botón Drive | Reemplazado por modal "Archivos". |
| Arranque | Doble clic en `Iniciar RindePe.bat`. |

## Hecho

- Backend: SQLite, archivos locales, PDF con marca, datos de ejemplo, endpoints nuevos.
- Frontend: marca, login con clave visible, QR, WhatsApp simulado, archivos, maestros.
- Prueba de punta a punta: `npm test` (11 pruebas, todas pasan).
- Revisión visual con capturas (escritorio y celular).
- Documentación en `docs/`.
- Subido a GitHub (rama `main`).

## Pendiente

- **El usuario va a revisar la demo y decir qué quiere cambiar.**
- Opcional: el linter (`npx eslint .` en `frontend/`) marca 25 avisos de estilo, casi todos
  `catch (err: any)`, el mismo patrón del original (que tenía 19). No afectan el funcionamiento.
- Opcional: llevar las correcciones de la demo al sistema de NEXOS (ver la sección
  "Fallas del original corregidas" del README).

## Cómo verificar después de un cambio

```bash
npm test                          # flujo completo por la API
npm run build                     # compila el frontend (tsc + vite)
"Iniciar RindePe.bat" build       # recompila y abre la demo
```

## Documentación

- [README](../README.md): uso, diferencias con el original, estructura.
- [GUIA_PRESENTACION.md](GUIA_PRESENTACION.md): guion para presentar y capacitar.
- [REGLAS_DE_NEGOCIO.md](REGLAS_DE_NEGOCIO.md): estados, montos, comprobantes.
- [API.md](API.md): endpoints.
- [MODELO_DE_DATOS.md](MODELO_DE_DATOS.md): tablas y archivos.
- [SOLUCION_DE_PROBLEMAS.md](SOLUCION_DE_PROBLEMAS.md): celular, puerto, Node, firewall.
