import { ESTADO_ENVIO, ETIQUETA_MODALIDAD, PASOS_ENVIO } from '../envios.utils'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

/** Línea de tiempo del pedido y los datos de entrega. */
export default function SeguimientoEnvio({ envio }) {
  const cancelado = envio.estado === 'cancelado'
  const pasos = PASOS_ENVIO[envio.modalidad]
  const alcanzado = cancelado ? -1 : pasos.indexOf(envio.estado)
  const eventos = envio.eventos ?? []
  const fechaDe = (estado) => eventos.find((e) => e.estado === estado)?.creado_en ?? null
  const eventoCancelacion = eventos.find((e) => e.estado === 'cancelado')

  return (
    <div className="tarjeta">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="material-symbols-outlined text-[20px] text-primary">
            {envio.modalidad === 'domicilio' ? 'local_shipping' : 'storefront'}
          </span>
          {ETIQUETA_MODALIDAD[envio.modalidad]}
        </h2>
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            ESTADO_ENVIO[envio.estado].chip,
          )}
        >
          <span className="material-symbols-outlined text-[14px]">{ESTADO_ENVIO[envio.estado].icono}</span>
          {ESTADO_ENVIO[envio.estado].etiqueta}
        </span>
      </div>

      {cancelado ? (
        <div className="rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm">
          <p className="font-semibold text-error">Pedido cancelado</p>
          <p className="text-on-surface-variant">
            {envio.motivo_cancelacion}
            {eventoCancelacion ? ` · ${formatoFecha(eventoCancelacion.creado_en, 'dd/MM/yyyy HH:mm')}` : ''}
          </p>
        </div>
      ) : (
        <ol className="grid grid-cols-4 gap-2">
          {pasos.map((paso, i) => {
            const hecho = i <= alcanzado
            const fecha = fechaDe(paso)
            return (
              <li key={paso} className="flex flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span
                    className={cx('h-0.5 flex-1', i === 0 ? 'invisible' : hecho ? 'bg-primary' : 'bg-outline-variant')}
                  ></span>
                  <span
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      hecho ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant',
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">{ESTADO_ENVIO[paso].icono}</span>
                  </span>
                  <span
                    className={cx(
                      'h-0.5 flex-1',
                      i === pasos.length - 1 ? 'invisible' : i < alcanzado ? 'bg-primary' : 'bg-outline-variant',
                    )}
                  ></span>
                </div>
                <p
                  className={cx('mt-1.5 text-xs font-semibold', hecho ? 'text-on-surface' : 'text-on-surface-variant')}
                >
                  {ESTADO_ENVIO[paso].etiqueta}
                </p>
                <p className="text-[11px] text-on-surface-variant">{fecha ? formatoFecha(fecha, 'dd/MM HH:mm') : ''}</p>
              </li>
            )
          })}
        </ol>
      )}

      <dl className="mt-5 space-y-1.5 border-t border-outline-variant pt-4 text-sm">
        {envio.modalidad === 'domicilio' ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Recibe</dt>
              <dd className="text-right font-medium">
                {envio.destinatario} · {envio.telefono}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Dirección</dt>
              <dd className="text-right font-medium">
                {envio.direccion}
                {envio.ciudad ? `, ${envio.ciudad.nombre}` : ''}
                {envio.referencia && <span className="block text-xs text-on-surface-variant">{envio.referencia}</span>}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-4">
            <dt className="text-on-surface-variant">Retirar en</dt>
            <dd className="text-right font-medium">
              {envio.sucursal?.nombre}
              {envio.sucursal?.ubicacion && (
                <span className="block text-xs text-on-surface-variant">{envio.sucursal.ubicacion}</span>
              )}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-on-surface-variant">Costo de envío</dt>
          <dd className="font-medium tabular-nums">{Number(envio.costo) > 0 ? monedaBs(envio.costo) : 'Sin costo'}</dd>
        </div>
      </dl>
    </div>
  )
}
