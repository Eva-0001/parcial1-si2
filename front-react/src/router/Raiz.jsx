import { Suspense } from 'react'
import { Outlet } from 'react-router'
import Toasts from '@/shared/components/Toasts'
import SesionExpirada from '@/shared/components/SesionExpirada'
import EstadoConexion from '@/shared/components/EstadoConexion'
import { useSincronizacionAutomatica } from '@/core/offline/cola-ventas.store'

export default function Raiz() {
  useSincronizacionAutomatica()

  return (
    <>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <Toasts />
      <SesionExpirada />
      <EstadoConexion />
    </>
  )
}
