# Canal directo: contrato y prueba

## Funcionamiento

Cada pestaña obtiene una sesión efímera para una intervención abierta. La central
y los equipos asignados pueden entrar; otros equipos, administradores y auditores
no. El servidor entrega un ID y un token aleatorios, mantenidos en memoria.

HTTP intercambia presencia, ofertas/respuestas SDP y candidatos ICE. El peer con
ID menor inicia la oferta, evitando ofertas simultáneas. Las señales se numeran
y permanecen en el buzón hasta que el cliente confirma su cursor. Los candidatos
recibidos antes de la descripción remota se retienen hasta poder aplicarse.

Una vez abierto el DataChannel, **texto y audio viajan entre navegadores**,
cifrados por el transporte WebRTC. El receptor devuelve un ACK por ese canal.
«Recibido» significa recibido por los navegadores conectados en el momento del
envío, no leído por una persona ni recibido por todos los equipos registrados.
Tras quince segundos sin todos los ACK se muestra «Sin confirmar».

La sesión requiere comprobar periódicamente la pertenencia con el servidor.
Retirar un equipo invalida la señalización y su cliente cierra las conexiones al
detectarlo. También desconecta si falla la consulta de presencia. No se promete
comunicación sin infraestructura ni continuidad si cae el servidor.

## Límites

- Sin STUN/TURN externo: se prueba entre navegadores del mismo ordenador.
  Redes con NAT distintos requieren configurar y probar TURN y acceso autenticado.
- Presencia expira a los 30 segundos. Hasta 100 sesiones, 256 señales pendientes
  por receptor y peticiones HTTP de 32 KiB como máximo.
- Texto de hasta 4000 caracteres, tratado como texto escapado y nunca HTML.
- Voz de hasta 20 segundos y 1 MB, en paquetes de hasta 12000 caracteres y con
  control de presión de envío. Máximo cuatro transferencias simultáneas por peer.
- MediaRecorder selecciona un formato compatible. Se solicita permiso al grabar;
  abrir la página no activa el micrófono.
- Hasta 200 mensajes visibles. Sin historial persistente, entrega offline,
  reenvío duradero ni confirmación de lectura humana.
- El servidor conoce participantes y negociación. No hay verificación
  criptográfica de identidad entre personas; no equiparar a una mensajería
  E2EE auditada. La identidad local es declarada por el cliente.

## API de señalización

Todas las rutas conservan `x-actor-id`, `x-actor-role` y, para equipos, `x-unit-id`.

| Ruta | Entrada | Salida |
| --- | --- | --- |
| `POST /v1/peers` | `{incidentId}` | `{peerId, token}` |
| `GET /v1/peers?peerId=…&after=…` | `x-peer-token` | `{peers, signals, cursor}` |
| `POST /v1/signals` | Token; `{peerId, targetId, description}` o `{peerId, targetId, candidate}` | `{accepted: true}` |
| `POST /v1/peer-leave` | Token; `{peerId}` | `{disconnected: true}` |

La señalización es efímera y no usa idempotencia operativa; los comandos de
incidentes/unidades requieren `idempotency-key`. No hay una ruta de envío de
texto o voz al servidor.

## Prueba reproducible

```sh
npm run test:e2e -- --grep 'real WebRTC'
```

Abre contextos independientes, conecta Central y B-01, envía texto similar a
HTML y verifica recepción sin ejecución, comprueba que no aparece en los cuerpos
HTTP, graba el dispositivo sintético de Chromium y verifica audio decodificable
y ACK. El transporte WebRTC es real. No prueba acústica de micrófono físico ni
redes externas.
