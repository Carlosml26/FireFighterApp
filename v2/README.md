# Brigada Málaga V2

Aplicación local de coordinación con SQLite, Leaflet y WebRTC. Este directorio
contiene el servidor, la interfaz y las pruebas de la versión mantenida.
[Presentación y capturas del proyecto](../README.md).

## Arranque

Requiere **Node.js 24.19.0 o posterior** y npm. Desde este directorio:

```sh
node --version
npm ci
npm start
```

Con nvm instalado, `nvm install` y `nvm use` seleccionan la versión de `.nvmrc`.
Abre [http://127.0.0.1:4318](http://127.0.0.1:4318) y conserva el terminal abierto.
No hay compilación del frontend ni procesos MongoDB/señalización que arrancar
por separado. Detén con `Ctrl+C`.

## Conectar clientes

Abre dos pestañas de la misma URL. Selecciona Central en una y B-01 en la otra.
En ambas entra en Comunicaciones, elige **Incendio en vivienda** y conecta al
canal. El escenario inicial ya tiene esa asignación. Prueba texto, mensajes
rápidos y voz. Los permisos de micrófono y ubicación se solicitan por separado.

El selector ofrece identidades de desarrollo, no cuentas con contraseña. Solo
funciona en el propio ordenador; una tablet física requiere el trabajo de red,
HTTPS y autenticación descrito en la [guía de conexión](docs/installation.md).

## Configuración y datos

| Variable | Predeterminado |
| --- | --- |
| `HOST` | `127.0.0.1` (solo loopback) |
| `PORT` | `4318` |
| `DB_PATH` | `v2/data/brigada.sqlite` |
| `TRAINING` | `1` (escenario ficticio solo si la base está vacía) |

[`.env.example`](.env.example) es una referencia: no se carga automáticamente.
Para un espacio independiente, sin sembrar datos, en macOS/Linux:

```sh
TRAINING=0 DB_PATH=./data/mi-espacio.sqlite PORT=4319 npm start
```

Las órdenes y sus eventos sobreviven al reinicio. El chat es temporal.
`TRAINING=0` no borra datos y `DB_PATH=:memory:` los mantiene solo durante ese
proceso. No ejecutes dos procesos sobre el mismo archivo SQLite.

## Interfaz

Tema oscuro por defecto y **Modo día** recordado en el navegador. Emblema propio,
no oficial, y navegación inferior móvil.

- **Central:** cola por prioridad, tiempo transcurrido, riesgos, mapa, tablero de
  dotaciones, sugerencia de cercanía, plantillas y zonas. `N` crea; `/` busca.
- **Mi equipo:** misión, confirmación/rechazo, salida/llegada, posición, riesgos
  y enlace «Cómo llegar». Avisos visuales con intento de sonido/vibración.
- **Comunicaciones:** texto, voz y mensajes rápidos por canal de intervención.
- **Administración / Registro:** directorio editable y actividad exportable.

La cercanía usa distancia en línea recta con la última posición, no ETA ni rutas.
Las zonas son aproximadas y «Cómo llegar» es un enlace externo a Google Maps.
Sonido/vibración dependen del navegador; no son notificaciones push.

[Manual completo y limitaciones de las ayudas](docs/user-guide.md).

## Vistas y módulos

| URL | Vista |
| --- | --- |
| `/#dispatch` | Central |
| `/#field` | Mi equipo |
| `/#radio` | Comunicaciones |
| `/#admin` | Administración |
| `/#history` | Registro |
| `/?unit=<id>#field` | Equipo preseleccionado por ID real |
| `/reference` | Interfaz anterior del primer núcleo V2 |

El cliente actual está en `public/console/`; el dominio, repositorio y servidor
en `src/`. [Arquitectura y modelo de datos](docs/architecture.md).

## Comprobaciones

```sh
npm run check
npm run format:check
npm test
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e
```

Playwright utiliza el puerto 4320 y una base en memoria, separados de tu sesión.
Las capturas se guardan en `docs/`. `npm run format` aplica Prettier al código.
Los tests usan micrófono/ubicación sintéticos y transporte WebRTC real.

## Documentación

[Índice](docs/README.md) · [Requisitos](docs/requirements.md) ·
[Instalación y conexión](docs/installation.md) · [Uso](docs/user-guide.md) ·
[Arquitectura](docs/architecture.md) · [API](docs/api-guide.md) ·
[OpenAPI](openapi.yaml) · [WebRTC](docs/communications.md) ·
[Mantenimiento](docs/runbook.md) · [Verificación](docs/verification.md).

Autenticación real, acceso LAN/Internet, TURN entre redes, PostgreSQL/PostGIS,
mapas offline, seguimiento en segundo plano, mensajes duraderos y migración
MongoDB siguen fuera de esta entrega local. Consulta el
[plan futuro](../docs/modernization-plan.md) y no lo confundas con funciones
implementadas. El [README del primer núcleo](docs/reference-v2-readme.md) está
archivado y no describe el almacenamiento actual.
