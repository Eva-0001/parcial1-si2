import { useState } from 'react'
import { cajaService } from '../services/caja.service'
import { leerMonto } from '../caja.utils'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import { cx } from '@/shared/utils/clases'

export default function ModalAbrirTurno({ sucursales, sucursalInicial = null, onCerrar, onAbierto }) {
  const [sucursalId, setSucursalId] = useState(String(sucursalInicial ?? sucursales[0]?.id ?? ''))
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const montoValido = leerMonto(monto)
  const listo = sucursalId !== '' && montoValido !== null

  const abrir = (e) => {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    setError(null)
    cajaService
      .abrir({ sucursal_id: Number(sucursalId), monto_inicial: montoValido })
      .then((actual) => {
        toast.exito('Turno abierto')
        onAbierto(actual)
      })
      .catch((err) => {
        setGuardando(false)
        setError(err.message)
      })
  }

  return (
    <Modal
      titulo="Abrir turno de caja"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" form="form-abrir-turno" className="btn-primario" disabled={!listo || guardando}>
            {guardando ? 'Abriendo...' : 'Abrir turno'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}
      <form id="form-abrir-turno" onSubmit={abrir} className="space-y-5" noValidate>
        <div>
          <label className="etiqueta" htmlFor="turno-sucursal">
            Sucursal
          </label>
          <select
            id="turno-sucursal"
            className="campo"
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="turno-monto">
            Monto inicial en caja
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-on-surface-variant">
              Bs
            </span>
            <input
              id="turno-monto"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              className={cx('campo py-3 pl-12 text-2xl font-bold tabular-nums', monto && montoValido === null && 'campo-invalido')}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">El efectivo con el que empiezas (cambio en caja).</p>
        </div>
      </form>
    </Modal>
  )
}
