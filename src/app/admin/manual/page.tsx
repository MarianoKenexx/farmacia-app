'use client'
import Link from 'next/link'
import { BookOpen, ArrowLeft } from 'lucide-react'

// ════════════════════════════════════════════════════════════════════
// Manual de uso de la app.
//
// Esta página se actualiza a mano cada vez que agregamos o cambiamos
// una funcionalidad importante de la app (es parte del trabajo de cada
// cambio, no algo aparte). "ÚLTIMA_ACTUALIZACION" de más abajo indica
// cuándo se revisó por última vez.
// ════════════════════════════════════════════════════════════════════

const ULTIMA_ACTUALIZACION = '27/10/2026'

const SECCIONES = [
  { id: 'roles', titulo: '1. Roles y quién ve qué' },
  { id: 'pos', titulo: '2. Punto de Venta' },
  { id: 'comandas', titulo: '3. Comandas (historial completo)' },
  { id: 'obras-sociales', titulo: '4. Ventas con obra social / cobertura' },
  { id: 'productos', titulo: '5. Productos' },
  { id: 'stock', titulo: '6. Stock' },
  { id: 'vencimientos', titulo: '7. Vencimientos' },
  { id: 'proveedores', titulo: '8. Proveedores y compras' },
  { id: 'clientes', titulo: '9. Clientes' },
  { id: 'recompras', titulo: '10. Recompras (recordatorio de recompra)' },
  { id: 'caja', titulo: '11. Caja (apertura, cierre y arqueo)' },
  { id: 'historial', titulo: '12. Historial de cajas' },
  { id: 'reportes', titulo: '13. Reportes' },
  { id: 'recetas-pendientes', titulo: '14. Recetas pendientes de reclamo' },
  { id: 'auditoria-precios', titulo: '15. Auditoría de cambios de precio' },
  { id: 'devoluciones', titulo: '16. Devoluciones' },
  { id: 'alertas', titulo: '17. Alertas' },
  { id: 'configuracion', titulo: '18. Configuración' },
  { id: 'respaldo', titulo: '19. Respaldo de la base de datos' },
  { id: 'actualizar-precios', titulo: '20. Actualizar precios desde archivo (droguería)' },
  { id: 'seguridad', titulo: '21. Por qué está armado así (seguridad y antifraude)' },
  { id: 'reiniciar', titulo: '22. Reiniciar la app' },
]

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-3">
      <h2 className="text-lg font-bold text-white">{titulo}</h2>
      <div className="text-sm text-slate-300 leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

export default function ManualPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al panel admin
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-violet-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" /> Manual de uso
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Cómo funciona cada parte de la app, explicado en criollo. Esta página se va actualizando
          cada vez que agregamos o cambiamos algo. Última revisión: <b className="text-slate-300">{ULTIMA_ACTUALIZACION}</b>.
        </p>
      </div>

      {/* Índice */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Índice</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {SECCIONES.map(s => (
            <a key={s.id} href={`#${s.id}`} className="text-sm text-violet-300 hover:text-violet-200 hover:underline">
              {s.titulo}
            </a>
          ))}
        </div>
      </div>

      <Seccion id="roles" titulo="1. Roles y quién ve qué">
        <p>Hay tres tipos de usuario:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b className="text-white">Cajero</b>: puede vender y cobrar (pantalla "Punto de Venta"), ver/cargar productos y stock (si se lo habilitás), y abrir/cerrar caja. <b>No puede ver</b> el Dashboard, Historial, Reportes, Recetas pendientes, Auditoría de precios, Proveedores/compras ni Configuración, aunque intente escribir la dirección a mano. Esto es a propósito: así no puede saber cuánto "debería" dar la caja y ajustar el conteo para que cierre.</li>
          <li><b className="text-white">Administrador</b>: ve todo lo anterior más Dashboard, Historial, Reportes, Recetas pendientes (puede avanzar pendiente → presentado), Auditoría de precios, Proveedores y compras, y puede anular ventas o registrar devoluciones.</li>
          <li><b className="text-white">Superadmin (dueño)</b>: todo lo de administrador, más el Panel Admin (usuarios, categorías, esta misma página), borrar cajas/ventas, y es el único que puede confirmar que una obra social efectivamente pagó (ver sección 14).</li>
        </ul>
        <p>A cada cajero/administrador también se le pueden prender o apagar secciones puntuales (por ejemplo, un cajero que además puede tocar Stock) desde Panel Admin → Usuarios.</p>
      </Seccion>

      <Seccion id="pos" titulo="2. Punto de Venta">
        <p>Es la pantalla donde se vende y se cobra, todo junto en un solo paso. Se busca el producto por nombre o se escanea el código de barras, se arma el carrito, se elige el <b>método de pago</b> (efectivo, débito, crédito, transferencia, QR o fiado — fiado solo si hay un cliente elegido) y se aprieta <b>"Cobrar"</b>. Eso descuenta el stock, registra la venta y <b>imprime el ticket</b> con el método de pago, para entregárselo al cliente.</p>
        <p>A la venta se le puede asociar un <b>cliente</b> y una <b>obra social</b> (opcionales) antes de cobrar.</p>
        <p>Si un producto tiene <b>unidades por envase</b> cargadas (por ejemplo, una caja de 30 comprimidos), se puede vender "fraccionado" (por unidad suelta) además de la caja cerrada — salvo que sea bajo receta (ver más abajo).</p>
        <p>Si se escanea un código que no existe en el sistema, se abre un formulario rápido para darlo de alta en el momento (nombre, laboratorio, precio, stock inicial) y seguir con la venta.</p>
        <p>Recién cobrada una venta, quien la hizo tiene <b>15 minutos</b> para pedir su anulación (botón "Anular esta venta") si se equivocó — un supervisor tiene que confirmar con su PIN. Pasado ese tiempo, la anulación se hace desde Historial.</p>
      </Seccion>

      <Seccion id="comandas" titulo="3. Comandas (historial completo)">
        <p>Es una pantalla aparte, pensada para administradores, que muestra <b>todas las ventas de todos los días</b> (no solo las de la caja abierta), con su estado: cobrada o anulada. Es otra forma de tener "registrado y a la vista" todo lo vendido, sin importar en qué caja ni qué día fue — útil para buscar algo puntual sin tener que revisar caja por caja.</p>
        <p>Se puede filtrar por período (hoy/semana/mes/todo), por estado, y buscar por número de venta o nombre de cliente. Tocando una fila se despliega el detalle con los productos de esa venta.</p>
        <p>Desde ahí se puede <b>reimprimir el ticket</b> de cualquier venta, y también <b>anular</b> una, con motivo y PIN de un supervisor — igual que en Punto de Venta.</p>
      </Seccion>

      <Seccion id="obras-sociales" titulo="4. Ventas con obra social / cobertura">
        <p>Cada producto tiene un <b>tipo de venta</b>: venta libre (verde), bajo receta (ámbar) o receta archivada (rojo). Los bajo receta o receta archivada nunca se pueden fraccionar: siempre se vende el envase cerrado completo, aunque tenga unidades por caja cargadas.</p>
        <p>Al vender se puede elegir una obra social para la venta. Cada producto del carrito tiene un check "Con cobertura" (tildado por defecto en los que son bajo receta, destildado en venta libre) — así, en una misma venta, un producto puede tener descuento de obra social y otro no, aunque haya una sola obra social elegida.</p>
        <p>Al elegir la obra social aparece un segundo desplegable con el <b>%</b> a aplicar (0 a 100), prellenado con el % "sugerido" que tenga cargado esa obra social en Configuración, pero se puede cambiar ahí mismo — el mismo producto puede cubrirse distinto según la obra social, e incluso según el caso dentro de la misma obra social, así que queda a criterio de quien cobra. El descuento se calcula sobre los productos tildados "Con cobertura" usando ese %.</p>
        <p>Lo que paga el cliente (en efectivo/tarjeta) es el total ya con el descuento aplicado — eso es lo que ingresa como "venta" en la caja. La parte que cubre la obra social queda registrada aparte como <b>pendiente de reclamo</b> (ver sección 14), porque esa plata todavía no entró, hay que reclamarla. El % que se usó queda guardado en esa venta puntual, así que si más adelante cambiás el % sugerido de la obra social en Configuración, las ventas viejas no se alteran.</p>
      </Seccion>

      <Seccion id="productos" titulo="5. Productos">
        <p>Alta, baja y edición de productos: nombre, laboratorio, categoría, código de barras, precio de costo, precio de venta, IVA, stock mínimo (para alertas), unidades por envase (para fraccionar) y tipo de venta (libre / receta / receta archivada).</p>
        <p>Si el producto se fracciona, se puede cargar además un <b>precio por unidad suelta</b> (opcional). Si se deja vacío, la unidad suelta sale a la parte proporcional de la caja (precio de caja ÷ unidades); si se carga un valor, se cobra siempre ese precio fijo al vender por unidad, sin importar el precio de la caja.</p>
        <p>Cualquier cambio de precio de venta o de costo queda anotado automáticamente en la Auditoría de precios (sección 15), aunque se edite el producto desde acá.</p>
        <p>La foto del producto se achica y comprime sola apenas se la carga (antes de subirla), para no gastar de más el espacio de almacenamiento con fotos de celular pesadas.</p>
      </Seccion>

      <Seccion id="stock" titulo="6. Stock">
        <p>Muestra el stock actual de cada producto y permite hacer ajustes manuales (por ejemplo, si se rompió algo o hubo un error de conteo). Cada movimiento de stock (venta, devolución, anulación, compra, ajuste manual) queda en un historial con quién lo hizo y por qué.</p>
      </Seccion>

      <Seccion id="vencimientos" titulo="7. Vencimientos">
        <p>Desde Stock → pestaña "Vencimientos" se pueden cargar lotes con su fecha de vencimiento y cantidad. Es un control aparte, pensado solo para avisar — no reemplaza ni reduce automáticamente el stock general del producto.</p>
        <p>Cada lote se marca en verde (sin problema), ámbar (vence en 15 días o menos) o rojo (ya vencido). Cuando hay lotes en esas últimas dos categorías, aparece un aviso arriba de la pantalla de Stock. Al retirar un lote de circulación (porque se vendió, se descartó o venció), se lo marca como "Dar de baja" para que deje de contar en los avisos.</p>
      </Seccion>

      <Seccion id="proveedores" titulo="8. Proveedores y compras">
        <p>Se cargan los proveedores (droguerías) con sus datos de contacto, y se registran las compras que se les hacen: qué producto, cuánta cantidad y a qué costo. Al guardar una compra, el sistema suma automáticamente ese stock y actualiza el precio de costo del producto — no hace falta cargarlo dos veces. Queda un historial de compras con fecha, proveedor, factura, quién la registró y el total.</p>
        <p>Al registrar una compra se puede adjuntar una <b>foto de la factura</b> (opcional) — queda guardada junto a esa compra y se puede volver a ver después con el botón "Ver foto" en el historial. Es una carpeta privada: solo la puede ver quien tenga permiso de Stock, no es pública como las fotos de producto.</p>
      </Seccion>

      <Seccion id="clientes" titulo="9. Clientes">
        <p>Base de datos simple de clientes (nombre, teléfono, email, DNI). Al vender se puede elegir un cliente para la venta (buscándolo o cargándolo rápido ahí mismo) — asociarla a un cliente es lo que permite que después aparezca en "Recompras" si el producto tiene tratamiento crónico.</p>
      </Seccion>

      <Seccion id="recompras" titulo="10. Recompras (recordatorio de recompra)">
        <p>Si un producto tiene cargados los "días de tratamiento" (en Productos — por ejemplo, 30 días para un tratamiento crónico), y se vendió asociado a un cliente, esta pantalla calcula cuándo le tocaría volver a comprarlo y arma una lista con los que están por terminárselo o ya se les debería haber terminado.</p>
        <p>Es solo una lista para que el personal llame o le escriba al cliente — la app todavía no manda avisos automáticos por WhatsApp ni SMS.</p>
      </Seccion>

      <Seccion id="caja" titulo="11. Caja (apertura, cierre y arqueo)">
        <p>Al empezar el turno se <b>abre la caja</b> con el monto inicial en efectivo. Durante el turno, cada venta en efectivo suma al "esperado en caja". Al cerrar, se cuenta la plata física y se carga ese monto — ahí se compara contra lo esperado.</p>
        <p>Los cajeros ven una versión "a ciegas": pueden abrir y cerrar caja, pero no ven cuánto "debería" dar, para que no puedan ajustar el conteo. Esa comparación (diferencia) solo la ve un administrador o superadmin.</p>
        <p>Si en el turno hubo ventas con cobertura de obra social, aparece un cuadro aparte aclarando que esa plata no es un faltante: es dinero que todavía no se cobró y se va a reclamar por separado (ver sección 14). El número que tiene que coincidir con el efectivo contado es "Cobrado real", no el total bruto de ventas.</p>
        <p>Con la caja abierta hay un botón <b>"Retiro de caja"</b>: sirve para sacar efectivo y pagar algo (luz, agua, un flete, etc.) sin que esa plata desaparezca sin dejar rastro. Pide el monto y el motivo, queda registrado con hora y quién lo hizo, genera una alerta para el admin, y se descuenta automáticamente del "esperado en caja" al hacer el arqueo o el cierre — así el cierre sigue dando bien aunque haya salido plata de la caja por un motivo legítimo.</p>
        <p>Las ventas fiadas quedan discriminadas dentro de la misma pantalla de Caja: hay un cuadro "Fiados del turno" con factura, hora, cliente y monto de cada una, y "Total bruto / Neto / IVA" y "Cobrado real" ya no las cuentan como plata cobrada (se restan, igual que la cobertura de obra social). "Por método de pago" sí las muestra, como una columna más, para ver cuánto se fió en el turno.</p>
        <p>El botón <b>"Imprimir fiados del día"</b> (arriba, visible para admin) saca un ticket por la impresora térmica con todos los fiados del día — de cualquier caja que se haya abierto hoy, no solo la que está abierta en este momento — con cliente, hora y monto de cada uno, y el total al pie. Sirve para tener en papel a quién hay que cobrarle.</p>
      </Seccion>

      <Seccion id="historial" titulo="12. Historial de cajas">
        <p>Lista de todas las cajas abiertas y cerradas, con el detalle de ventas de cada una, la diferencia de cada arqueo, y un resumen del período elegido (hoy / semana / mes / todo). Un administrador puede anular una venta (devuelve el stock y queda anotado quién y por qué) o registrar una devolución parcial de un producto puntual. Un superadmin además puede borrar una caja entera (sin dejar rastro — para errores de carga, no para ventas reales; esas mejor anularlas).</p>
      </Seccion>

      <Seccion id="reportes" titulo="13. Reportes">
        <p>Totales de ventas por período, por método de pago, y ranking de productos más vendidos. También muestra el total cubierto por obras sociales del período, separado del total cobrado.</p>
      </Seccion>

      <Seccion id="recetas-pendientes" titulo="14. Recetas pendientes de reclamo">
        <p>Es el seguimiento de todo lo que quedó pendiente de cobrarle a las obras sociales. Cada receta con cobertura pasa por tres estados: <b>pendiente → presentado → cobrado</b>.</p>
        <p>Un administrador puede marcar "presentado" (cuando ya se entregó la receta a la obra social). Pero el paso final, <b>"cobrado"</b> — confirmar que la plata efectivamente entró — <b>solo lo puede marcar el dueño (superadmin)</b>, y al hacerlo tiene que escribir el monto que realmente se cobró. Esto es a propósito: separa a quien hace el trámite de papeleo (que podría ser un administrador) de quien confirma que la plata llegó, para que no se preste a que alguien se quede con parte del dinero sin que se note.</p>
        <p>Si el monto cobrado no coincide con lo que la app esperaba, queda marcado en rojo con un ícono de alerta. Abajo hay un resumen por mes y por obra social (esperado vs. cobrado vs. diferencia) para cruzarlo con lo que informe mensualmente quien gestiona ese trámite, y que el arqueo mensual cierre bien.</p>
      </Seccion>

      <Seccion id="auditoria-precios" titulo="15. Auditoría de cambios de precio">
        <p>Cada vez que se cambia el precio de venta o de costo de un producto (desde Productos o desde cualquier otro lado), queda un registro automático de quién lo hizo, cuándo, y los valores anterior y nuevo. Esto no se puede desactivar ni evitar — está puesto directamente en la base de datos, no solo en la pantalla. Sirve para detectar, por ejemplo, que alguien baje un precio para cobrarle de menos a un conocido.</p>
      </Seccion>

      <Seccion id="devoluciones" titulo="16. Devoluciones">
        <p>Desde el Historial, un administrador puede devolver parcialmente un producto de una venta ya cobrada (por ejemplo, el cliente trajo de vuelta 1 de los 3 que llevó). Hay que indicar el producto, la cantidad y el motivo. El sistema repone el stock, descuenta lo que corresponda del total de la venta, y si ese producto tenía cobertura de obra social, recalcula también esa parte proporcionalmente.</p>
      </Seccion>

      <Seccion id="alertas" titulo="17. Alertas">
        <p>Avisos automáticos: stock bajo o agotado, diferencias de caja al cerrar, ventas anuladas y devoluciones registradas. Sirve como bitácora rápida de "qué pasó" sin tener que revisar todo el historial.</p>
      </Seccion>

      <Seccion id="configuracion" titulo="18. Configuración">
        <p>Datos del negocio (nombre, logo), obras sociales (nombre y % sugerido de cobertura — se puede ajustar en cada venta, ver sección 4), notificaciones por mail al cerrar caja, y la configuración de facturación electrónica ARCA (cuando esté lista).</p>
      </Seccion>

      <Seccion id="respaldo" titulo="19. Respaldo de la base de datos">
        <p>Desde Panel Admin → "Respaldo de la base de datos" (dueño y administradores) se puede <b>exportar</b> un archivo con todo: productos, clientes, ventas/comandas, stock, caja, compras, proveedores, obras sociales, etc. — para guardarlo como copia de seguridad en la computadora, Google Drive, o donde prefieran.</p>
        <p>El mismo archivo se puede volver a <b>importar</b> después, si algo se rompe o se borra por error. Importar nunca borra lo que ya está cargado: agrega lo que falte y actualiza (por ejemplo, si un producto del archivo ya existe, lo deja con los valores del archivo) — nunca elimina algo que ya esté en la base y no esté en el archivo.</p>
        <p>No incluye los usuarios ni sus contraseñas/PIN, ni las credenciales de facturación electrónica (ARCA): esos se manejan aparte, desde Usuarios y Configuración.</p>
      </Seccion>

      <Seccion id="actualizar-precios" titulo="20. Actualizar precios desde archivo (droguería)">
        <p>No hay una conexión automática en tiempo real con las droguerías: cada una da lo que puede (algunas un Excel o CSV desde su portal, algunas por mail, otras nada). Esta pantalla sirve para cargar ese archivo y que la app actualice los precios sola, sin tipear nada a mano.</p>
        <p>Se sube el archivo (Excel o CSV), se elige qué columna tiene el <b>código de barras</b> y qué columnas tienen el <b>precio de costo</b> y/o el <b>precio de venta</b> (se puede actualizar uno solo o los dos). La app matchea cada fila contra el catálogo por código de barras.</p>
        <p>Antes de tocar nada se muestra una <b>vista previa</b>: qué productos cambian (precio actual → nuevo), cuáles quedan igual, y qué códigos del archivo no están en el catálogo (para revisar si falta cargarles el código de barras). Se puede destildar algún producto puntual antes de confirmar. Recién al apretar "Confirmar" se actualizan los precios.</p>
        <p>Cada precio que cambia así queda anotado en la Auditoría de cambios de precio (sección 15), igual que si se editara a mano desde Productos.</p>
      </Seccion>

      <Seccion id="seguridad" titulo="21. Por qué está armado así (seguridad y antifraude)">
        <p>La idea general detrás de varias de estas decisiones: separar "quien hace la tarea" de "quien controla que la tarea se hizo bien", para que ninguna persona sola pueda tocar algo y además borrar el rastro de que lo tocó.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Los cajeros no ven cuánto "debería" haber en caja, para que no ajusten el conteo a ese número.</li>
          <li>Anular una venta, devolver un producto o cambiar un precio siempre queda anotado con quién y por qué — no se puede hacer "en silencio".</li>
          <li>Confirmar que una obra social pagó es un paso aparte, reservado al dueño, separado de quien hace el trámite de papeleo.</li>
          <li>Varias de estas reglas están puestas directamente en la base de datos (no solo en la pantalla), para que no se puedan saltear editando algo por afuera de la app.</li>
        </ul>
      </Seccion>

      <Seccion id="reiniciar" titulo="22. Reiniciar la app (Panel Admin → Reiniciar la app)">
        <p>Pensado para el momento en que se termina el período de prueba y se quiere arrancar a operar con todo en cero. Borra productos, categorías, obras sociales, proveedores, compras, clientes, lotes, ventas, caja, movimientos de stock, auditoría de precios, alertas, y las fotos de productos y de facturas.</p>
        <p><b className="text-white">No</b> borra los usuarios ni la configuración del negocio (marca, ticket, ARCA) — así se puede seguir entrando a la app normalmente después.</p>
        <p>Solo lo puede hacer un superadmin, y pide dos confirmaciones: escribir una frase exacta y poner la contraseña de superadmin. Es irreversible — no hay un "deshacer" para esto.</p>
      </Seccion>
    </div>
  )
}
