import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import ModalCobro from '../components/ModalCobro'
import ModalAbrirTurno from '@/features/caja/components/ModalAbrirTurno'
import { cajaService } from '@/features/caja/services/caja.service'
import { emitirTicket } from '../services/cobro.service'
import { unidadesEnColaPorStock, useColaVentasStore, useVentasEnCola } from '@/core/offline/cola-ventas.store'
import { useConexionStore } from '@/core/offline/conexion.store'
import { nuevoUuid } from '@/core/offline/uuid'
import { numeroTurno } from '@/features/caja/caja.utils'
import { stockService } from '@/features/inventario/services/stock.service'
import { sucursalesService } from '@/features/sucursales/services/sucursales.service'
import { ventasService } from '@/features/ventas/services/ventas.service'
import { productosService } from '@/features/productos/services/productos.service'
import { useSucursalActivaStore } from '@/core/stores/sucursal-activa.store'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import { authActual } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import Skeleton from '@/shared/components/Skeleton'
import ModalConfirmacion from '@/shared/components/ModalConfirmacion'
import { useAutofocus } from '@/shared/hooks/useAutofocus'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'
import { aplicarPrecios, faltanParaMayor } from '@/shared/utils/precios'

const ESPERA_SERVIDOR_MS = 10_000

const claseChip = (activo) =>
  cx(
    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
    activo
      ? 'border-primary bg-primary text-on-primary'
      : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low',
  )

export default function PuntoVenta() {
  const navigate = useNavigate()
  const referencias = useReferencias()
  const autofocus = useAutofocus()
  const sucursal = useSucursalActivaStore((s) => s.sucursal)
  const sucursalId = sucursal?.id ?? null

  const [cargandoBase, setCargandoBase] = useState(true)
  const [cargandoStock, setCargandoStock] = useState(true)
  const [error, setError] = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [stock, setStock] = useState([])
  const [turno, setTurno] = useState(null)
  const [turnoSinConexion, setTurnoSinConexion] = useState(false)
  const enLinea = useConexionStore((s) => s.enLinea)
  const enCola = useVentasEnCola(authActual().usuario?.id)
  const vendidoSinSincronizar = unidadesEnColaPorStock(enCola)
  // Stock que queda descontando lo vendido sin conexión y aún no enviado.
  const existencias = (s) => s.cantidad - (vendidoSinSincronizar.get(s.id) ?? 0)
  const [abriendoTurno, setAbriendoTurno] = useState(false)

  const cargando = sucursalId ? cargandoStock : false

  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState(null)

  const idsCategoria = new Set(stock.map((s) => s.producto?.categoria_id).filter((x) => x != null))
  const categorias = referencias.lista('categorias').filter((c) => idsCategoria.has(c.id))

  const texto = busqueda.trim().toLowerCase()
  const productos = stock
    .filter((s) => {
      const p = s.producto
      if (!p) return false
      if (categoriaFiltro !== null && p.categoria_id !== categoriaFiltro) return false
      if (!texto) return true
      return (
        p.nombre.toLowerCase().includes(texto) ||
        (p.sku ?? '').toLowerCase() === texto ||
        String(p.id) === texto.replace('#', '') ||
        (referencias.nombre('tallas', p.talla_id) ?? '').toLowerCase() === texto ||
        (referencias.nombre('colores', p.color_id) ?? '').toLowerCase().includes(texto)
      )
    })
    .sort(
      (a, b) =>
        Number(existencias(b) > 0) - Number(existencias(a) > 0) ||
        (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? '', 'es'),
    )

  const [ticket, setTicket] = useState([])
  // Precio por mayor surtido: se recalcula con cada cambio del ticket (el backend cobra igual).
  const precios = aplicarPrecios(
    ticket.map((i) => ({
      clave: i.stock.id,
      cantidad: i.cantidad,
      precio: i.stock.precio,
      precio_mayor: i.stock.producto?.precio_mayor ?? null,
      minimo_mayor: i.stock.producto?.minimo_mayor,
    })),
  )
  const precioDe = (i) => precios.get(i.stock.id)?.precio ?? Number(i.stock.precio)
  const porMayor = (i) => precios.get(i.stock.id)?.por_mayor ?? false
  const subtotal = ticket.reduce((acc, i) => acc + precioDe(i) * i.cantidad, 0)
  const subtotalLista = ticket.reduce((acc, i) => acc + Number(i.stock.precio) * i.cantidad, 0)
  const faltan = faltanParaMayor(
    ticket.map((i) => ({
      cantidad: i.cantidad,
      precio_mayor: i.stock.producto?.precio_mayor ?? null,
      minimo_mayor: i.stock.producto?.minimo_mayor,
    })),
  )
  const total = subtotal
  const unidades = ticket.reduce((acc, i) => acc + i.cantidad, 0)

  const [clienteId, setClienteId] = useState('')
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [errorCobro, setErrorCobro] = useState(null)

  useEffect(() => {
    Promise.all([sucursalesService.listar(), cajaService.turnoActual(), cargarReferencias()])
      .then(([lista, actual]) => {
        setSucursales(lista)
        setTurno(actual.turno)
        setTurnoSinConexion(Boolean(actual.sin_conexion))
        const activa = useSucursalActivaStore.getState()
        const delTurno = actual.turno ? lista.find((x) => x.id === actual.turno.sucursal_id) : null
        if (delTurno) {
          if (activa.sucursal?.id !== delTurno.id) setCargandoStock(true)
          activa.seleccionar(delTurno)
        } else if (!activa.sucursal && lista.length > 0) {
          activa.seleccionar(lista[0])
        }
        setCargandoBase(false)
      })
      .catch((e) => {
        setError(e.message)
        setCargandoBase(false)
        setCargandoStock(false)
      })
  }, [])

  const pedirStock = useCallback((id, vigente = () => true) => {
    stockService
      .listar({ sucursal_id: id })
      .then((lista) => {
        if (!vigente()) return
        setStock(lista)
        setCargandoStock(false)
      })
      .catch((e) => {
        if (!vigente()) return
        setError(e.message)
        setCargandoStock(false)
      })
  }, [])

  useEffect(() => {
    if (!sucursalId) return
    let vigente = true
    pedirStock(sucursalId, () => vigente)
    return () => {
      vigente = false
    }
  }, [sucursalId, pedirStock])

  const cargar = () => {
    if (!sucursalId) return
    setCargandoStock(true)
    setError(null)
    pedirStock(sucursalId)
  }

  const alAbrirTurno = (actual) => {
    setAbriendoTurno(false)
    setTurno(actual.turno)
    const s = sucursales.find((x) => x.id === actual.turno.sucursal_id)
    if (s && s.id !== sucursalId) {
      setTicket([])
      setCargandoStock(true)
      useSucursalActivaStore.getState().seleccionar(s)
    }
  }

  const cambiarSucursal = (valor) => {
    if (ticket.length > 0 && !window.confirm('Cambiar de sucursal vacía el ticket actual. ¿Continuar?')) return
    const s = sucursales.find((x) => x.id === Number(valor))
    if (!s) return
    setTicket([])
    setCargandoStock(true)
    setError(null)
    useSucursalActivaStore.getState().seleccionar(s)
  }

  const enTicket = (s) => ticket.find((i) => i.stock.id === s.id)?.cantidad ?? 0

  const agregar = (s) => {
    const disponible = existencias(s) - enTicket(s)
    if (disponible <= 0) {
      toast.advertencia('No queda más stock de ese producto en esta sucursal')
      return
    }
    setTicket((lista) => {
      const existe = lista.find((i) => i.stock.id === s.id)
      return existe
        ? lista.map((i) => (i.stock.id === s.id ? { ...i, cantidad: i.cantidad + 1 } : i))
        : [...lista, { stock: s, cantidad: 1 }]
    })
  }

  const alEnter = () => {
    if (productos.length === 1) {
      agregar(productos[0])
      setBusqueda('')
    }
  }

  const cambiarCantidad = (item, delta) => {
    const nueva = item.cantidad + delta
    if (nueva > existencias(item.stock)) {
      toast.advertencia(`Solo hay ${existencias(item.stock)} en stock`)
      return
    }
    setTicket((lista) =>
      lista.map((i) => (i.stock.id === item.stock.id ? { ...i, cantidad: nueva } : i)).filter((i) => i.cantidad > 0),
    )
  }

  const quitar = (item) => setTicket((lista) => lista.filter((i) => i.stock.id !== item.stock.id))

  const cancelarVenta = () => {
    setTicket([])
    setClienteId('')
    setConfirmarCancelar(false)
  }

  const abrirCobro = () => {
    if (ticket.length === 0 || !turno) return
    setErrorCobro(null)
    setCobrando(true)
  }

  const confirmarCobro = (cobro) => {
    const cajero = authActual().usuario
    if (!cajero) return

    const clienteTexto = clienteId.trim()
    const usuarioId = clienteTexto ? Number(clienteTexto) : cajero.id
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      setErrorCobro('El ID de cliente debe ser un número.')
      return
    }

    setProcesando(true)
    setErrorCobro(null)

    const idCliente = nuevoUuid()
    const payload = {
      tipo_venta: 'presencial',
      usuario_id: usuarioId,
      metodo_pago: cobro.metodo,
      detalles: ticket.map((i) => ({ producto_sucursal_id: i.stock.id, cantidad: i.cantidad })),
    }

    const terminar = (ruta) => {
      setProcesando(false)
      setCobrando(false)
      setTicket([])
      setClienteId('')
      navigate(ruta, { state: { cobro } })
    }

    // Sin conexión con el servidor, la venta se guarda en este equipo y se envía sola después.
    const guardarSinConexion = () =>
      useColaVentasStore
        .getState()
        .encolar({
          id_cliente: idCliente,
          usuario_id: cajero.id,
          creada_en: new Date().toISOString(),
          payload,
          ticket: {
            sucursal: sucursal ? { id: sucursal.id, nombre: sucursal.nombre, ubicacion: sucursal.ubicacion } : null,
            items: ticket.map((i) => ({
              nombre: i.stock.producto?.nombre ?? 'Producto',
              talla: referencias.nombre('tallas', i.stock.producto?.talla_id),
              color: referencias.nombre('colores', i.stock.producto?.color_id),
              precio: precioDe(i),
              precio_lista: Number(i.stock.precio),
              cantidad: i.cantidad,
            })),
            total,
            unidades,
            cliente_id: clienteTexto ? usuarioId : null,
            cajero: { nombre: cajero.nombre, apellido: cajero.apellido },
            turno_id: turno?.id ?? null,
          },
        })
        .then(() => {
          toast.advertencia('Sin conexión: la venta quedó guardada y se sincroniza sola al volver la red')
          terminar(`/panel/pos/comprobante/local/${idCliente}`)
        })
        .catch(() => {
          setProcesando(false)
          setErrorCobro('No hay conexión y este navegador no permite guardar la venta. Cobra cuando vuelva la red.')
        })

    // Siempre se intenta enviar (en localhost el servidor responde aunque no haya red).
    // Si no contesta a tiempo se guarda en el equipo; el id_cliente evita duplicarla si
    // justo había llegado.
    ventasService
      .crear({ ...payload, id_cliente: idCliente }, { timeout: ESPERA_SERVIDOR_MS })
      .then((venta) => emitirTicket(venta).then(() => venta))
      .then((venta) => terminar(`/panel/pos/comprobante/${venta.id}`))
      .catch((e) => {
        if (e.status === 0) {
          guardarSinConexion()
          return
        }
        setProcesando(false)
        setErrorCobro(e.status === 400 && /usuario/i.test(e.message) ? 'No existe un cliente con ese ID.' : e.message)
        if (e.status === 409) {
          cargar()
          cajaService.turnoActual().then((actual) => setTurno(actual.turno)).catch(() => {})
        }
      })
  }

  let grilla
  if (!cargandoBase && !turno && !error) {
    grilla = (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
          <span className="material-symbols-outlined text-[32px] text-primary">lock_open</span>
        </div>
        <p className="font-semibold text-on-surface">Abre tu turno de caja para empezar a cobrar</p>
        <p className="mt-1 max-w-sm text-sm text-on-surface-variant">
          {enLinea
            ? 'Registra el efectivo inicial; al terminar cierras el turno y se hace el arqueo.'
            : 'Sin conexión no se puede abrir un turno. Ábrelo cuando vuelva la red; un turno ya abierto sí sigue cobrando offline.'}
        </p>
        <button type="button" className="btn-primario mt-5" disabled={!enLinea} onClick={() => setAbriendoTurno(true)}>
          <span className="material-symbols-outlined text-[18px]">point_of_sale</span> Abrir turno
        </button>
      </div>
    )
  } else if (cargando) {
    grilla = <Skeleton tipo="tarjetas" cantidad={8} />
  } else if (error) {
    grilla = (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[40px] text-error">cloud_off</span>
        <p className="mt-2 font-semibold">No pudimos cargar el stock</p>
        <p className="text-sm text-on-surface-variant">{error}</p>
        <button type="button" className="btn-secundario mt-4" onClick={cargar}>
          Reintentar
        </button>
      </div>
    )
  } else if (productos.length === 0) {
    grilla = (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[40px] text-primary/40">inventory_2</span>
        <p className="mt-2 font-semibold text-on-surface">
          {stock.length === 0 ? 'Esta sucursal no tiene stock cargado' : 'Sin resultados'}
        </p>
        <p className="text-sm text-on-surface-variant">
          {stock.length === 0 ? 'Pídele al encargado que cargue productos.' : 'Prueba con otro nombre o categoría.'}
        </p>
      </div>
    )
  } else {
    grilla = (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {productos.map((s) => {
          const foto = s.producto ? productosService.urlFoto(s.producto) : null
          const n = enTicket(s)
          const disponible = existencias(s) - n
          return (
            <button
              key={s.id}
              type="button"
              className="group relative flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left shadow-card transition-all hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disponible <= 0}
              onClick={() => agregar(s)}
            >
              <div className="aspect-square w-full bg-surface-container">
                {foto ? (
                  <img src={foto} alt={s.producto.nombre} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-primary/40">
                    <span className="material-symbols-outlined text-[40px]">checkroom</span>
                  </div>
                )}
              </div>
              {n > 0 && (
                <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary shadow-card">
                  {n}
                </span>
              )}
              <div className="flex flex-1 flex-col p-2.5">
                <p className="line-clamp-2 text-xs font-semibold leading-snug text-on-surface group-hover:text-primary">
                  {s.producto?.nombre}
                </p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {referencias.nombre('tallas', s.producto?.talla_id)} · {referencias.nombre('colores', s.producto?.color_id)}
                </p>
                <div className="mt-auto flex items-end justify-between pt-1.5">
                  <span className="text-sm font-bold tabular-nums text-on-surface">{monedaBs(s.precio)}</span>
                  <span
                    className={cx(
                      'text-[11px] tabular-nums',
                      disponible <= 0 ? 'text-error' : disponible <= 3 ? 'text-warning' : 'text-on-surface-variant',
                    )}
                  >
                    {disponible} disp.
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col p-6 lg:w-[60%]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[24px] text-on-surface-variant">
                search
              </span>
              <input
                ref={autofocus}
                type="search"
                placeholder="Busca por nombre o escanea el código"
                className="campo py-3.5 pl-12 text-base"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && alEnter()}
              />
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                store
              </span>
              <select
                className="campo w-56 appearance-none py-3.5 pl-9 pr-9 font-semibold"
                value={sucursal?.id ?? ''}
                onChange={(e) => cambiarSucursal(e.target.value)}
                disabled={cargandoBase || Boolean(turno)}
                title={turno ? 'El turno abierto fija la sucursal' : undefined}
                aria-label="Sucursal"
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
                expand_more
              </span>
            </div>
          </div>

          {categorias.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" className={claseChip(categoriaFiltro === null)} onClick={() => setCategoriaFiltro(null)}>
                Todo
              </button>
              {categorias.map((c) => (
                <button key={c.id} type="button" className={claseChip(categoriaFiltro === c.id)} onClick={() => setCategoriaFiltro(c.id)}>
                  {c.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{grilla}</div>
        </section>

        <aside className="flex h-full flex-col border-l border-outline-variant bg-surface-container-lowest lg:w-[40%]">
          <header className="border-b border-outline-variant px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Venta actual</h2>
                <p className="text-xs text-on-surface-variant">{sucursal?.nombre ?? 'Elige una sucursal'}</p>
              </div>
              {turno ? (
                <Link
                  to="/panel/caja"
                  className={cx('chip hover:underline', enLinea && !turnoSinConexion ? 'text-success' : 'text-warning')}
                  title={enLinea ? 'Ver arqueo y cerrar turno' : 'Sin conexión: las ventas se guardan en este equipo'}
                >
                  <span className="material-symbols-outlined text-[14px]">{enLinea ? 'lock_open' : 'cloud_off'}</span>
                  Turno {numeroTurno(turno.id)}
                </Link>
              ) : (
                <span className="chip-suave">Sin turno</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-semibold text-on-surface-variant" htmlFor="pos-cliente">
                Cliente
              </label>
              <input
                id="pos-cliente"
                type="text"
                inputMode="numeric"
                className="campo w-36 py-1.5 text-xs"
                placeholder="ID (opcional)"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              />
              <span className="text-[11px] text-on-surface-variant">
                {clienteId.trim() ? 'Cliente registrado' : 'Consumidor final'}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {ticket.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
                  <span className="material-symbols-outlined text-[32px] text-primary">receipt_long</span>
                </div>
                <p className="font-semibold text-on-surface">Agrega productos para empezar la venta</p>
                <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
                  Toca una tarjeta o escanea un código. Enter agrega el único resultado de la búsqueda.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {ticket.map((item) => (
                  <li key={item.stock.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface">{item.stock.producto?.nombre}</p>
                      <p className="text-xs text-on-surface-variant">
                        {referencias.nombre('tallas', item.stock.producto?.talla_id)} ·{' '}
                        {referencias.nombre('colores', item.stock.producto?.color_id)} ·{' '}
                        {porMayor(item) ? (
                          <span className="font-semibold text-success">
                            <span className="line-through opacity-70">{monedaBs(item.stock.precio)}</span>{' '}
                            {monedaBs(precioDe(item))} c/u por mayor
                          </span>
                        ) : (
                          `${monedaBs(item.stock.precio)} c/u`
                        )}
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border border-outline-variant">
                      <button
                        type="button"
                        className="px-2 py-1 text-on-surface-variant hover:text-primary"
                        onClick={() => cambiarCantidad(item, -1)}
                        aria-label="Menos"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="min-w-7 text-center text-sm font-semibold tabular-nums">{item.cantidad}</span>
                      <button
                        type="button"
                        className="px-2 py-1 text-on-surface-variant hover:text-primary disabled:opacity-40"
                        disabled={item.cantidad >= existencias(item.stock)}
                        onClick={() => cambiarCantidad(item, 1)}
                        aria-label="Más"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                    <span className="w-24 text-right text-sm font-bold tabular-nums">
                      {monedaBs(precioDe(item) * item.cantidad)}
                    </span>
                    <button type="button" className="btn-icono-peligro p-1" title="Quitar" onClick={() => quitar(item)}>
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-outline-variant px-5 py-4">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>
                Subtotal ({unidades} {unidades === 1 ? 'unidad' : 'unidades'})
              </span>
              <span className="tabular-nums">{monedaBs(subtotalLista)}</span>
            </div>
            {subtotalLista > subtotal ? (
              <div className="flex justify-between text-sm font-semibold text-success">
                <span>Precio por mayor</span>
                <span className="tabular-nums">−{monedaBs(subtotalLista - subtotal)}</span>
              </div>
            ) : (
              faltan > 0 &&
              faltan <= 3 && (
                <p className="text-xs text-on-surface-variant">
                  Con {faltan} {faltan === 1 ? 'prenda más' : 'prendas más'} con precio por mayor se cobra por mayor.
                </p>
              )
            )}
            <div className="mt-1 flex items-end justify-between">
              <span className="text-base font-semibold text-on-surface">Total</span>
              <span className="text-4xl font-bold tabular-nums text-on-surface">{monedaBs(total)}</span>
            </div>
            <button
              type="button"
              className="btn-primario mt-4 w-full py-3.5 text-base"
              disabled={ticket.length === 0 || !turno}
              onClick={abrirCobro}
            >
              <span className="material-symbols-outlined text-[22px]">point_of_sale</span> Cobrar
            </button>
            <button
              type="button"
              className="btn-secundario mt-2 w-full border-error text-error hover:bg-error/5"
              disabled={ticket.length === 0}
              onClick={() => setConfirmarCancelar(true)}
            >
              Cancelar venta
            </button>
          </footer>
        </aside>
      </div>

      {cobrando && (
        <ModalCobro
          total={total}
          procesando={procesando}
          error={errorCobro}
          onConfirmar={confirmarCobro}
          onCancelar={() => setCobrando(false)}
        />
      )}

      {abriendoTurno && (
        <ModalAbrirTurno
          sucursales={sucursales}
          sucursalInicial={sucursalId}
          onCerrar={() => setAbriendoTurno(false)}
          onAbierto={alAbrirTurno}
        />
      )}

      {confirmarCancelar && (
        <ModalConfirmacion
          titulo="¿Cancelar la venta actual?"
          mensaje="Se quitan todos los productos del ticket."
          textoBoton="Cancelar venta"
          onConfirmar={cancelarVenta}
          onCancelar={() => setConfirmarCancelar(false)}
        />
      )}
    </>
  )
}
