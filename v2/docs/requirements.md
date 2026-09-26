# Requisitos y alcance

## Requisitos de ejecución

| Componente | Requisito |
| --- | --- |
| Runtime | Node.js >= 24.19.0; la versión de referencia está en `v2/.nvmrc` |
| Gestor | npm; usar `npm ci` para respetar `package-lock.json` |
| Descarga | Git para clonar y acceso a GitHub/registro npm durante instalación |
| Navegador | Navegador moderno con módulos ES, Fetch, WebRTC DataChannel, Web Crypto, ResizeObserver y almacenamiento local opcional |
| Voz | MediaRecorder, `getUserMedia` y permiso de micrófono |
| Posición | Geolocation API y permiso de ubicación |
| Datos | Directorio escribible para SQLite; lo crea la aplicación |
| Red local | Puerto TCP 4318 libre, accesible desde el propio ordenador |
| Cartografía | Acceso a `https://tile.openstreetmap.org`; el fondo necesita Internet |

No se necesita un servicio SQLite externo: se utiliza `node:sqlite`. Tampoco se
necesitan MongoDB, Docker, Bower, cuenta de mapas ni compilación del frontend.
La revisión actual usa macOS y Chromium. Los pasos de PowerShell son equivalentes
de configuración; no acreditan una prueba en Windows. No hay cifras de capacidad
ni mínimos de hardware obtenidos mediante ensayos de carga.

## Requisitos para pruebas y desarrollo

- Dependencias de desarrollo (`npm ci`, sin `--omit=dev`).
- Chromium instalado con `npx playwright install chromium`.
- En Linux CI: `npx playwright install --with-deps chromium` instala también
  bibliotecas del sistema; puede requerir privilegios del runner.
- Puerto 4320 libre para el servidor de Playwright, separado de la sesión local.
- Micrófono y ubicación de las pruebas son sintéticos; los canales WebRTC son reales.

## Funciones implementadas

| Área | Comportamiento actual |
| --- | --- |
| Identidad visual | Emblema original, favicon, tema oscuro/diurno y preferencia por navegador |
| Central | Crear, ordenar, buscar, asignar, retirar equipos y cerrar intervenciones |
| Mapa | Ubicaciones de avisos y equipos, estados, prioridades y posiciones antiguas |
| Ayudas de captura | Plantillas de tipo de aviso y centros aproximados de zonas editables |
| Cercanía | Distancia geodésica aproximada con la última posición; decisión de asignación manual |
| Equipo | Confirmación/rechazo, salida, llegada, finalización y posición a petición |
| Avisos | Banda visual, intento de sonido/vibración y aviso a central ante rechazo |
| Comunicación | Texto, respuestas rápidas y notas de voz directos, con ACK del navegador |
| Administración | Alta/edición de unidades; sin gestión de cuentas reales |
| Auditoría | Registro de comandos operativos y exportación JSON |
| Persistencia | SQLite de un proceso, reintentos idempotentes y rollback de memoria ante fallo de escritura |
| Acceso | Roles y unidad comprobados sobre identidades declaradas de desarrollo |

La sugerencia de cercanía no filtra automáticamente por antigüedad de posición,
tráfico, carreteras ni adecuación de capacidades. Si no hay distancia visible,
no hay una base geográfica para interpretar una sugerencia como «más cercana».
Los pitidos/vibración dependen de soporte, interacción previa y permisos del
navegador; no existen notificaciones push ni garantías con la pantalla bloqueada.

## No implementado / siguiente etapa

| Requisito | Estado |
| --- | --- |
| Login, cuentas, MFA e identidad de dispositivos | Pendiente; el selector es de desarrollo |
| Acceso LAN/Internet desde tablets reales | Deshabilitado; solo loopback |
| HTTPS, dominios y orígenes de producción | Pendiente de diseño y configuración |
| STUN/TURN para redes distintas | No configurado; `iceServers` está vacío |
| PostgreSQL/PostGIS, varias instancias y outbox | Arquitectura futura, no adaptador actual |
| Navegación giro a giro propia / ETA | No; enlace externo a Google Maps |
| Cartografía offline / posicionamiento continuo | No; posición solo al solicitarla |
| Mensajes persistentes / entrega offline / lectura humana | No; conversación temporal y ACK técnico |
| Migración del MongoDB antiguo | No ejecutada; requiere export revisado |
| Piloto operativo y aceptación del servicio | No realizados |

Las radios y procedimientos existentes siguen siendo el respaldo operativo.
El alcance de esta entrega es revisión y entrenamiento local.
