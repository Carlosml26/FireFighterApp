# Mantenimiento del entorno local

## Arrancar y parar

Desde `v2/`, `npm ci` instala dependencias y `npm start` arranca la aplicación.
`http://127.0.0.1:4318/health` comprueba el servidor. `Ctrl+C` cierra HTTP y SQLite.

Si falta `node:sqlite`, comprueba Node 24.19+. Si el puerto está ocupado, usa
`PORT=4319 npm start`; no detengas procesos desconocidos. No ejecutes dos procesos
con el mismo `DB_PATH`.

## Backup y restauración

1. Para el servidor.
2. Copia toda la carpeta `v2/data/` a una ubicación privada. Incluye `-wal` y
   `-shm` si existen; no copies solo el `.sqlite` con el servidor en marcha.
3. Para probar la restauración, usa una carpeta nueva y arranca con
   `DB_PATH=/ruta/privada/restauracion/brigada.sqlite PORT=4319 npm start`.
4. Comprueba equipos, incidentes y actividad antes de aceptar el backup.
   Conserva la base original hasta terminar la verificación.

Los archivos están excluidos de Git. Para una sesión vacía, usa un `DB_PATH`
nuevo y `TRAINING=0`; no es necesario borrar el trabajo anterior.

## Resolución de problemas

| Síntoma | Comprobación |
| --- | --- |
| Aparece la interfaz antigua | Recarga. El worker anterior se retira automáticamente; si persiste, elimina su registro de este origen desde las herramientas del navegador. |
| Mapa sin fondo | Revisa acceso a `tile.openstreetmap.org`; las coordenadas permanecen disponibles. |
| Posiciones antiguas | No se simula movimiento; comparte una nueva posición desde el equipo. Se rechazan timestamps antiguos o saltos imposibles. |
| No se puede cerrar un aviso | Retira o finaliza todas sus asignaciones. |
| Canal esperando participantes | Une dos pestañas a la misma intervención: Central o equipos asignados. |
| Micrófono denegado | Revisa permisos del origen local; grabar necesita permiso del navegador. |
| Canal interrumpido | Comprueba servidor y asignación; vuelve a conectar. El chat anterior no se conserva. |
| Error 500 al guardar | Revisa disco y terminal. Una escritura fallida revierte memoria y auditoría. |
| Esquema desconocido | Conserva una copia y revisa versión de código. No edites el JSON interno ni sobrescribas la base. |

## Antes de una prueba real

La revisión local no acredita uso en emergencias. Conectar tablets reales exige
identidad verificada, HTTPS, dispositivos y despliegue controlados, backup y
recuperación revisados, red/TURN probados y aceptación del servicio. Las radios y
procedimientos existentes siguen siendo el respaldo operativo.

No se ha migrado MongoDB ni revocado credenciales históricas en proveedores
externos. La auditoría anterior sirve de referencia para revisar esas cuentas.

## Actualizar desde GitHub

1. Comprueba `git status` y conserva cualquier cambio local antes de actualizar.
2. Para el servidor con `Ctrl+C` y haz una copia de `data/` fuera del repositorio.
3. En la rama elegida, usa `git pull --ff-only`. Si no puede avanzar sin merge,
   revisa la divergencia; no uses un reset destructivo.
4. Dentro de `v2/`, ejecuta `npm ci`, `npm run check`, `npm test` y los tests de
   navegador si cambia el frontend o su contrato.
5. Arranca con el mismo `DB_PATH`, abre `/health` y revisa directorio, avisos y
   registro. Recarga la página para recibir el nuevo HTML/CSS/JavaScript.

No es necesario reconstruir un bundle ni reinstalar una base externa. Una
actualización de código no debe reemplazar el archivo SQLite por los datos de
entrenamiento. La inserción inicial solo ocurre si no hay unidades ni avisos.

## Volver a una versión anterior

Conserva el identificador del commit anterior antes de actualizar. Para revertir
una entrega, detén el servidor y prepara un checkout separado de ese commit,
instala con su lockfile y configura un **archivo SQLite distinto**, restaurado
con la copia compatible de esa versión. Así se preservan código y datos de la
versión que estás investigando. No apuntes simultáneamente dos versiones a la
misma base ni fuerces una versión de esquema desconocida.

La versión actual del documento persistido es `1`; no hay un motor de migraciones
ni una importación automática desde MongoDB. Un backup restaurado debe verificarse
mediante datos visibles y un recorrido de prueba, no solo por un `/health` correcto.

## Diagnóstico del frontend actualizado

- **No suena una asignación:** interactúa con la página y revisa políticas de
  audio. La alerta es un intento del navegador, no un servicio de alarmas.
- **No vibra:** el dispositivo/navegador puede no admitir la API o suspender la
  pestaña. Usa la confirmación operativa y el canal habitual de comunicación.
- **Distancia o sugerencia inesperada:** comprueba coordenadas y antigüedad de la
  última posición. Se mide línea recta, sin tráfico ni filtrado por antigüedad.
- **Zona incorrecta para una dirección:** la zona es un punto aproximado; corrige
  coordenadas antes de crear el aviso.
- **El modo día no se recuerda:** `localStorage` puede estar bloqueado, borrarse
  o pertenecer a otro origen (por ejemplo, `localhost` frente a `127.0.0.1`).
- **Una tablet no conecta por Wi-Fi:** es el comportamiento actual; consulta
  [conexión de dispositivos](installation.md#tablets-físicas-y-otros-ordenadores).

Los logs se escriben en el terminal del proceso. No hay agregación de logs,
retención automática, alertas de servicio ni backup programado incorporados.
