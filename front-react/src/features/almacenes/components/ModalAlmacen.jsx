import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { almacenesService } from '../services/almacenes.service'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import { errorDe, maximo, nombreUnico, requerido } from '@/shared/utils/formularios'
import { cx } from '@/shared/utils/clases'

export default function ModalAlmacen({ almacen = null, ciudades, nombresOcupados = [], onCerrar, onGuardado }) {
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    mode: 'onTouched',
    defaultValues: {
      nombre: almacen?.nombre ?? '',
      ubicacion: almacen?.ubicacion ?? '',
      ciudad_id: almacen?.ciudad_id != null ? String(almacen.ciudad_id) : '',
    },
  })

  const guardar = (v) => {
    setGuardando(true)
    setErrorGeneral(null)

    const datos = {
      nombre: v.nombre.trim(),
      ubicacion: v.ubicacion.trim() || null,
      ciudad_id: Number(v.ciudad_id),
    }

    const peticion = almacen ? almacenesService.actualizar(almacen.id, datos) : almacenesService.crear(datos)

    peticion
      .then((guardado) => {
        toast.exito(almacen ? 'Almacén actualizado' : 'Almacén creado')
        onGuardado(guardado)
      })
      .catch((e) => {
        setGuardando(false)
        setErrorGeneral(e.message)
      })
  }

  return (
    <Modal
      titulo={almacen ? 'Editar almacén' : 'Nuevo almacén'}
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" form="form-almacen" className="btn-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      {errorGeneral && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {errorGeneral}
        </div>
      )}

      <form id="form-almacen" onSubmit={handleSubmit(guardar)} className="space-y-5" noValidate>
        <div>
          <label className="etiqueta" htmlFor="alm-nombre">
            Nombre
          </label>
          <input
            id="alm-nombre"
            type="text"
            placeholder="Ej. Almacén Central Santa Cruz"
            className={cx('campo', errors.nombre && 'campo-invalido')}
            autoFocus
            {...register('nombre', {
              required: requerido,
              maxLength: maximo(100),
              validate: nombreUnico(
                () => nombresOcupados,
                () => almacen?.nombre ?? null,
              ),
            })}
          />
          {errors.nombre && <p className="mensaje-campo">{errorDe(errors.nombre)}</p>}
        </div>

        <div>
          <label className="etiqueta" htmlFor="alm-ciudad">
            Ciudad
          </label>
          <select
            id="alm-ciudad"
            className={cx('campo', errors.ciudad_id && 'campo-invalido')}
            {...register('ciudad_id', { required: requerido })}
          >
            <option value="">Elige una ciudad</option>
            {ciudades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {errors.ciudad_id && <p className="mensaje-campo">{errorDe(errors.ciudad_id)}</p>}
        </div>

        <div>
          <label className="etiqueta" htmlFor="alm-ubicacion">
            Dirección <span className="font-normal normal-case">(opcional)</span>
          </label>
          <input
            id="alm-ubicacion"
            type="text"
            placeholder="Ej. Parque Industrial, manzana 4"
            className={cx('campo', errors.ubicacion && 'campo-invalido')}
            {...register('ubicacion', { maxLength: maximo(255) })}
          />
          {errors.ubicacion && <p className="mensaje-campo">{errorDe(errors.ubicacion)}</p>}
        </div>
      </form>
    </Modal>
  )
}
