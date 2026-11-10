/**
 * Estado visible de una operación en cola:
 * local (todavía no se intentó) → enviando → reintentando (falló el envío) →
 * rechazada / conflicto. Las confirmadas pasan al historial.
 */
export function estadoDe(registro, enviando = false) {
  if (registro.estado === 'error') {
    return registro.resultado === 'conflicto'
      ? { clave: 'conflicto', texto: 'Conflicto de stock', clase: 'bg-amber-100 text-amber-900', icono: 'sync_problem' }
      : { clave: 'rechazada', texto: 'Rechazada', clase: 'bg-error/10 text-error', icono: 'block' }
  }
  if (enviando)
    return { clave: 'enviando', texto: 'Enviando', clase: 'bg-primary/10 text-primary', icono: 'cloud_upload' }
  if (registro.venta_id) {
    return {
      clave: 'registrada',
      texto: 'Registrada, falta el comprobante',
      clase: 'bg-primary/10 text-primary',
      icono: 'receipt',
    }
  }
  if ((registro.intentos ?? 0) > 0) {
    return {
      clave: 'reintentando',
      texto: `Reintentando (${registro.intentos})`,
      clase: 'bg-amber-100 text-amber-800',
      icono: 'schedule',
    }
  }
  return {
    clave: 'local',
    texto: 'Guardada en el equipo',
    clase: 'bg-surface-container text-on-surface-variant',
    icono: 'save',
  }
}
