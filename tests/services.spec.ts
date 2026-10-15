import { test, expect } from "@playwright/test";

test("owner checks real isolated Postgres and private storage, including cleanup", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__Secure-neon-auth.session_token",
      value: "owner",
      domain: "localhost",
      path: "/",
      secure: true,
    },
  ]);
  await page.goto("/check");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/foundation") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Kör anslutningsprov" }).click();
  const result = await response;
  expect(await result.json()).toEqual({
    ok: true,
    database: "verified",
    privateImage: "verified",
    cleanup: "verified",
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Databasen och den privata bildlagringen fungerar" }),
  ).toContainText("Testdata och testbild är borttagna");
});
