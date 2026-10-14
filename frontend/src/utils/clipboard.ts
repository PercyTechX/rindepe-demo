// Copia al portapapeles. navigator.clipboard solo existe en contextos seguros (https o localhost):
// desde la IP de la red (http://192.168..., p. ej. el técnico en su celular) no está, así que se
// usa el método antiguo con un textarea.
export function copiarTexto(texto: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).catch(() => copiarConTextarea(texto));
  } else {
    copiarConTextarea(texto);
  }
}

function copiarConTextarea(texto: string) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // sin portapapeles disponible
  }
  document.body.removeChild(ta);
}
