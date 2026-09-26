# Guía de la API local

Contrato completo: [OpenAPI 3.1](../openapi.yaml). URL base predeterminada:
`http://127.0.0.1:4318`. El servidor y el frontend comparten origen. No hay un
Swagger UI alojado: puedes abrir el YAML con tu visor OpenAPI habitual.

## Identidad y permisos

Las cabeceras son un adaptador de **desarrollo**, no tokens ni autenticación:

```text
x-actor-id: identificador-del-actor
x-actor-role: dispatcher | incident_commander | crew_leader | system_admin | auditor
x-unit-id: id-de-la-unidad (obligatorio para crew_leader)
```

El API comprueba rol y unidad. `incident_commander` y `auditor` existen en el
contrato, aunque no tengan un perfil independiente en el selector de la interfaz.
No expongas este esquema a una red como si acreditase identidad.

## Consultas

```sh
curl http://127.0.0.1:4318/health
curl http://127.0.0.1:4318/v1/local-context
curl http://127.0.0.1:4318/v1/state \
  -H 'x-actor-id: central-local' \
  -H 'x-actor-role: dispatcher'
```

`local-context` describe configuración y perfiles locales, sin necesidad de
cabeceras de actor. `state` devuelve incidentes, unidades, asignaciones y
posiciones visibles para el actor. Para un equipo limita la respuesta a su
unidad, sus asignaciones permitidas, incidentes correspondientes y posición.

## Comandos operativos

Los comandos son `POST` JSON y requieren `idempotency-key`. Ejemplo para crear
una unidad ficticia desde Administración:

```sh
curl -i http://127.0.0.1:4318/v1/units \
  -H 'content-type: application/json' \
  -H 'x-actor-id: admin-local' \
  -H 'x-actor-role: system_admin' \
  -H 'idempotency-key: guia-unidad-01' \
  --data '{"callSign":"PRUEBA-01","name":"Equipo de prueba","capabilities":["Rescate"]}'
```

Repetir ese comando con la misma identidad, clave y cuerpo devuelve el mismo
resultado y no duplica unidad ni evento, incluso tras reiniciar con la misma
base persistente. Cambiar el cuerpo exige una clave nueva; reutilizarla con otro
comando o cuerpo devuelve `409 idempotency_conflict`.

| Ruta | Rol permitido / efecto |
| --- | --- |
| `POST /v1/units` | Central o Administración: registrar unidad |
| `POST /v1/unit-details` | Administración: editar nombre, indicativo, capacidades |
| `POST /v1/incidents` | Central o mando: crear aviso |
| `POST /v1/assignments` | Central o mando: asignar unidad disponible |
| `POST /v1/assignment-cancellations` | Central o mando: retirar asignación con motivo |
| `POST /v1/assignment-responses` | Equipo propietario: confirmar o rechazar |
| `POST /v1/unit-status` | Equipo propietario: transición válida de estado |
| `POST /v1/locations` | Equipo propietario: registrar posición con precisión y timestamp |
| `POST /v1/incident-closures` | Central o mando: cerrar aviso sin asignaciones activas |
| `GET /v1/audit-events` | Administración o auditoría: consultar eventos |

Consulta en OpenAPI los cuerpos exactos. Por ejemplo, una respuesta a asignación
usa `{assignmentId, decision: "acknowledge"}` o `decision: "reject"` con `reason`.
No uses IDs de ejemplo: obtén los IDs de la respuesta de creación o de `state`.

## Errores y consistencia

| Estado HTTP | Interpretación |
| --- | --- |
| `200` | Consulta o señalización correcta |
| `201` | Comando operativo confirmado, incluido replay |
| `400` | JSON/campos inválidos, clave ausente o posición inválida |
| `401` | Falta identidad de desarrollo o rol válido |
| `403` | Rol, unidad, origen, host o sesión peer no permitidos |
| `404` | Recurso o ruta inexistentes |
| `409` | Conflicto de estado, clave reutilizada o posición no aceptable |
| `413` | Cuerpo superior a 32768 bytes |
| `429` | Capacidad de sesiones/señales alcanzada |
| `500` | Error inesperado; revisar terminal y persistencia |

Los errores se devuelven como `{error: {code, message, details?}}`. Un timeout
no prueba que el comando no se guardara; reintenta **la misma operación con la
misma clave y cuerpo**. La API confirma después de guardar en SQLite. No hay
reintentos automáticos offline del frontend.

## Señalización

`POST /v1/peers` devuelve una sesión efímera. Consultar presencia, enviar señales
y salir requieren `x-peer-token` además de la identidad. Estas rutas no utilizan
la idempotencia de comandos operativos. No existe una ruta HTTP para mensajes
ni audios: el contenido viaja por DataChannel.

[Detalles de señalización y WebRTC](communications.md).
