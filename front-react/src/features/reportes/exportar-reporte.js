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

const TINTA = [17, 24, 39]
const GRIS_TEXTO = [75, 85, 99]
const GRIS_SUAVE = [107, 114, 128]
const GRIS_LINEA = [209, 213, 219]
const FONDO_CAJA = [248, 250, 252]
const FONDO_PRIMARIO_SUAVE = [238, 242, 255]

// Medidas en mm. El encabezado y el pie se repiten en todas las páginas.
const MARGEN = 15
const ALTO_ENCABEZADO = 26
const INICIO_CONTENIDO = ALTO_ENCABEZADO + 8
const ALTO_PIE = 18

export async function exportarPdf(reporte, { empresa = 'FashionStore', usuario } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { encabezados, filas, totales } = datosDeTabla(reporte)

  const doc = new jsPDF({ orientation: encabezados.length > 5 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const anchoUtil = ancho - MARGEN * 2
  const limiteInferior = alto - ALTO_PIE - 4
  const emitido = fechaEmision()
  let y = INICIO_CONTENIDO

  doc.setProperties({ title: reporte.titulo, author: empresa, creator: empresa, subject: 'Reporte de gestión' })

  const fuente = (estilo, tamano, color = TINTA) => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(tamano)
    doc.setTextColor(...color)
  }

  const asegurarEspacio = (necesario) => {
    if (y + necesario <= limiteInferior) return
    doc.addPage()
    y = INICIO_CONTENIDO
  }

  /** Título de sección con una barra de color a la izquierda. */
  const tituloSeccion = (texto) => {
    asegurarEspacio(14)
    doc.setFillColor(...COLOR_PRIMARIO)
    doc.rect(MARGEN, y - 4, 1.2, 5.5, 'F')
    fuente('bold', 11)
    doc.text(texto.toUpperCase(), MARGEN + 4, y)
    y += 6
  }

  const parrafo = (texto) => {
    fuente('normal', 9.5, GRIS_TEXTO)
    const lineas = doc.splitTextToSize(String(texto), anchoUtil)
    for (const linea of lineas) {
      asegurarEspacio(5)
      doc.text(linea, MARGEN, y)
      y += 4.6
    }
    y += 3
  }

  const vinetas = (items, numeradas = false) => {
    items.forEach((item, i) => {
      fuente('normal', 9.5, GRIS_TEXTO)
      const lineas = doc.splitTextToSize(String(item), anchoUtil - 7)
      asegurarEspacio(lineas.length * 4.6 + 1)
      if (numeradas) {
        fuente('bold', 9.5, COLOR_PRIMARIO)
        doc.text(`${i + 1}.`, MARGEN + 1, y)
        fuente('normal', 9.5, GRIS_TEXTO)
      } else {
        doc.setFillColor(...COLOR_PRIMARIO)
        doc.circle(MARGEN + 2, y - 1.2, 0.8, 'F')
      }
      doc.text(lineas, MARGEN + 7, y)
      y += lineas.length * 4.6 + 1.6
    })
    y += 3
  }

  // ---- Bloque de título (solo primera página)
  fuente('normal', 9, GRIS_SUAVE)
  doc.text('REPORTE DE GESTIÓN', MARGEN, y)
  y += 7
  fuente('bold', 17)
  const lineasTitulo = doc.splitTextToSize(reporte.titulo, anchoUtil)
  doc.text(lineasTitulo, MARGEN, y)
  y += lineasTitulo.length * 7 + 2

  // ---- Ficha del reporte: filtros, fecha y quién lo generó
  const ficha = [
    ...lineasDeFiltros(reporte),
    ['Fecha de emisión', emitido],
    ...(usuario ? [['Generado por', usuario]] : []),
    ['Registros', formatoEntero.format(filas.length)],
  ]
  const anchoEtiqueta = 38
  fuente('normal', 9)
  const filasFicha = ficha.map(([etiqueta, valor]) => [etiqueta, doc.splitTextToSize(String(valor), anchoUtil - anchoEtiqueta - 8)])
  const altoFicha = filasFicha.reduce((a, [, lineas]) => a + lineas.length * 4.4 + 1.6, 0) + 6
  doc.setFillColor(...FONDO_CAJA)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGEN, y, anchoUtil, altoFicha, 1.5, 1.5, 'FD')
  let yFicha = y + 6
  for (const [etiqueta, lineas] of filasFicha) {
    fuente('bold', 9, GRIS_SUAVE)
    doc.text(etiqueta, MARGEN + 4, yFicha)
    fuente('normal', 9, TINTA)
    doc.text(lineas, MARGEN + 4 + anchoEtiqueta, yFicha)
    yFicha += lineas.length * 4.4 + 1.6
  }
  y += altoFicha + 9

  // ---- Resumen ejecutivo de la IA, antes de la tabla
  if (reporte.resumen) {
    tituloSeccion('Resumen ejecutivo')
    parrafo(reporte.resumen)
  }

  tituloSeccion('Detalle')

  const alineacion = Object.fromEntries(
    encabezados.map((h, i) => [i, { halign: filas.some((f) => typeof f[i] === 'number') ? 'right' : 'left' }]),
  )

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, top: INICIO_CONTENIDO, bottom: ALTO_PIE + 4 },
    head: [encabezados],
    body: filas.length
      ? filas.map((f) => f.map((c, i) => textoCelda(c, encabezados[i])))
      : [[{ content: 'Sin datos para este reporte.', colSpan: encabezados.length, styles: { halign: 'center' } }]],
    foot: totales ? [totales.map((c, i) => (c === '' ? '' : textoCelda(c, encabezados[i])))] : undefined,
    showFoot: 'lastPage',
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 },
      textColor: TINTA,
      lineColor: GRIS_LINEA,
      lineWidth: { bottom: 0.1 },
    },
    headStyles: { fillColor: COLOR_PRIMARIO, textColor: 255, fontStyle: 'bold', halign: 'center', lineWidth: 0 },
    footStyles: {
      fillColor: FONDO_PRIMARIO_SUAVE,
      textColor: TINTA,
      fontStyle: 'bold',
      lineColor: COLOR_PRIMARIO,
      lineWidth: { top: 0.5 },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: alineacion,
    didParseCell: (data) => {
      if (data.section === 'foot') data.cell.styles.halign = alineacion[data.column.index]?.halign ?? 'left'
    },
  })
  y = doc.lastAutoTable.finalY + 10

  // ---- Hallazgos y recomendaciones de la IA, después de la tabla
  if (reporte.hallazgos?.length) {
    tituloSeccion('Hallazgos')
    vinetas(reporte.hallazgos)
  }
  if (reporte.recomendaciones?.length) {
    tituloSeccion('Recomendaciones')
    vinetas(reporte.recomendaciones, true)
  }

  // ---- Encabezado y pie en todas las páginas (al final, para saber el total)
  const paginas = doc.getNumberOfPages()
  const inicial = (empresa.trim()[0] || 'R').toUpperCase()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)

    // Franja superior de color
    doc.setFillColor(...COLOR_PRIMARIO)
    doc.rect(0, 0, ancho, 3, 'F')

    // Monograma de la empresa
    doc.setFillColor(...COLOR_PRIMARIO)
    doc.roundedRect(MARGEN, 9, 11, 11, 2, 2, 'F')
    fuente('bold', 13, [255, 255, 255])
    doc.text(inicial, MARGEN + 5.5, 16.6, { align: 'center' })

    fuente('bold', 12)
    doc.text(empresa, MARGEN + 14, 13.8)
    fuente('normal', 8, GRIS_SUAVE)
    doc.text('Sistema de gestión comercial', MARGEN + 14, 18.4)

    // Título corto del reporte y fecha a la derecha
    fuente('bold', 9, GRIS_TEXTO)
    const tituloCorto = doc.splitTextToSize(reporte.titulo, anchoUtil / 2)[0]
    doc.text(tituloCorto, ancho - MARGEN, 13.8, { align: 'right' })
    fuente('normal', 8, GRIS_SUAVE)
    doc.text(`Emitido el ${emitido}`, ancho - MARGEN, 18.4, { align: 'right' })

    doc.setDrawColor(...GRIS_LINEA)
    doc.setLineWidth(0.3)
    doc.line(MARGEN, ALTO_ENCABEZADO - 2, ancho - MARGEN, ALTO_ENCABEZADO - 2)

    // Pie: línea, leyenda y numeración
    const yPie = alto - 10
    doc.setDrawColor(...GRIS_LINEA)
    doc.setLineWidth(0.3)
    doc.line(MARGEN, yPie - 5, ancho - MARGEN, yPie - 5)
    fuente('normal', 7.5, GRIS_SUAVE)
    doc.text(`${empresa} · Documento generado automáticamente · Uso interno`, MARGEN, yPie)
    fuente('bold', 8, GRIS_TEXTO)
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, yPie, { align: 'right' })
  }

  doc.save(nombreArchivo(reporte, 'pdf'))
}
