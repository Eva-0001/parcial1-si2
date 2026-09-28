import { useState } from 'react'
import PagoQr from './PagoQr'
import ComprobantePagoImagen from './ComprobantePagoImagen'
import { ventasService } from '@/features/ventas/services/ventas.service'
import { toast } from '@/core/stores/toast.store'

/**
 * Pago por QR del cliente, en el detalle de su pedido: en revisión (con su comprobante)
 * o, si todavía no lo subió o se lo rechazaron, el QR para pagar y subir uno nuevo.
 */
export default function EstadoPagoQr({ venta, onEnviado }) {
  const [archivo, setArchivo] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const eventos = venta.envio?.eventos ?? []
  const ultimoRechazo = [...eventos].reverse().find((e) => e.nota?.startsWith('Comprobante rechazado'))
  const rechazado = !venta.tiene_comprobante && ultimoRechazo

  const enviar = () => {
    if (!archivo || enviando) return
    setEnviando(true)
    ventasService
      .subirComprobantePago(venta.id, archivo)
      .then(() => {
        toast.exito('Comprobante enviado. Un encargado lo revisará.')
        setArchivo(null)
        onEnviado()
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setEnviando(false))
  }

  if (venta.tiene_comprobante) {
    return (
      <section className="tarjeta mb-6 border-amber-300 bg-amber-50">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[28px] text-amber-600">hourglass_top</span>
          <div className="flex-1">
            <h2 className="font-semibold text-on-surface">Pago en espera de aprobación</h2>
            <p className="text-sm text-on-surface-variant">
              Recibimos tu comprobante. Un encargado lo revisará y, al aprobarlo, tu compra queda confirmada y empezamos
              a preparar el pedido.
            </p>
          </div>
          <div className="w-32 shrink-0">
            <ComprobantePagoImagen ventaId={venta.id} alto="max-h-32" version={eventos.length} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`tarjeta mb-6 ${rechazado ? 'border-error/40' : 'border-amber-300'}`}>
      <h2 className="flex items-center gap-2 font-semibold text-on-surface">
        <span className={`material-symbols-outlined ${rechazado ? 'text-error' : 'text-amber-600'}`}>
          {rechazado ? 'error' : 'qr_code_2'}
        </span>
        {rechazado ? 'Tu comprobante fue rechazado' : 'Falta el comprobante de tu pago'}
      </h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {rechazado
          ? `${ultimoRechazo.nota.replace('Comprobante rechazado: ', 'Motivo: ')}. Sube un comprobante válido para confirmar tu compra.`
          : 'Paga con el QR y sube la foto del comprobante para que podamos confirmar tu compra.'}
      </p>
      <PagoQr monto={Number(venta.total)} comprobante={archivo} onComprobante={setArchivo} deshabilitado={enviando} />
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primario" disabled={!archivo || enviando} onClick={enviar}>
          <span className="material-symbols-outlined text-[18px]">upload</span>
          {enviando ? 'Enviando...' : 'Enviar comprobante'}
        </button>
      </div>
    </section>
  )
}
