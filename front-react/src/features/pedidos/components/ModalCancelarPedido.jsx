import { useState } from 'react'
import { enviosService } from '../services/envios.service'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'

export default function ModalCancelarPedido({ envio, pagadoConTarjeta = false, onCerrar, onCancelado }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const cancelar = (e) => {
    e.preventDefault()
    if (!motivo.trim() || guardando) return
    setGuardando(true)
    setError(null)
    enviosService
      .cancelar(envio.id, motivo.trim())
      .then((r) => {
        toast.exito(r.mensaje)
        onCancelado()
      })
      .catch((err) => {
        setGuardando(false)
        setError(err.message)
      })
  }

  return (
    <Modal
      titulo="Cancelar pedido"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Volver
          </button>
          <button
            type="submit"
            form="form-cancelar-pedido"
            className="btn-primario bg-error hover:bg-error/90"
            disabled={!motivo.trim() || guardando}
          >
            {guardando ? 'Cancelando...' : 'Cancelar pedido'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}
      <form id="form-cancelar-pedido" onSubmit={cancelar} className="space-y-4" noValidate>
        <p className="text-sm text-on-surface-variant">
          Las prendas vuelven al stock de la sucursal.
          {pagadoConTarjeta && ' El pago con tarjeta se reembolsa automáticamente.'}
        </p>
        <div>
          <label className="etiqueta" htmlFor="cancelar-motivo">
            Motivo
          </label>
          <input
            id="cancelar-motivo"
            type="text"
            maxLength={255}
            autoFocus
            className="campo"
            placeholder="Ej. Me equivoqué de talla"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
