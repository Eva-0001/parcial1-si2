import { useState } from 'react'
import { http } from '@/core/api/http'
import { descargarParaSinConexion, ultimaDescarga, useDescargaStore } from '@/core/offline/datos-locales'
import { useConexionStore } from '@/core/offline/conexion.store'
import { toast } from '@/core/stores/toast.store'

const fecha = (iso) => new Date(iso).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Descarga a IndexedDB el catálogo completo (productos, variantes, precios,
 * tallas, colores, sucursales, promociones y el stock de cada sucursal) para
 * consultar y vender sin conexión, y muestra de cuándo son esos datos.
 */
export default function DatosSinConexion() {
  const enLinea = useConexionStore((s) => s.enLinea)
  // La descarga automática (al entrar al panel) también actualiza esta tarjeta.
  const ultimaEnMemoria = useDescargaStore((s) => s.ultima)
  const [descargaLocal, setDescarga] = useState(() => ultimaDescarga())
  const descarga = ultimaEnMemoria ?? descargaLocal
  const [avance, setAvance] = useState(null)

  const descargar = async () => {
    setAvance({ hechas: 0, previstas: 1 })
    try {
      const resumen = await descargarParaSinConexion(http, (hechas, previstas) => setAvance({ hechas, previstas }))
      setDescarga(resumen)
      toast.exito('Datos guardados: el catálogo y el stock se pueden consultar sin conexión')
    } catch (e) {
      toast.error(`No se pudo completar la descarga: ${e.message}`)
    } finally {
      setAvance(null)
    }
  }

  return (
    <section className="tarjeta mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 text-primary">download_for_offline</span>
        <div>
          <h2 className="font-semibold text-on-surface">Datos para trabajar sin conexión</h2>
          <p className="text-sm text-on-surface-variant">
            {descarga
              ? `Última descarga: ${fecha(descarga.fecha)} (${descarga.sucursales} sucursales). Sin red, el catálogo, los precios y el stock se muestran con esa fecha.`
              : 'Todavía no se descargaron. Sin red solo se verá lo que ya se consultó antes en este equipo.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn-secundario shrink-0"
        disabled={!enLinea || avance !== null}
        onClick={descargar}
      >
        <span
          className={
            avance ? 'material-symbols-outlined animate-spin text-[18px]' : 'material-symbols-outlined text-[18px]'
          }
        >
          {avance ? 'progress_activity' : 'download'}
        </span>
        {avance
          ? `Descargando ${avance.hechas}/${avance.previstas}`
          : descarga
            ? 'Actualizar datos'
            : 'Descargar datos'}
      </button>
    </section>
  )
}
