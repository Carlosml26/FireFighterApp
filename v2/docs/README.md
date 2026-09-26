# Documentación de Brigada Málaga V2

La fuente de verdad para el comportamiento actual es el código de `v2/`.
Estas guías describen la aplicación local, con el frontend oscuro/diurno actual.
El plan de producción y los documentos históricos se identifican por separado.

## Recorrido recomendado

1. [Requisitos y alcance](requirements.md): qué necesitas y qué está implementado.
2. [Instalación y conexión](installation.md): arranque desde GitHub y dos clientes.
3. [Manual de uso](user-guide.md): central, dotaciones, administración y chat.
4. [Arquitectura](architecture.md): procesos, módulos, estados, permisos y datos.
5. [Guía de API](api-guide.md) y [OpenAPI](../openapi.yaml): rutas y ejemplos.
6. [Comunicación directa](communications.md): señalización, mensajes, voz y ACK.
7. [Mantenimiento](runbook.md): configuración, backup, actualización y recuperación.
8. [Verificación](verification.md): pruebas ejecutadas y límites de la evidencia.

## Documentos de contexto

- [README del proyecto](../../README.md) y [README de V2](../README.md).
- [Guía de contribución](../../CONTRIBUTING.md).
- [Plan de modernización](../../docs/modernization-plan.md): objetivos futuros.
- [Auditoría del prototipo](../../docs/legacy-audit.md): informe histórico; sus
  cifras de dependencias no representan la auditoría actual de V2.
- [README del primer núcleo V2](reference-v2-readme.md): archivado; conserva
  descripciones de almacenamiento en memoria que ya no aplican al arranque actual.

## Capturas

[Central](central-desktop.png) · [Tablet](equipo-tablet.png) ·
[Administración](administracion-desktop.png) ·
[Comunicaciones](comunicaciones-desktop.png) · [Móvil](central-mobile.png).

Las capturas muestran escenarios ficticios y pueden contener mensajes de test.
No hay datos de incidentes reales.
