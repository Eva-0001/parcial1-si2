import CampoImagen from '@/shared/components/CampoImagen'
import { monedaBs } from '@/shared/utils/moneda-bs'

/** QR de cobro de la tienda + carga de la foto del comprobante del pago. */
export default function PagoQr({ monto, comprobante, onComprobante, deshabilitado = false }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-5 rounded-xl border border-outline-variant p-5 sm:grid-cols-2">
      <div className="flex flex-col items-center text-center">
        <img
          src="/qr-pago.png"
          alt="QR de cobro de FashionStore"
          className="h-52 w-52 rounded-lg bg-white object-contain p-2 shadow-card"
        />
        <p className="mt-3 font-semibold text-on-surface">Paga {monedaBs(monto)}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-left text-xs text-on-surface-variant">
          <li>Escanea el QR con la app de tu banco.</li>
          <li>Ingresa el monto exacto: {monedaBs(monto)}.</li>
          <li>Guarda una captura del comprobante y súbela aquí.</li>
        </ol>
      </div>
      <div>
        <p className="etiqueta">Comprobante del pago</p>
        <CampoImagen
          deshabilitado={deshabilitado}
          onArchivo={onComprobante}
          onQuitarActual={() => onComprobante(null)}
        />
        <p className="mt-2 text-xs text-on-surface-variant">
          {comprobante
            ? 'Listo. Tu pedido quedará en espera hasta que un encargado revise el comprobante y lo apruebe.'
            : 'Es obligatorio: un encargado lo revisa y, al aprobarlo, tu compra queda confirmada.'}
        </p>
      </div>
    </div>
  )
}
