import { useState } from 'react'
import { useColaVentasStore } from '@/core/offline/cola-ventas.store'
import { useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import CampoPassword from '@/shared/components/CampoPassword'
import Modal from '@/shared/components/Modal'
import { monedaBs } from '@/shared/utils/moneda-bs'

/**
 * Conflicto de precio de una venta hecha sin conexión: el precio cambió en el servidor
 * mientras tanto. Se puede registrar con el precio que se cobró, con la autorización de
 * un administrador o encargado. Usuario y contraseña viajan solo en este envío.
 */
export default function ModalAutorizarPrecio({ venta, onCerrar }) {
  const auth = useAuth()
  const autorizar = useColaVentasStore((s) => s.autorizarPrecios)
  const esSupervisor = auth.esAdmin || auth.esEncargado
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const enviar = async (evento) => {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const registro = await autorizar(venta.id_cliente, esSupervisor ? null : { username: username.trim(), password })
      if (registro && registro.estado === 'error') {
        setError(registro.error)
      } else {
        toast.exito('Venta registrada con el precio que se cobró')
        onCerrar()
      }
    } finally {
      setEnviando(false)
      setPassword('')
    }
  }

  const sinDatos = !esSupervisor && (!username.trim() || !password)

  return (
    <Modal
      titulo="Respetar el precio cobrado"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-autorizar-precio" className="btn-primario" disabled={enviando || sinDatos}>
            {enviando ? 'Registrando...' : 'Autorizar y registrar'}
          </button>
        </>
      }
    >
      <form id="form-autorizar-precio" onSubmit={enviar} className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          Mientras no había conexión cambió el precio de estas prendas. La venta se registrará con lo que se cobró y el
          precio de lista actual quedará guardado para auditoría.
        </p>
        {venta.precios?.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant">
                <th className="py-1 font-semibold">Prenda</th>
                <th className="py-1 text-right font-semibold">Cobrado</th>
                <th className="py-1 text-right font-semibold">Precio hoy</th>
              </tr>
            </thead>
            <tbody>
              {venta.precios.map((p) => (
                <tr key={p.producto_sucursal_id} className="border-t border-outline-variant">
                  <td className="py-1.5">{p.producto ?? `Prenda #${p.producto_sucursal_id}`}</td>
                  <td className="py-1.5 text-right tabular-nums">{monedaBs(Number(p.cobrado))}</td>
                  <td className="py-1.5 text-right tabular-nums">{monedaBs(Number(p.actual))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {esSupervisor ? (
          <p className="text-sm text-on-surface">Lo autorizas tú, como {auth.esAdmin ? 'administrador' : 'encargado'}.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-on-surface">Autorización de un administrador o encargado</p>
            <div>
              <label htmlFor="supervisor-usuario" className="etiqueta">
                Usuario
              </label>
              <input
                id="supervisor-usuario"
                className="campo"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="supervisor-password" className="etiqueta">
                Contraseña
              </label>
              <CampoPassword
                id="supervisor-password"
                autocomplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </form>
    </Modal>
  )
}
