import { useState } from 'react'
import { cajaService } from '../services/caja.service'
import { leerMonto } from '../caja.utils'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import { cx } from '@/shared/utils/clases'

const TIPOS = [
  { valor: 'ingreso', etiqueta: 'Ingreso', icono: 'south_west', ayuda: 'Ej. cambio adicional que te entregan' },
  { valor: 'egreso', etiqueta: 'Egreso', icono: 'north_east', ayuda: 'Ej. compra de bolsas, retiro a bóveda' },
]

export default function ModalMovimientoCaja({ turnoId, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState('egreso')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const montoValido = leerMonto(monto)
  const listo = montoValido !== null && Number(montoValido) > 0 && motivo.trim() !== ''

  const guardar = (e) => {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    setError(null)
    cajaService
      .registrarMovimiento(turnoId, { tipo, monto: montoValido, motivo: motivo.trim() })
      .then(() => {
        toast.exito(tipo === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
        onGuardado()
      })
      .catch((err) => {
        setGuardando(false)
        setError(err.message)
      })
  }

  return (
    <Modal
      titulo="Movimiento de efectivo"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" form="form-movimiento-caja" className="btn-primario" disabled={!listo || guardando}>
            {guardando ? 'Guardando...' : 'Registrar'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}
      <form id="form-movimiento-caja" onSubmit={guardar} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          {TIPOS.map((t) => (
            <button
              key={t.valor}
              type="button"
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-semibold transition-colors',
                tipo === t.valor
                  ? 'border-primary bg-surface-container text-primary'
                  : 'border-outline-variant text-on-surface hover:border-primary',
              )}
              onClick={() => setTipo(t.valor)}
            >
              <span className="material-symbols-outlined">{t.icono}</span>
              {t.etiqueta}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-on-surface-variant">{TIPOS.find((t) => t.valor === tipo).ayuda}</p>

        <div>
          <label className="etiqueta" htmlFor="mov-monto">
            Monto
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-on-surface-variant">
              Bs
            </span>
            <input
              id="mov-monto"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              className={cx('campo pl-11 tabular-nums', monto && montoValido === null && 'campo-invalido')}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="etiqueta" htmlFor="mov-motivo">
            Motivo
          </label>
          <input
            id="mov-motivo"
            type="text"
            maxLength={255}
            className="campo"
            placeholder="Describe el movimiento"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
