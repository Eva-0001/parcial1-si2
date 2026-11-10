import { cx } from '@/shared/utils/clases'
import { estadoDe } from '../estado-operacion'

export default function EstadoOperacion({ registro, enviando = false }) {
  const e = estadoDe(registro, enviando)
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', e.clase)}>
      <span className={cx('material-symbols-outlined text-[14px]', e.clave === 'enviando' && 'animate-pulse')}>
        {e.icono}
      </span>
      {e.texto}
    </span>
  )
}
