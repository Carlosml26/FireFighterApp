# Manual de uso

## Orientación y perfiles

La navegación separa **Central**, **Mi equipo**, **Comunicaciones**,
**Administración** y **Registro**. En móvil se presenta abajo; las métricas
pueden desplazarse lateralmente dentro de su tira. El selector **Perfil local**
permite ensayar cada rol sin login. Entrar en Central o Administración selecciona
el perfil correspondiente; Mi equipo permite operar como una unidad del directorio.

El emblema es original, con morado, verde y una llama; no representa un escudo
oficial. **Modo día / Modo noche** cambia la presentación y recuerda la preferencia
mediante `localStorage` de ese navegador/origen. No cambia datos ni roles.

## Central de operaciones

### Crear y localizar un aviso

1. Pulsa **Nueva intervención**, o `N` sin estar escribiendo en un formulario.
2. Puedes elegir un tipo de aviso para completar título, prioridad y riesgos.
   Revísalos: las plantillas son ayudas de captura, no una evaluación del aviso.
3. Elige una zona de Málaga para obtener un punto aproximado, edita coordenadas
   o pulsa antes en el mapa para fijar una ubicación.
4. Describe el aviso, revisa riesgos y guarda. La central lo registra en SQLite.

Las zonas incluyen centros aproximados de distritos y áreas; no son un buscador
de direcciones ni límites cartográficos oficiales. Para una ubicación precisa,
utiliza coordenadas verificadas. El mapa permite aproximar visualmente el punto.

### Entender la cola y el mapa

Los avisos activos se ordenan por prioridad, y muestran tiempo transcurrido,
riesgos y dotaciones asignadas. **Sin dotación** indica que no hay asignaciones
activas. Busca texto o usa los filtros de activas, cerradas y todas. `/` enfoca
la búsqueda desde Central cuando no estás editando otro campo.

El mapa distingue avisos y unidades; las dotaciones se colorean por estado y
los avisos críticos se resaltan. El tiempo visible cambia cada segundo, mientras
los datos se consultan cada tres: un reloj que avanza no prueba que haya llegado
una posición reciente. Revisa la antigüedad en el marcador o detalle del equipo.

### Asignar, retirar y cerrar

Selecciona el aviso y una dotación disponible. La sugerencia de cercanía se basa
en distancia geodésica aproximada a su última posición. **No considera tráfico,
rutas, capacidades ni excluye automáticamente posiciones antiguas.** Si no hay
distancia visible, no puede establecerse cercanía geográfica con ese dato.
La sugerencia requiere una decisión manual: pulsa **Asignar** para registrar la orden.

La asignación aparece pendiente. El equipo puede confirmar o rechazar indicando
un motivo; si Central detecta un rechazo mientras está abierta, muestra un aviso.
**Retirar** cancela la asignación con un motivo y libera la unidad. **Cerrar
intervención** solo se permite cuando no quedan asignaciones activas; exige un
resumen o motivo de cierre.

## Mi equipo

Elige una unidad en **Perfil local**. Su vista muestra misión, riesgos, posición,
distancia aproximada y acciones grandes:

```text
Aviso pendiente → Confirmar → Iniciar salida → Confirmar llegada
               → Rechazar con motivo         → Finalizar y quedar disponible
```

No se puede iniciar la salida antes de confirmar. Si no puede atender el aviso,
usa el rechazo con motivo. La central también puede retirar la asignación.

Al detectar una nueva asignación se destaca una banda visual y se intenta emitir
un pitido y vibración. El navegador puede impedir el sonido hasta que haya una
interacción; no todos los dispositivos admiten vibración. No son notificaciones
push ni una garantía con la pestaña suspendida o el dispositivo bloqueado.

**Compartir mi posición** obtiene una lectura del navegador, solicita permiso y
la envía al servidor. No activa seguimiento continuo ni ubicación en segundo
plano. La precisión depende del dispositivo; se pueden rechazar posiciones
antiguas o desplazamientos implausibles.

**Cómo llegar** abre Google Maps con las coordenadas del destino en una pestaña
externa. Al usar ese enlace, el destino se comunica a Google. La navegación,
ruta y estimación de llegada pertenecen a ese servicio, no a Brigada.

## Comunicaciones

1. Entra con Central o un equipo asignado a una intervención abierta.
2. Selecciona la intervención y pulsa **Conectar al canal**.
3. Espera a que otro participante se conecte y aparezca el canal directo.
4. Escribe y pulsa **Enviar**, usa un mensaje rápido, o pulsa **Voz** y después
   **Enviar nota**. Las notas se detienen automáticamente a los 20 segundos.

Un mensaje rápido es texto normal de chat: «Solicito refuerzos» no crea ni asigna
una dotación; «Situación controlada» no cierra el aviso. Esas decisiones deben
registrarse con las acciones operativas correspondientes.

**Enviado** no equivale a recibido. **Recibido** corresponde al ACK de los
navegadores conectados al enviar, no a lectura humana. **Sin confirmar** indica
que faltan confirmaciones tras el plazo. Desconectar o cambiar de perfil cierra
el canal y elimina la conversación de esa sesión; no existe historial duradero.

[Contrato, límites y resolución de dudas WebRTC](communications.md).

## Administración y registro

**Registrar equipo** crea una unidad con indicativo único, nombre y capacidades.
**Editar** modifica esos datos sin alterar una asignación activa. El directorio
no es un gestor de usuarios, contraseñas, vehículos independientes ni turnos.

**Registro** muestra los comandos operativos, actor, rol y fecha. Permite buscar
y exportar JSON. Los mensajes de chat no forman parte de ese historial. El
registro es append-only desde la aplicación, no una prueba criptográfica contra
la modificación del archivo por quien administre el ordenador.

## Si falla la conexión

Revisa el indicador de conexión. Los datos visibles pueden corresponder al
último estado recibido. No hay una cola offline que ejecute órdenes al volver
la red; una acción fallida debe revisarse explícitamente. El canal directo
necesita seguir comprobando pertenencia con el servidor; se interrumpe si no
puede hacerlo.

Consulta [mantenimiento](runbook.md) y conserva los procedimientos de
comunicación operativa existentes durante las pruebas.
