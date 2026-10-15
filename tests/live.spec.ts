import { test, expect } from "@playwright/test";

test("real signed-in owner can verify the deployed foundation", async ({
  page,
  browser,
}) => {
  await page.goto("/check");
  const check = page.getByRole("button", {
    name: /Kör anslutningsprov|Run connection check/,
  });
  await expect(check).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/foundation") && r.request().method() === "POST",
  );
  await check.click();
  expect(await (await response).json()).toEqual({
    ok: true,
    database: "verified",
    privateImage: "verified",
    cleanup: "verified",
  });
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.post(
    `${process.env.LIVE_BASE_URL}/api/foundation`,
    {
      headers: { Origin: process.env.LIVE_BASE_URL! },
      data: {},
    },
  );
  expect(denied.status()).toBe(401);
  await anonymous.close();
});
