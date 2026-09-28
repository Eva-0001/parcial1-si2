import { useState } from 'react'
import { enviosService } from '../services/envios.service'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'

const MOTIVOS = ['El monto no coincide', 'La imagen no es legible', 'El pago no llegó a la cuenta de la tienda']

export default function ModalRechazarComprobante({ envio, onCerrar, onRechazado }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const rechazar = (e) => {
    e.preventDefault()
    if (!motivo.trim() || guardando) return
    setGuardando(true)
    setError(null)
    enviosService
      .rechazarComprobante(envio.id, motivo.trim())
      .then((actualizado) => {
        toast.info('Comprobante rechazado: el cliente verá el motivo y puede subir otro')
        onRechazado(actualizado)
      })
      .catch((err) => {
        setGuardando(false)
        setError(err.message)
      })
  }

  return (
    <Modal
      titulo="Rechazar comprobante"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Volver
          </button>
          <button
            type="submit"
            form="form-rechazo-comprobante"
            className="btn-primario bg-error hover:bg-error/90"
            disabled={!motivo.trim() || guardando}
          >
            {guardando ? 'Rechazando...' : 'Rechazar'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}
      <form id="form-rechazo-comprobante" onSubmit={rechazar} className="space-y-3" noValidate>
        <p className="text-sm text-on-surface-variant">
          El cliente verá el motivo en su pedido y podrá subir otro comprobante. Las prendas siguen apartadas; si no
          corresponde esperar, cancela el pedido.
        </p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" className="chip hover:text-primary" onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
        <input
          type="text"
          maxLength={255}
          autoFocus
          className="campo"
          placeholder="Motivo del rechazo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-label="Motivo"
        />
      </form>
    </Modal>
  )
}
