/**
 * Validación de RUC peruano (SUNAT): 11 dígitos, prefijo válido y dígito verificador (módulo 11).
 * Mantener esta lógica en sincronía con backend/rucUtil.js
 */

const PREFIJOS_VALIDOS = ['10', '15', '16', '17', '20'];

/** Deja solo los dígitos de un valor. */
export function soloDigitos(valor: string | number | null | undefined): string {
  return String(valor == null ? '' : valor).replace(/\D/g, '');
}

/** Valida un RUC peruano completo. */
export function validarRuc(ruc: string): boolean {
  const d = soloDigitos(ruc);
  if (d.length !== 11) return false;
  if (!PREFIJOS_VALIDOS.includes(d.slice(0, 2))) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(d[i], 10) * pesos[i];
  }
  const resto = suma % 11;
  let esperado = 11 - resto;
  if (esperado === 10) esperado = 0;
  if (esperado === 11) esperado = 1;

  return esperado === parseInt(d[10], 10);
}
