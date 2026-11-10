import { createBrowserRouter } from 'react-router'
import { InicioPanel, RequireAuth, RequireRol, SoloInvitado } from './guards/guards'
import Raiz from './Raiz'
import {
  AlmacenDetalle,
  Analitica,
  Cambios,
  Almacenes,
  Bitacora,
  Catalogo,
  Catalogos,
  Checkout,
  Ciudades,
  CompraExitosa,
  ComprobanteTicket,
  Comprobantes,
  DetallePedido,
  FichaProducto,
  Inicio,
  InventarioGlobal,
  Login,
  MiCaja,
  MiPerfil,
  MiPlan,
  NuevoCambio,
  ModeloForm,
  MisProductos,
  MisPedidos,
  MisReservas,
  NuevaReserva,
  PedidoOnlineDetalle,
  PedidosOnline,
  PlataformaEmpresas,
  PlataformaPlanes,
  ProductosAdmin,
  PromocionesAdmin,
  PromocionesPublica,
  PromocionForm,
  PuntoVenta,
  Proveedores,
  Registro,
  RegistroEmpresa,
  ReportesVoz,
  ReservasSucursal,
  Roles,
  Sincronizacion,
  SucursalesAdmin,
  SucursalesPublica,
  StockSucursal,
  SucursalForm,
  Tablero,
  TicketLocal,
  TrabajadorForm,
  Trabajadores,
  TurnoDetalle,
  Turnos,
  Usuarios,
  VentaDetalleAdmin,
  VentasAdmin,
  VentasSucursal,
} from './paginas'
import LayoutTienda from '@/layouts/LayoutTienda'
import LayoutPanel from '@/layouts/LayoutPanel'
import NoEncontrado from '@/shared/pages/NoEncontrado'
import SinPermiso from '@/shared/pages/SinPermiso'
import ErrorConexion from '@/shared/pages/ErrorConexion'

const conRol = (roles, elemento) => <RequireRol roles={roles}>{elemento}</RequireRol>

export const router = createBrowserRouter([
  {
    element: <Raiz />,
    children: [
      {
        path: '/',
        element: <LayoutTienda />,
        children: [
          { index: true, element: <Inicio /> },
          { path: 'catalogo', element: <Catalogo /> },
          { path: 'producto/:id', element: <FichaProducto /> },
          { path: 'promociones', element: <PromocionesPublica /> },
          { path: 'sucursales', element: <SucursalesPublica /> },
          {
            element: <RequireAuth />,
            children: [
              { path: 'checkout', element: <Checkout /> },
              { path: 'compra-exitosa/:id', element: <CompraExitosa /> },
              { path: 'pedidos', element: <MisPedidos /> },
              { path: 'pedidos/:id', element: <DetallePedido /> },
              { path: 'reservas', element: <MisReservas /> },
              { path: 'reservas/nueva', element: <NuevaReserva /> },
              { path: 'perfil', element: <MiPerfil /> },
            ],
          },
        ],
      },

      {
        path: 'panel',
        element: (
          <RequireAuth>
            <RequireRol roles={['administrador', 'encargado', 'cajero', 'proveedor']}>
              <LayoutPanel />
            </RequireRol>
          </RequireAuth>
        ),
        children: [
          {
            index: true,
            element: (
              <InicioPanel>
                <Tablero />
              </InicioPanel>
            ),
          },
          { path: 'bitacora', element: conRol(['administrador'], <Bitacora />) },
          { path: 'mi-plan', element: conRol(['administrador'], <MiPlan />) },
          { path: 'reportes', element: conRol(['administrador', 'encargado', 'cajero'], <ReportesVoz />) },
          { path: 'analitica', element: conRol(['administrador', 'encargado'], <Analitica />) },

          { path: 'catalogos', element: conRol(['administrador'], <Catalogos />) },
          { path: 'roles', element: conRol(['administrador'], <Roles />) },
          { path: 'usuarios', element: conRol(['administrador'], <Usuarios />) },
          {
            path: 'trabajadores',
            element: <RequireRol roles={['administrador']} />,
            children: [
              { index: true, element: <Trabajadores /> },
              { path: 'nuevo', element: <TrabajadorForm /> },
              { path: ':id/editar', element: <TrabajadorForm /> },
            ],
          },
          { path: 'proveedores', element: conRol(['administrador'], <Proveedores />) },
          { path: 'ciudades', element: conRol(['administrador'], <Ciudades />) },
          {
            path: 'sucursales',
            element: <RequireRol roles={['administrador']} />,
            children: [
              { index: true, element: <SucursalesAdmin /> },
              { path: 'nueva', element: <SucursalForm /> },
              { path: ':id/editar', element: <SucursalForm /> },
            ],
          },

          {
            path: 'productos',
            element: <RequireRol roles={['administrador']} />,
            children: [
              { index: true, element: <ProductosAdmin /> },
              { path: 'nuevo', element: <ModeloForm /> },
              { path: ':id/editar', element: <ModeloForm /> },
            ],
          },
          {
            path: 'mis-productos',
            element: <RequireRol roles={['proveedor', 'administrador']} />,
            children: [
              { index: true, element: <MisProductos /> },
              { path: 'nuevo', element: <ModeloForm /> },
              { path: ':id/editar', element: <ModeloForm /> },
            ],
          },
          { path: 'inventario', element: conRol(['administrador'], <InventarioGlobal />) },
          { path: 'stock', element: conRol(['encargado', 'administrador'], <StockSucursal />) },
          {
            path: 'almacenes',
            element: <RequireRol roles={['administrador', 'encargado']} />,
            children: [
              { index: true, element: <Almacenes /> },
              { path: ':id', element: <AlmacenDetalle /> },
            ],
          },

          {
            path: 'promociones',
            element: <RequireRol roles={['administrador']} />,
            children: [
              { index: true, element: <PromocionesAdmin /> },
              { path: 'nueva', element: <PromocionForm /> },
              { path: ':id/editar', element: <PromocionForm /> },
            ],
          },

          {
            path: 'ventas',
            element: <RequireRol roles={['administrador']} />,
            children: [
              { index: true, element: <VentasAdmin /> },
              { path: ':id', element: <VentaDetalleAdmin /> },
            ],
          },
          {
            path: 'pedidos',
            element: <RequireRol roles={['administrador', 'encargado', 'cajero']} />,
            children: [
              { index: true, element: <PedidosOnline /> },
              { path: ':id', element: <PedidoOnlineDetalle /> },
            ],
          },
          { path: 'ventas-sucursal', element: conRol(['encargado', 'administrador'], <VentasSucursal />) },
          {
            path: 'cambios',
            element: <RequireRol roles={['administrador', 'encargado', 'cajero']} />,
            children: [
              { index: true, element: <Cambios /> },
              { path: 'nuevo', element: <NuevoCambio /> },
            ],
          },
          { path: 'comprobantes', element: conRol(['administrador', 'encargado', 'cajero'], <Comprobantes />) },

          {
            path: 'pos',
            element: <RequireRol roles={['cajero', 'administrador']} />,
            children: [
              { index: true, element: <PuntoVenta /> },
              { path: 'comprobante/local/:idCliente', element: <TicketLocal /> },
              { path: 'comprobante/:id', element: <ComprobanteTicket /> },
            ],
          },

          { path: 'caja', element: conRol(['cajero', 'administrador'], <MiCaja />) },
          { path: 'sincronizacion', element: conRol(['cajero', 'administrador'], <Sincronizacion />) },
          {
            path: 'turnos',
            element: <RequireRol roles={['administrador', 'encargado', 'cajero']} />,
            children: [
              { index: true, element: <Turnos /> },
              { path: ':id', element: <TurnoDetalle /> },
            ],
          },

          { path: 'reservas-sucursal', element: conRol(['encargado', 'administrador'], <ReservasSucursal />) },

          { path: '*', element: <NoEncontrado /> },
        ],
      },

      {
        path: 'plataforma',
        element: (
          <RequireAuth>
            <RequireRol roles={['superadmin']}>
              <LayoutPanel />
            </RequireRol>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <PlataformaEmpresas /> },
          { path: 'planes', element: <PlataformaPlanes /> },
          { path: '*', element: <NoEncontrado /> },
        ],
      },

      {
        path: 'login',
        element: (
          <SoloInvitado>
            <Login />
          </SoloInvitado>
        ),
      },
      {
        path: 'registro',
        element: (
          <SoloInvitado>
            <Registro />
          </SoloInvitado>
        ),
      },
      {
        path: 'registro-empresa',
        element: (
          <SoloInvitado>
            <RegistroEmpresa />
          </SoloInvitado>
        ),
      },

      { path: 'sin-permiso', element: <SinPermiso /> },
      { path: 'error-conexion', element: <ErrorConexion /> },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
])
