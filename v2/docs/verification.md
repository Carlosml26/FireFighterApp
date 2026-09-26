# Revisión local · 26 de septiembre de 2026

La comprobación local se ha repetido con el frontend actualizado: tema oscuro/diurno,
emblema propio, nueva central, vista de equipo y navegación móvil.

## Entorno

- macOS, Node.js 24.19.0.
- Chromium 153 mediante Playwright, contextos de navegador independientes.
- Vista escritorio 1440 × 1000, tablet 1024 × 768 y móvil 390 × 844.
- Servidor de revisión en `127.0.0.1:4318`, SQLite en `data/brigada.sqlite`.
- Pruebas end-to-end en puerto 4320, con base separada en memoria.

## Resultado

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 15 pruebas aprobadas |
| `npm run test:e2e` | 3 recorridos de navegador aprobados |
| `npm run check` | Sintaxis, manifiesto y referencias OpenAPI correctos |
| `npm run format:check` | Formato uniforme de los módulos mantenidos |
| `npm audit --omit=dev` | 0 vulnerabilidades notificadas en dependencias de V2 |

El audit corresponde a V2, no al árbol histórico de LoopBack.
La CI se ha ampliado para ejecutar estos controles y guardar trazas de fallo;
el resultado remoto debe consultarse en los checks del commit o PR correspondiente.
Este informe acredita la verificación local, no sustituye el estado de GitHub.

## Recorridos y evidencia

1. Crear intervención, asignar equipo, confirmar desde tablet, salida, llegada,
   geolocalización, finalización y cierre. Editar equipo y consultar el evento.
2. Texto y nota de voz entre dos contextos por WebRTC, con ACK. El texto no
   aparece en cuerpos HTTP y una cadena con apariencia de HTML se presenta
   literalmente. Audio recibido y reproducible.
3. Formulario y navegación móvil sin desbordamiento horizontal de la página,
   pérdida de conexión y recuperación.

Las pruebas de servidor verifican el ciclo operativo y sus restricciones,
permisos por rol y unidad, posiciones inválidas/antiguas, idempotencia después
de reabrir SQLite, rollback de memoria y auditoría ante un error de escritura,
autorización del canal, aislamiento por intervención, tokens, expiración y
revocación de participantes.

Se revisaron visualmente las capturas siguientes:

- [Central de operaciones](central-desktop.png)
- [Equipo en tablet](equipo-tablet.png)
- [Administración](administracion-desktop.png)
- [Comunicación directa](comunicaciones-desktop.png)
- [Central en móvil](central-mobile.png)

Las capturas procedentes de tests pueden incluir nombres de ejercicios, avisos
de confirmación o cadenas de prueba. No son incidentes reales.

## Alcance de la evidencia

La grabación usa el dispositivo sintético de Chromium y la geolocalización está
controlada por la prueba. Los tres recorridos cubren los flujos principales; no validan por separado todas
las plantillas, zonas, distancias, alertas acústicas o vibración.
No se ha probado acústica real, tablets físicas, Safari,
Firefox, ejecución en segundo plano, redes móviles/NAT, pérdida de paquetes ni
funcionamiento bajo carga. No se ha migrado MongoDB ni desplegado en producción.

El código histórico y las modificaciones locales previas se conservaron. La
nueva implementación y documentación pertenecen al mismo repositorio
`Carlosml26/FireFighterApp`, dentro de `v2/`.
