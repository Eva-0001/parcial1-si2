import { ETIQUETA_METODO, ICONO_METODO, METODOS_PAGO } from '@/features/pos/pos.utils'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { claseDiferencia, etiquetaDiferencia } from '../caja.utils'

function Dato({ icono, etiqueta, valor, detalle = null, destacado = false }) {
  return (
    <div className={destacado ? 'rounded-xl bg-primary p-4 text-on-primary' : 'rounded-xl bg-surface-container-low p-4'}>
      <p
        className={
          destacado
            ? 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-90'
            : 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant'
        }
      >
        <span className="material-symbols-outlined text-[16px]">{icono}</span>
        {etiqueta}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {detalle && <p className={destacado ? 'text-xs opacity-90' : 'text-xs text-on-surface-variant'}>{detalle}</p>}
    </div>
  )
}

/** Arqueo del turno: de dónde sale el efectivo que debería haber en caja y, si cerró, cómo cuadró. */
export default function ResumenArqueo({ turno, resumen }) {
  const cerrado = Boolean(turno.cerrado_en)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato icono="account_balance_wallet" etiqueta="Monto inicial" valor={monedaBs(turno.monto_inicial)} />
        <Dato
          icono="receipt_long"
          etiqueta="Ventas"
          valor={monedaBs(resumen.total_ventas)}
          detalle={`${resumen.ventas} ${resumen.ventas === 1 ? 'venta' : 'ventas'}`}
        />
        <Dato icono="south_west" etiqueta="Ingresos de caja" valor={monedaBs(resumen.ingresos)} />
        <Dato icono="north_east" etiqueta="Egresos de caja" valor={monedaBs(resumen.egresos)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {METODOS_PAGO.map((m) => (
          <div key={m} className="flex items-center gap-3 rounded-xl border border-outline-variant p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-primary">
              <span className="material-symbols-outlined">{ICONO_METODO[m]}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface-variant">{ETIQUETA_METODO[m]}</p>
              <p className="font-bold tabular-nums text-on-surface">{monedaBs(resumen.por_metodo[m].total)}</p>
            </div>
            <span className="chip-suave">{resumen.por_metodo[m].cantidad}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Dato
          destacado
          icono="savings"
          etiqueta="Efectivo esperado"
          valor={monedaBs(cerrado ? turno.efectivo_esperado : resumen.efectivo_esperado)}
          detalle="Inicial + ventas en efectivo + ingresos − egresos"
        />
        {cerrado && (
          <>
            <Dato icono="payments" etiqueta="Efectivo contado" valor={monedaBs(turno.efectivo_contado)} />
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Diferencia · {etiquetaDiferencia(turno.diferencia)}
              </p>
              <p className={`mt-1 text-2xl ${claseDiferencia(turno.diferencia)}`}>{monedaBs(turno.diferencia)}</p>
              {turno.observacion && <p className="text-xs text-on-surface-variant">{turno.observacion}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
