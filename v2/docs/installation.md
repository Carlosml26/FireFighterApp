# Instalación y conexión de clientes

## 1. Obtener la versión actual

Mientras V2 esté en revisión, utiliza la rama que la contiene:

```sh
git clone --branch codex/modernize-firefighter-v2 https://github.com/Carlosml26/FireFighterApp.git
cd FireFighterApp/v2
```

Después de integrar la PR en `master`, el clon por defecto contendrá V2.
Si ya tienes cambios locales, consulta `git status` antes de actualizar y
conserva esos cambios; no se necesita resetear ni borrar el repositorio.

## 2. Preparar Node e instalar

```sh
node --version
npm --version
npm ci
```

Se necesita Node **24.19.0 o posterior**. Con nvm instalado puedes ejecutar
`nvm install` y `nvm use` desde `v2/`. `.nvmrc` define la versión de referencia.
`npm ci` instala Leaflet y las herramientas de desarrollo según el lockfile.
La primera instalación requiere red. No ejecutes `npm install` en `serverDB/`
para arrancar V2: pertenece al prototipo histórico.

## 3. Arrancar el servidor

```sh
npm start
```

Mantén ese terminal abierto. El proceso sirve frontend, API y señalización en
[http://127.0.0.1:4318](http://127.0.0.1:4318). Abre la URL en el navegador,
no el archivo HTML con `file://`. No hay un servidor de frontend separado.

Comprueba el proceso con [la ruta de salud](http://127.0.0.1:4318/health) o:

```sh
curl http://127.0.0.1:4318/health
```

La respuesta esperada es `{"status":"ok"}`. Esto verifica el proceso HTTP;
no acredita por sí solo conexión P2P, cartografía, backup ni aceptación operativa.

## Conectar dos clientes

1. Abre dos pestañas de **`http://127.0.0.1:4318`**. Puedes usar dos ventanas o
   dos navegadores del mismo ordenador. Mantén el mismo hostname y puerto.
2. En la primera selecciona **Central · coordinación** en **Perfil local**.
3. En la segunda selecciona **B-01 · equipo**. Aparecerá **Mi equipo**.
4. En ambas entra en **Comunicaciones**. Selecciona **Incendio en vivienda**
   y pulsa **Conectar al canal**.
5. Espera **Canal directo** y el participante conectado. Prueba **Enviar**, una
   respuesta rápida y **Voz** → **Enviar nota**.
6. Concede permiso de micrófono si quieres grabar. El permiso de ubicación es
   independiente y solo se pide al pulsar **Compartir mi posición**.

B-01 ya está asignado al primer aviso del escenario ficticio. Si usas una base
vacía, crea antes un aviso y asigna una unidad; solo Central y equipos asignados
pueden entrar en el canal. El perfil de Administración no participa en el chat.

Cada pestaña es un cliente. Las órdenes pasan por la misma API y se comparten
mediante consultas cada tres segundos. Para WebRTC se consulta señalización cada
segundo. **Recibido** confirma llegada al navegador conectado, no lectura humana.

## Configuración

| Variable | Predeterminado | Detalle |
| --- | --- | --- |
| `PORT` | `4318` | Puerto del proceso |
| `HOST` | `127.0.0.1` | Solo `127.0.0.1`, `localhost` o `::1` |
| `DB_PATH` | `v2/data/brigada.sqlite` | Ruta predeterminada relativa a la instalación; una ruta personalizada relativa se interpreta desde el directorio de ejecución |
| `TRAINING` | `1` | `0` desactiva la inserción inicial; no borra datos existentes |

Ejemplo para una base nueva sin escenario ficticio en macOS/Linux:

```sh
TRAINING=0 DB_PATH=./data/mi-espacio.sqlite PORT=4319 npm start
```

Equivalente en PowerShell, dentro de `v2/`:

```powershell
$env:TRAINING = '0'
$env:DB_PATH = './data/mi-espacio.sqlite'
$env:PORT = '4319'
npm start
```

Estas variables permanecen en la sesión de PowerShell; cierra esa terminal o
elimínalas después. El archivo [`.env.example`](../.env.example) es una referencia:
la aplicación **no carga `.env` automáticamente**. Para usar datos efímeros,
configura `DB_PATH=:memory:`; se perderán al detener el proceso.

No ejecutes dos procesos con el mismo archivo SQLite. Usa otro `DB_PATH` y otro
puerto para una segunda instancia independiente. El modo entrenamiento es una
configuración de arranque; no garantiza que cualquier dato introducido después
sea ficticio.

## Tablets físicas y otros ordenadores

**La versión actual no acepta conexiones desde la LAN.** En una tablet,
`127.0.0.1` se refiere a la propia tablet, no al ordenador que ejecuta Node.
Usar la IP del ordenador, cambiar `HOST=0.0.0.0` o abrir el puerto no basta:
existen restricciones tanto de escucha como de cabeceras `Host` y `Origin`.
Un proxy HTTPS directo tampoco resuelve las comprobaciones actuales de origen.

Para habilitar un piloto de dispositivos físicos se necesita implementar:

1. Autenticación verificada y roles/unidad vinculados a la sesión, sustituyendo
   las cabeceras declaradas por el cliente.
2. Un origen HTTPS autorizado y configuración explícita de host/origen, sin
   desactivar indiscriminadamente los controles existentes.
3. Acceso de red y dispositivos administrados; permisos de ubicación/micrófono.
4. ICE con STUN/TURN según las redes previstas y pruebas de reconexión.
5. Persistencia, recuperación, observabilidad y aceptación del servicio.

Estos pasos son requisitos futuros, no instrucciones de despliegue ejecutables
para el código actual. Puedes revisar la interfaz de tablet desde las herramientas
responsive del navegador sin habilitar red.

## Detener y continuar

Pulsa `Ctrl+C`. Vuelve a ejecutar `npm start` con el mismo `DB_PATH` para recuperar
el estado operativo. Los chats y sesiones de presencia desaparecen; hay que
conectar de nuevo. No elimines la carpeta `data/` para actualizar el frontend.

[Resolver problemas, backup y rollback](runbook.md).
