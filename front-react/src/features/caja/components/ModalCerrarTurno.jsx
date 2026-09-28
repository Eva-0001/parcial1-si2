import { useState } from 'react'
import { cajaService } from '../services/caja.service'
import { claseDiferencia, etiquetaDiferencia, leerMonto, numeroTurno } from '../caja.utils'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

/** Cierre con arqueo: el cajero cuenta el efectivo y se compara contra lo esperado. */
export default function ModalCerrarTurno({ turno, resumen, onCerrar, onCerrado }) {
  const [contado, setContado] = useState('')
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const montoValido = leerMonto(contado)
  const diferencia = montoValido === null ? null : Number(montoValido) - Number(resumen.efectivo_esperado)

  const cerrar = (e) => {
    e.preventDefault()
    if (montoValido === null || guardando) return
    setGuardando(true)
    setError(null)
    cajaService
      .cerrar(turno.id, { efectivo_contado: montoValido, observacion: observacion.trim() || null })
      .then((detalle) => {
        toast.exito('Turno cerrado')
        onCerrado(detalle)
      })
      .catch((err) => {
        setGuardando(false)
        setError(err.message)
      })
  }

  return (
    <Modal
      titulo={`Cerrar turno ${numeroTurno(turno.id)}`}
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-cerrar-turno"
            className="btn-primario"
            disabled={montoValido === null || guardando}
          >
            {guardando ? 'Cerrando...' : 'Cerrar turno'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}
      <form id="form-cerrar-turno" onSubmit={cerrar} className="space-y-5" noValidate>
        <div className="rounded-xl bg-surface-container p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Efectivo esperado</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-on-surface">{monedaBs(resumen.efectivo_esperado)}</p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="cierre-contado">
            Efectivo contado
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-on-surface-variant">
              Bs
            </span>
            <input
              id="cierre-contado"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              className={cx('campo py-3 pl-12 text-2xl font-bold tabular-nums', contado && montoValido === null && 'campo-invalido')}
              value={contado}
              onChange={(e) => setContado(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Cuenta billetes y monedas de la caja, sin incluir tarjeta ni QR.</p>
        </div>

        {diferencia !== null && (
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-4">
            <span className="text-sm font-semibold text-on-surface-variant">{etiquetaDiferencia(diferencia.toFixed(2))}</span>
            <span className={cx('text-2xl', claseDiferencia(diferencia.toFixed(2)))}>{monedaBs(diferencia)}</span>
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="cierre-obs">
            Observación <span className="font-normal normal-case">(opcional)</span>
          </label>
          <textarea
            id="cierre-obs"
            rows={2}
            maxLength={500}
            className="campo resize-none"
            placeholder="Explica cualquier diferencia"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          ></textarea>
        </div>
      </form>
    </Modal>
  )
}
