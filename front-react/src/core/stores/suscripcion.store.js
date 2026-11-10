import { create } from 'zustand'
import { empresaService } from '@/features/empresa/services/empresa.service'

/**
 * Plan y estado de la suscripción de la empresa del usuario. Lo usa el panel
 * para ocultar lo que el plan no incluye y avisar si está vencida. La regla de
 * verdad la aplica el backend: esto solo evita mostrar botones que fallarían.
 */
export const useSuscripcionStore = create((set, get) => ({
  datos: null,
  cargando: false,

  async cargar({ forzar = false } = {}) {
    if (get().cargando || (get().datos && !forzar)) return get().datos
    set({ cargando: true })
    try {
      const datos = await empresaService.actual()
      set({ datos, cargando: false })
      return datos
    } catch {
      set({ cargando: false })
      return null
    }
  },

  establecer(datos) {
    set({ datos })
  },

  limpiar() {
    set({ datos: null })
  },
}))

/** true si el plan incluye la función; mientras carga se asume que sí. */
export function useTieneFuncion(funcion) {
  return useSuscripcionStore((s) => (s.datos?.plan ? s.datos.plan[funcion] === true : true))
}
