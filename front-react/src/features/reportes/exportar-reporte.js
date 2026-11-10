/**
 * Exportación de reportes a Excel (.xlsx) y PDF con formato de reporte
 * convencional: empresa, título, filtros aplicados, fecha de emisión, tabla y
 * totales. Las librerías se cargan recién al exportar, así no pesan en la
 * carga de la página.
 */

const COLOR_PRIMARIO = [79, 70, 229] // --color-primary #4f46e5
const COLOR_PRIMARIO_HEX = 'FF4F46E5'
const GRIS_FILA_HEX = 'FFF3F4F6'

/** Columnas que se suman en la fila de totales. */
const SUMABLES = /(\(Bs\)|^Ventas$|^Unidades$|^Prendas$|^Disponibles$|^Reservadas$|^Agotados$)/

const esMonto = (encabezado) => /\(Bs\)/.test(encabezado)
const esPorcentaje = (encabezado) => /%/.test(encabezado)

/** "1234.5" -> 1234.5 ; deja el texto tal cual. */
function aValor(celda) {
  if (typeof celda === 'number') return celda
  if (typeof celda === 'string' && /^-?\d+(\.\d+)?$/.test(celda.trim())) return Number(celda)
  return celda ?? ''
}

const formatoMonto = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatoEntero = new Intl.NumberFormat('es-BO')

function textoCelda(valor, encabezado) {
  if (typeof valor !== 'number') return String(valor)
  if (esMonto(encabezado)) return formatoMonto.format(valor)
  if (esPorcentaje(encabezado)) return `${valor.toFixed(1)} %`
  return formatoEntero.format(valor)
}

function datosDeTabla(reporte) {
  const encabezados = reporte.encabezados
  const filas = reporte.filas.map((fila) => fila.map(aValor))

  const sumables = encabezados.map((h, i) => i > 0 && SUMABLES.test(h) && !/promedio/i.test(h) && filas.every((f) => typeof f[i] === 'number'))
  const totales =
    filas.length > 1 && sumables.some(Boolean)
      ? encabezados.map((_, i) => (i === 0 ? 'Total' : sumables[i] ? filas.reduce((a, f) => a + f[i], 0) : ''))
      : null

  return { encabezados, filas, totales }
}

function fechaEmision() {
  return new Date().toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
}

function nombreArchivo(reporte, extension) {
  const fecha = new Date().toISOString().slice(0, 10)
  const base = (reporte.titulo || reporte.tipo || 'reporte')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base}-${fecha}.${extension}`
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Líneas de filtros: "Periodo: 01/09/2026 al 30/09/2026". */
function lineasDeFiltros(reporte) {
  if (reporte.filtros?.length) return reporte.filtros.map((f) => [f.etiqueta, f.valor])
  return reporte.subtitulo ? [['Alcance', reporte.subtitulo]] : []
}

// ---------------------------------------------------------------- Excel

export async function exportarXlsx(reporte, { empresa = 'FashionStore' } = {}) {
  const { default: ExcelJS } = await import('exceljs')
  const { encabezados, filas, totales } = datosDeTabla(reporte)

  const libro = new ExcelJS.Workbook()
  libro.creator = empresa
  libro.created = new Date()
  const hoja = libro.addWorksheet('Reporte', {
    pageSetup: { orientation: encabezados.length > 5 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1 },
  })

  const ultimaColumna = Math.max(encabezados.length, 2)
  const encabezado = (texto, estilo) => {
    const fila = hoja.addRow([texto])
    hoja.mergeCells(fila.number, 1, fila.number, ultimaColumna)
    fila.getCell(1).font = estilo
    return fila
  }

  encabezado(empresa, { bold: true, size: 14, color: { argb: COLOR_PRIMARIO_HEX } })
  encabezado(reporte.titulo, { bold: true, size: 12 })
  encabezado(`Emitido el ${fechaEmision()}`, { size: 9, color: { argb: 'FF6B7280' } })
  hoja.addRow([])

  const filtros = lineasDeFiltros(reporte)
  if (filtros.length) {
    encabezado('Filtros aplicados', { bold: true, size: 10 })
    for (const [etiqueta, valor] of filtros) {
      const fila = hoja.addRow([etiqueta, valor])
      fila.getCell(1).font = { bold: true, size: 10 }
      fila.getCell(2).font = { size: 10 }
      if (ultimaColumna > 2) hoja.mergeCells(fila.number, 2, fila.number, ultimaColumna)
    }
    hoja.addRow([])
  }

  const borde = { style: 'thin', color: { argb: 'FFD1D5DB' } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }

  const filaTitulos = hoja.addRow(encabezados)
  filaTitulos.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRIMARIO_HEX } }
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    celda.border = bordes
  })
  filaTitulos.height = 22

  const formatoDe = (h) => (esMonto(h) ? '#,##0.00' : esPorcentaje(h) ? '0.0' : '#,##0')

  filas.forEach((datos, indice) => {
    const fila = hoja.addRow(datos)
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      const h = encabezados[columna - 1]
      celda.border = bordes
      if (typeof celda.value === 'number') {
        celda.numFmt = formatoDe(h)
        celda.alignment = { horizontal: 'right' }
      }
      if (indice % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FILA_HEX } }
    })
  })

  if (totales) {
    const fila = hoja.addRow(totales)
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      celda.font = { bold: true }
      celda.border = { ...bordes, top: { style: 'medium', color: { argb: COLOR_PRIMARIO_HEX } } }
      if (typeof celda.value === 'number') {
        celda.numFmt = formatoDe(encabezados[columna - 1])
        celda.alignment = { horizontal: 'right' }
      }
    })
  }

  if (filas.length === 0) {
    const fila = hoja.addRow(['Sin datos para este reporte.'])
    hoja.mergeCells(fila.number, 1, fila.number, ultimaColumna)
    fila.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } }
  }

  // Filtro y encabezado fijo sobre la tabla.
  hoja.autoFilter = {
    from: { row: filaTitulos.number, column: 1 },
    to: { row: filaTitulos.number, column: encabezados.length },
  }
  hoja.views = [{ state: 'frozen', ySplit: filaTitulos.number }]

  // Ancho de columnas según el contenido de la tabla.
  encabezados.forEach((h, i) => {
    const largos = [h, ...filas.map((f) => textoCelda(f[i], h))].map((t) => String(t).length)
    hoja.getColumn(i + 1).width = Math.min(45, Math.max(12, ...largos) + 2)
  })

  // El análisis de la IA, si lo hay, va en una hoja aparte.
  if (reporte.resumen) {
    const analisis = libro.addWorksheet('Análisis')
    analisis.getColumn(1).width = 110
    const agregar = (texto, fuente) => {
      const fila = analisis.addRow([texto])
      fila.getCell(1).alignment = { wrapText: true, vertical: 'top' }
      if (fuente) fila.getCell(1).font = fuente
    }
    agregar(reporte.titulo, { bold: true, size: 12 })
    agregar(reporte.resumen)
    analisis.addRow([])
    if (reporte.hallazgos?.length) {
      agregar('Hallazgos', { bold: true })
      reporte.hallazgos.forEach((h) => agregar(`• ${h}`))
      analisis.addRow([])
    }
    if (reporte.recomendaciones?.length) {
      agregar('Recomendaciones', { bold: true })
      reporte.recomendaciones.forEach((r) => agregar(`• ${r}`))
    }
  }

  const buffer = await libro.xlsx.writeBuffer()
  descargar(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nombreArchivo(reporte, 'xlsx'),
  )
}

// ------------------------------------------------------------------ PDF

export async function exportarPdf(reporte, { empresa = 'FashionStore' } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { encabezados, filas, totales } = datosDeTabla(reporte)

  const doc = new jsPDF({ orientation: encabezados.length > 5 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const margen = 14
  let y = 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...COLOR_PRIMARIO)
  doc.text(empresa, margen, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text(`Emitido el ${fechaEmision()}`, ancho - margen, y, { align: 'right' })

  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(17, 24, 39)
  doc.text(reporte.titulo, margen, y)

  const filtros = lineasDeFiltros(reporte)
  if (filtros.length) {
    y += 6
    doc.setFontSize(9)
    const texto = filtros.map(([e, v]) => `${e}: ${v}`).join('   ·   ')
    const lineas = doc.splitTextToSize(texto, ancho - margen * 2)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(lineas, margen, y)
    y += (lineas.length - 1) * 4
  }

  y += 4
  doc.setDrawColor(...COLOR_PRIMARIO)
  doc.setLineWidth(0.5)
  doc.line(margen, y, ancho - margen, y)

  const alineacion = Object.fromEntries(
    encabezados.map((h, i) => [i, { halign: filas.some((f) => typeof f[i] === 'number') ? 'right' : 'left' }]),
  )

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margen, right: margen, bottom: 18 },
    head: [encabezados],
    body: filas.length
      ? filas.map((f) => f.map((c, i) => textoCelda(c, encabezados[i])))
      : [[{ content: 'Sin datos para este reporte.', colSpan: encabezados.length, styles: { halign: 'center' } }]],
    foot: totales ? [totales.map((c, i) => (c === '' ? '' : textoCelda(c, encabezados[i])))] : undefined,
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [209, 213, 219], lineWidth: 0.1 },
    headStyles: { fillColor: COLOR_PRIMARIO, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [238, 242, 255], textColor: [17, 24, 39], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: alineacion,
    didParseCell: (data) => {
      if (data.section === 'foot') data.cell.styles.halign = alineacion[data.column.index]?.halign ?? 'left'
    },
  })

  // Pie de página en todas las hojas.
  const paginas = doc.getNumberOfPages()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(156, 163, 175)
    doc.text(`${empresa} · ${reporte.titulo}`, margen, alto - 8)
    doc.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 8, { align: 'right' })
  }

  doc.save(nombreArchivo(reporte, 'pdf'))
}
