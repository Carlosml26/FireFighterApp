import { test, expect } from "@playwright/test";

test("dispatch, tablet acknowledgement, geolocation, closure and admin editing", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Servidor conectado")).toBeVisible();
  await page.getByRole("button", { name: "Nueva intervención" }).click();
  await page
    .getByLabel("Título del aviso")
    .fill("Prueba integral de coordinación");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Escenario automatizado de entrenamiento.");
  await page
    .getByRole("button", { name: "Crear intervención", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#detail h2")).toHaveText(
    "Prueba integral de coordinación",
  );
  const local = await (await page.request.get("/v1/local-context")).json();
  const unit = local.units.find((u) => u.callSign === "B-02");
  await page.getByLabel("Equipo a asignar").selectOption(unit.id);
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.locator("#detail")).toContainText("Pendiente de confirmar");

  const crewContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4320",
    viewport: { width: 1024, height: 768 },
    permissions: ["geolocation"],
    geolocation: { latitude: 36.7203, longitude: -4.4246, accuracy: 12 },
  });
  const crew = await crewContext.newPage();
  await crew.goto(`/?unit=${unit.id}#field`);
  await crew.getByRole("button", { name: "Confirmar asignación" }).click();
  await crew.getByRole("button", { name: "Iniciar salida" }).click();
  await crew.getByRole("button", { name: "Confirmar llegada" }).click();
  await crew.getByRole("button", { name: "Compartir mi posición" }).click();
  await expect(crew.locator("#toast")).toHaveText("Posición compartida.");
  await crew.screenshot({ path: "docs/equipo-tablet.png", fullPage: true });
  await crew
    .getByRole("button", { name: "Finalizar y quedar disponible" })
    .click();
  await expect(
    page.getByRole("button", { name: "Cerrar intervención", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Cerrar intervención", exact: true })
    .click();
  await page
    .getByLabel("Resumen y motivo del cierre")
    .fill("Ejercicio terminado.");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator("#detail")).toContainText("Cerrada");
  await page.getByRole("link", { name: "Administración", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Administración", exact: true }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "B-02" });
  await row.getByRole("button", { name: "Editar" }).click();
  await page
    .getByLabel("Nombre del equipo")
    .fill("Equipo actualizado en prueba");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(row).toContainText("Equipo actualizado en prueba");
  await page.screenshot({
    path: "docs/administracion-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Registro de actividad", exact: true })
    .click();
  await expect(page.locator("#history-panel")).toContainText(
    "Intervención cerrada",
  );
  expect(errors).toEqual([]);
  await crewContext.close();
});

test("real WebRTC text and voice receipts between isolated browser contexts", async ({
  page,
  browser,
}) => {
  const transmittedBodies = [];
  page.on("request", (request) => {
    if (request.method() === "POST") transmittedBodies.push(request.postData());
  });
  await page.goto("/");
  await expect(page.getByText("Servidor conectado")).toBeVisible();
  const local = await (await page.request.get("/v1/local-context")).json();
  const unit = local.units.find((u) => u.callSign === "B-01");
  const crewContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4320",
    permissions: ["microphone"],
  });
  const crew = await crewContext.newPage();
  await crew.goto(`/?unit=${unit.id}#field`);
  await expect(crew.locator("#field-panel")).toContainText("B-01");
  for (const client of [page, crew]) {
    await client
      .getByRole("link", { name: "Comunicaciones", exact: true })
      .click();
    await client
      .getByLabel("Intervención", { exact: true })
      .selectOption({ label: "Incendio en vivienda" });
    await client
      .getByRole("button", { name: "Conectar al canal", exact: true })
      .click();
  }
  await expect(page.locator("#radio-status")).toContainText("Canal directo");
  await expect(crew.locator("#radio-status")).toContainText("Canal directo");
  const message = "Prueba P2P <img src=x onerror=alert(1)> solo texto";
  await page.getByLabel("Mensaje", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(crew.locator("#messages")).toContainText(message);
  await expect(page.locator(".message.own")).toContainText("Recibido");
  expect(await crew.locator("#messages img").count()).toBe(0);
  expect(transmittedBodies.join("\n")).not.toContain(message);
  await crew.getByRole("button", { name: "Grabar nota de voz" }).click();
  await expect(crew.locator("#record-voice")).toHaveText("■ Enviar nota");
  await crew.waitForTimeout(1000);
  await crew.getByRole("button", { name: "Grabar nota de voz" }).click();
  await expect(page.locator("#messages audio")).toHaveCount(1);
  await expect(crew.locator(".message.own")).toContainText("Recibido");
  const audio = page.locator("#messages audio");
  await expect
    .poll(() => audio.evaluate((element) => element.readyState))
    .toBeGreaterThan(0);
  await audio.evaluate((element) => element.play());
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0.2);
  await audio.evaluate((element) => element.pause());
  await page.screenshot({
    path: "docs/comunicaciones-desktop.png",
    fullPage: true,
  });
  await crew.getByRole("button", { name: "Desconectar", exact: true }).click();
  await expect(page.locator("#radio-status")).toHaveText(
    "Esperando participantes",
  );
  await crewContext.close();
});

test("mobile navigation, safe offline state and narrow viewport layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Servidor conectado")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/central-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Nueva intervención" }).click();
  await expect(page.getByLabel("Título del aviso")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("link", { name: "Administración", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Administración", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.context().setOffline(true);
  await expect(page.locator("#connection")).toContainText("Sin conexión");
  await page.context().setOffline(false);
  await expect(page.getByText("Servidor conectado")).toBeVisible();
});
