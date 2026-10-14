# Solución de problemas

## El celular no abre el link o el QR

1. El celular debe estar en **el mismo WiFi** que la PC (no con datos móviles ni en la red de invitados).
2. Revisa la ventana negra: la línea **"Desde el celular"** muestra la dirección. Ábrela tal cual en el navegador del celular.
3. **Firewall de Windows:** la primera vez que se inicia, Windows pregunta si permite Node.js. Debe estar permitido en **redes privadas**. Si se rechazó:
   - Panel de control > Firewall de Windows Defender > Permitir una aplicación... > busca **Node.js JavaScript Runtime** > marca **Privada** > Aceptar.
   - Y en Configuración > Red e Internet > WiFi > tu red: tipo de perfil **Privada**.
4. Algunas redes (oficinas, hoteles, WiFi públicos) bloquean la comunicación entre equipos. En ese caso usa el **punto de acceso del celular**: conecta la PC a él, cierra y vuelve a abrir la demo.
5. Con una VPN encendida (por ejemplo Fortinet) la dirección detectada puede no servir. Apágala o fija la IP a mano (ver abajo).

## La dirección del link es incorrecta

La demo detecta la IP de la PC al iniciar. Si cambiaste de red, **cierra y vuelve a abrir** la demo.
Si sigue mal, puedes fijarla: crea un acceso directo o edita `Iniciar RindePe.bat` y agrega
antes de la línea `node ...`:

```bat
set RINDEPE_IP=192.168.1.50
```

(reemplaza por la IP de tu PC; la ves con `ipconfig` en la línea "Dirección IPv4" del adaptador WiFi).

## "El puerto 4000 ya está en uso"

La demo ya está abierta en otra ventana: abre `http://localhost:4000` en el navegador, o
cierra la otra ventana y vuelve a iniciar. Si no hay otra ventana visible, en PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen | % { Stop-Process -Id $_.OwningProcess }
```

## "No se encontró Node.js" o error con `node:sqlite`

Hace falta **Node.js 22.13 o superior** (versión LTS desde https://nodejs.org). Verifica con
`node -v`. Después de instalarlo, cierra y vuelve a abrir la ventana.

## La página se ve igual después de cambiar el código del frontend

La interfaz se compila una sola vez. Inicia con `"Iniciar RindePe.bat" build` (desde una
terminal en la carpeta) o borra `frontend/dist` y vuelve a hacer doble clic.

## La clave no funciona

La clave es `demo2026` (aparece en el login con el botón **Usar**). Si se cambió en
`backend/config.js`, la pantalla de login muestra la nueva.

## Copiar no funciona en el celular

Desde el celular la página se abre por `http://` (no `https://`), y algunos navegadores
limitan el portapapeles. La demo usa un método alternativo; si aun así no copia, mantén
presionado el texto para copiarlo a mano.

## Los datos quedaron en un estado raro

Pulsa **Restaurar demo**. Si el panel no carga, cierra la demo, borra la carpeta `data/` y
vuelve a iniciar: se regeneran los datos de ejemplo.

## Ver qué pasó

Los errores del servidor se muestran en la ventana negra. Para revisar que todo funcione:

```bash
npm test
```

Corre la prueba completa del flujo en una carpeta temporal (no toca tus datos).
