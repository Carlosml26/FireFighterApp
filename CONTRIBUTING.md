# Desarrollo y contribución

## Dónde trabajar

La aplicación mantenida está en `v2/`. Lee [AGENTS.md](AGENTS.md) antes de
cambiar código. `serverDB/` y `signalServer/` son referencias históricas: no
extiendas ni despliegues esos runtimes como parte de V2.

## Preparar el entorno

```sh
cd v2
# Con nvm instalado: nvm install && nvm use
npm ci
npx playwright install chromium
npm start
```

Se requiere Node 24.19+. El frontend usa módulos ES y CSS: no hay bundler ni
`npm run build`. Reinicia el proceso para cambios de servidor y recarga la
página para cambios de frontend. Usa una base distinta mediante `DB_PATH` para
experimentos; no compartas un archivo SQLite entre procesos.

## Controles antes de publicar

```sh
npm run check
npm run format:check
npm test
npm audit --omit=dev
npm run test:e2e
```

`npm run format` aplica Prettier a los módulos mantenidos. `check` valida sintaxis,
manifiesto y referencias OpenAPI. Playwright ejecuta los clientes reales contra
un servidor separado en 4320 con SQLite en memoria; no usa datos de la sesión.
Las capturas se regeneran en `v2/docs/`; revisa los cambios antes de incluirlas.
Las trazas de fallo se guardan en `v2/test-results/`, excluido de Git.

Para cambios de comportamiento, añade pruebas que verifiquen el contrato y los
permisos relevantes. Un cambio de texto/documentación no necesita pruebas que
repliquen su implementación. Actualiza OpenAPI si cambia la API y las guías si
cambia la forma de instalar, conectar o usar la aplicación.

## Qué incluir en un commit

- Código, lockfile, pruebas y documentación aplicables al cambio.
- Capturas reproducibles con datos ficticios, si han cambiado las vistas.
- Ninguna base SQLite, export privado, `node_modules`, credencial, `.env` local,
  traza de navegador o copia de seguridad.

`v2/.env.example` documenta variables y no contiene secretos. La aplicación no
lo carga automáticamente. La CI está en [v2-ci.yml](.github/workflows/v2-ci.yml).
Una CI aprobada acredita las comprobaciones allí ejecutadas, no un piloto real.

## Entrega y revisión

Trabaja en una rama, sube commits normales y abre una PR contra `master`.
Describe el comportamiento resultante, validación y limitaciones pertinentes.
No reescribas historia ni elimines cambios ajenos. Actualiza el registro de
verificación cuando hayas vuelto a ejecutar las pruebas y distingue resultados
locales de los checks de GitHub.

El paquete se declara `UNLICENSED`; no supongas una licencia de código abierto
por estar el repositorio visible. Las dependencias conservan sus propias licencias.
