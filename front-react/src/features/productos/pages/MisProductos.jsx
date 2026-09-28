import ListaModelos from '../components/ListaModelos'

// Como proveedor puede crear y editar productos, pero no eliminarlos.
export default function MisProductos() {
  return <ListaModelos titulo="Mis productos" base="/panel/mis-productos" puedeEliminar={false} />
}
