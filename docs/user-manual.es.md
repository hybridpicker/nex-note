# Manual de usuario de nex-note

Actualizado: 2026-06-11. Este manual describe las funciones de usuario disponibles actualmente en nex-note. Los atajos de teclado y raton estan documentados por separado en [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Idiomas: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md).

## Que es nex-note

nex-note es un editor MusicXML para flujos de trabajo cercanos a MuseScore. Puedes importar partituras, editar la notacion en el navegador, pedir cambios al asistente AI, reproducir la partitura y exportar a MXL, ABC, paquetes de practica o proyectos nex-note.

## Inicio y archivos

| Funcion | Descripcion |
| --- | --- |
| Nueva partitura | Crea una partitura vacia. |
| Elegir plantilla | Abre el dialogo con instrumentos, plantillas y metadatos. |
| Abrir archivo | Importa un archivo local. |
| Arrastrar y soltar | Carga archivos en la zona de subida. |
| Archivos recientes | Reabre archivos importados recientemente. |
| Biblioteca | Abre partituras guardadas localmente. |

Formatos admitidos: `.musicxml`, `.xml`, `.mxl`, `.pdf`, `.mscz`, GuitarPro (`.gp`, `.gp4`, `.gp5`, `.gp6`, `.gpx`) y proyectos `.nxn`. La importacion PDF necesita Audiveris. MSCZ, GuitarPro, MIDI y algunos exports usan MuseScore CLI.

## Crear una partitura

| Area | Funciones |
| --- | --- |
| Instrumentos | Buscar, filtrar por familia, agregar, quitar y reordenar. |
| Plantillas | Empezar desde conjuntos predefinidos. |
| Informacion | Titulo, subtitulo, compositor, arreglista, tonalidad, compas y unidad de pulso. |

El orden de instrumentos seleccionado define el orden de pentagramas.

## Espacio principal

| Area | Proposito |
| --- | --- |
| Vista de partitura | Notacion renderizada, seleccion, navegacion, objetivos fantasma y cursor de reproduccion. |
| Barra de notacion | Undo/redo, reproduccion, tempo, metronomo, note input, lead mode, transposicion por arrastre y limpieza de layout. |
| Barra de entrada | Duraciones, alteraciones, articulaciones, voces, insertar/sobrescribir, acordes, silencios, copiar/pegar/borrar. |
| Paleta de edicion | Seleccion, transposicion, articulaciones, dinamicas, ligaduras y barras. |
| Panel lateral | AI, Biblioteca e Inspector; se puede plegar. |
| Controles inferiores | Navigator, Find/Go to, zoom y modo de vista. |

## Idioma y ayuda

La cabecera incluye un selector de idioma compacto. nex-note admite Deutsch, English, Francais, Espanol y 中文. El idioma elegido se guarda localmente, se restaura al abrir la app de nuevo y actualiza la interfaz sin recargar. El enlace **Manual** abre el manual correspondiente al idioma seleccionado.

## Seleccion y navegacion

Haz clic en una nota para seleccionarla y escuchar una previsualizacion corta. Clic en espacio vacio limpia la seleccion. `Shift+Click` crea rangos y `Cmd/Ctrl+Click` agrega o quita notas. Las flechas izquierda/derecha navegan por notas; `Shift+Flecha` extiende seleccion; `Cmd/Ctrl+Flecha izquierda/derecha` salta por compas; `Alt/Option+Flecha arriba/abajo` navega verticalmente entre voces o pentagramas en el mismo tiempo.

Find/Go to se abre desde abajo o con `Cmd/Ctrl+F` y acepta objetivos como numeros de compas o `p2`.

## Entrada de notas

Activa Note Input con `N` o el boton de la barra.

| Funcion | Descripcion |
| --- | --- |
| Duraciones | `1` a `7` seleccionan de semifusa a redonda. |
| Puntillo | `.` activa/desactiva duracion con puntillo. |
| Alturas | `A` a `G` introducen o cambian notas. |
| Silencios | `R` o `0` inserta un silencio. |
| Repetir | `R` repite la ultima nota si ya hubo entrada previa. |
| Voces | Barra o `Cmd/Ctrl+Alt/Option+1...4`. |
| Insert/overwrite | `I` cambia el comportamiento de entrada. |
| Acordes | Chord Input o `Shift+A...G` agrega notas al acorde. |
| Insertar en cursor | `Cmd/Ctrl+Shift+A...G`. |
| Octavas | `Shift+Flecha arriba/abajo` o `Cmd/Ctrl+Flecha arriba/abajo`. |

La nota fantasma muestra donde caera la siguiente nota. `Shift` prefiere insertar; `Alt/Option` prefiere acorde.

## Altura, alteraciones y duracion

Selecciona una nota y usa `A` a `G`, los botones de altura, flechas o paleta. `Flecha arriba/abajo` transpone por semitonos. `Q/W` reducen o duplican la duracion; `Shift+Q/W` lo hacen respetando valores con puntillo. Las alteraciones estan en la barra; `-` bemol, `=` natural, `+` sostenido. Doble bemol y doble sostenido estan disponibles en la barra.

## Articulaciones, dinamicas y ligaduras

| Area | Funciones |
| --- | --- |
| Articulaciones | Staccato, staccatissimo, accent, marcato, tenuto, fermata. |
| Dinamicas | `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`. |
| Tie | Une con la siguiente nota de la misma altura. Atajo: `T`. |
| Slur | Liga expresiva sobre seleccion o siguiente nota. Atajo: `S`. |
| Grace note | Agrega una nota de adorno. Atajo: `/`. |
| Tuplets | Tresillo y quintillo por barra/paleta o `Cmd/Ctrl+3` y `Cmd/Ctrl+5`. |

Algunos signos pueden ser solo visuales segun el motor de reproduccion.

## Barras, repeticiones y slashes

La paleta aplica barras regular, double, final, repeat start y repeat end al compas seleccionado. El Inspector agrega repeticiones y primeras/segundas casillas. La barra de entrada inserta slash ritmico o llena el compas con slashes (`Cmd/Ctrl+/`).

## Simbolos de acorde, letra y texto

Con una nota seleccionada, `Cmd/Ctrl+K` abre un cursor de armonia directamente en la partitura. `Enter` aplica el acorde y `Escape` cancela. Sin seleccion de nota, `Cmd/Ctrl+K` sigue abriendo el Command Center. El Inspector agrega marcas de ensayo, texto de pentagrama, expresiones y letra. Para letra, selecciona una nota, escribe texto y numero de verso, y aplica la linea.

## Inspector

| Seccion | Funciones |
| --- | --- |
| Selection | Transponer rango, limpiar articulaciones, staccato/accent, agregar `mf`, slur. |
| Score Setup | Titulo, subtitulo, compositor, arreglista. |
| Key | Presets C, G, D, A, F y Bb mayor. |
| Repeats & Endings | Inicio/fin de repeticion, primera y segunda casilla. |
| Time & Clef | 4/4, 3/4, 6/8, 2/2; claves de sol, fa y alto. |
| Measure | Insertar/borrar compas, salto de sistema/pagina, espaciado. |
| Text & Rehearsal | Marcas de ensayo y texto. |
| Lyrics | Letra en notas seleccionadas. |
| Parts & Instruments | Nombre, abreviatura, instrumento, transposicion, extraccion de parte, presets de layout. |

La extraccion de parte abre una particella como partitura independiente.

## Paleta de edicion

La paleta izquierda se puede expandir, plegar o usar como rail de iconos. Incluye seleccion, transposicion por octava/semitono/tono/quinta, articulaciones, dinamicas, ties/slurs y barras. Las herramientas se activan cuando hay una seleccion compatible.

## Reproduccion

La reproduccion incluye play/pause (`Space`), stop, tempo, metronomo, salto con barra de progreso y cursor en la partitura. Si hay una nota seleccionada y la reproduccion esta detenida, Play empieza desde esa nota. El primer cargado de MIDI/soundfont puede tardar un momento.

## Asistente AI

La pestana AI abre el chat para trabajar sobre la partitura en lenguaje natural. Puedes describir cambios directamente o usar workflows slash como `/arrange`, `/analyze`, `/practice`, `/layout`, `/repair` y solicitudes de limpieza MIDI/import. Si hay una nota, rango, compas o parte seleccionada, el asistente recibe ese contexto y puede limitar la propuesta a la musica actual.

Las solicitudes de arreglo usan ahora el asistente de arreglos. Los planes de un proveedor se revisan con el critic y despues, si el contexto de la partitura lo permite, se materializan como voces escritas y simbolos de acorde. El resultado aparece como preview con operaciones preparadas, por ejemplo limpiar el rango de la voz destino, insertar las notas realizadas y agregar acordes; los pentagramas TAB de guitarra emparejados se reflejan cuando las notas son tocables.

Los arreglos, cambios de layout y otros lotes con riesgo quedan protegidos por preview. La partitura no cambia cuando aparece la preview. Haz clic en **Apply** o escribe `apply` para escribir las operaciones en la partitura; haz clic en **Cancel** o escribe `cancel` para descartarlas. La preview lista compases afectados, riesgos, diagnosticos y el resumen de comandos preparados.

La configuracion de proveedores esta en **AI model settings**. Claude y Gemini necesitan sus API keys alli; Ollama usa tu servidor local de Ollama y puede usar modelos detectados o un `model:tag` personalizado. El proveedor y modelo elegidos aparecen en la cabecera y en las respuestas del asistente.

Si no hay proveedor configurado, si una llamada falla o si la solicitud coincide con un workflow local determinista, nex-note usa ayudas locales. Pueden analizar la partitura, sugerir versiones de practica, preparar previews de acordes o expresion, manejar arreglos simples y ejecutar limpieza de layout sin enviar la partitura a un proveedor cloud. Los fallbacks locales que cambian la partitura usan el mismo modelo preview/apply/cancel.

## Proveedores AI y benchmarks

nex-note admite Ollama, Claude, Gemini y Benchmark. Los modelos Ollama se eligen de la lista o se agregan como `model:tag`. Benchmark compara resultado, latencia, validez XML y operaciones. Benchmarks CLI: `npm run benchmark` y `npm run benchmark:quick`.

## Biblioteca y recientes

La Biblioteca guarda partituras en el almacenamiento local del navegador. Puedes abrir, marcar favoritos, filtrar, ver estadisticas, borrar una partitura o limpiar todo. Recent Files da acceso rapido a archivos recientes.

## Exportar y guardar

| Funcion | Resultado |
| --- | --- |
| Save as library score | Guarda en la biblioteca local. |
| Save project `.nxn` | Descarga un proyecto editable. |
| Export compressed MusicXML | Descarga `.mxl`. |
| Export ABC notation | Descarga `.abc`. |
| Export practice pack | Crea un pack JSON. |
| Print view / Print score | Abre vista de pagina o impresion del navegador. |

MXL es el formato principal para MuseScore, Finale, Dorico y Sibelius.

## Layout y vista

Zoom, modo de vista, Navigator, Find/Go to, Layout Cleanup, saltos de sistema/pagina, espaciado y presets `Compact`, `Balanced`, `Roomy`, `Choir` ayudan a preparar paginas legibles.

## Undo, Redo e historial

Undo: `Cmd/Ctrl+Z`. Redo: `Cmd/Ctrl+Shift+Z` o `Cmd/Ctrl+Y`. El historial se basa en comandos y tiene limite de tamano.

## Debug y reportes

En modo debug, `Report bug` exporta un paquete con partitura, estado runtime, acciones recientes e informes Markdown/JSON. Doctor Mode y herramientas visuales ayudan a diagnosticar entrada de notas, ritmo, layout y grilla semantica.

## Limites conocidos

La calidad AI depende del proveedor y modelo. PDF depende de Audiveris. MSCZ, GuitarPro, MIDI y mejor ABC dependen de MuseScore CLI. Algunos signos son solo visuales para playback. Faltan algunos atajos estilo MuseScore/Finale; ver [keyboard-shortcuts.md](./keyboard-shortcuts.md).
