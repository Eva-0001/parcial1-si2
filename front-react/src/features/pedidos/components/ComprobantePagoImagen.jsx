import { useEffect, useState } from 'react'
import { ventasService } from '@/features/ventas/services/ventas.service'

/**
 * Muestra el comprobante del pago por QR. Es un archivo privado: se pide con el token
 * de la sesión y se muestra desde memoria (no hay URL pública).
 */
export default function ComprobantePagoImagen({ ventaId, version = 0, alto = 'max-h-80' }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    let creada = null
    ventasService
      .comprobantePago(ventaId)
      .then((blob) => {
        if (!vigente) return
        creada = URL.createObjectURL(blob)
        setUrl(creada)
      })
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [ventaId, version])

  if (error) return <p className="text-xs text-error">No se pudo cargar el comprobante: {error}</p>
  if (!url) return <div className="h-40 animate-pulse rounded-lg bg-surface-container-low"></div>

  return (
    <a href={url} target="_blank" rel="noreferrer" title="Abrir en tamaño completo" className="block">
      <img
        src={url}
        alt="Comprobante de pago"
        className={`${alto} w-full rounded-lg border border-outline-variant bg-white object-contain`}
      />
      <span className="mt-1 block text-center text-[11px] text-primary">Toca para ver en tamaño completo</span>
    </a>
  )
}
