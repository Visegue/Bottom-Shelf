import { test, expect } from "@playwright/test";

test("signed-in owner sees account status when returning to the home page", async ({
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
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "Inloggad som owner@example.test",
  );
  await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fortsätt med Google" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("owner@example.test");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Signed in as owner@example.test",
  );
});

test("an expired session still shows sign-in without redirecting in a loop", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__Secure-neon-auth.session_token",
      value: "invalid",
      domain: "localhost",
      path: "/",
      secure: true,
    },
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Fortsätt med Google" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("language choice survives reloading on mobile and desktop", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Din samling börjar här." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("heading", { name: "Your collection starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your collection starts here." }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

for (const token of ["different-id", "different-email", "unverified"]) {
  test(`private server rejects ${token} even with an authenticated session`, async ({
    request,
  }) => {
    const res = await request.post("/api/foundation", {
      headers: {
        Cookie: `__Secure-neon-auth.session_token=${token}`,
        Origin: "http://localhost:3000",
      },
      data: {},
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });
}

test("an owner cannot trigger checks from another origin", async ({
  request,
}) => {
  const res = await request.post("/api/foundation", {
    headers: {
      Cookie: "__Secure-neon-auth.session_token=owner",
      Origin: "https://other.example",
    },
    data: {},
  });
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ error: "request" });
});

test("email registration and other providers are denied through the server", async ({
  request,
}) => {
  const email = await request.post("/api/auth/sign-up/email", {
    data: { email: "other@example.test", password: "not-a-real-password" },
  });
  expect(email.status()).toBe(403);
  const social = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: "http://localhost:3000" },
    data: { provider: "github", callbackURL: "http://localhost:3000/check" },
  });
  expect(social.status()).toBe(403);
});

test("sign-in failures are visible and can be retried", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"Unavailable"}',
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Fortsätt med Google" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Inloggningen misslyckades",
  );
  await expect(
    page.getByRole("button", { name: "Fortsätt med Google" }),
  ).toBeEnabled();
});

test("private page rejects a different account and offers sign-out", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__Secure-neon-auth.session_token",
      value: "different-id",
      domain: "localhost",
      path: "/",
      secure: true,
    },
  ]);
  await page.goto("/check");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Det här kontot har inte tillgång",
  );
  await expect(
    page.getByRole("button", { name: "Kör anslutningsprov" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();
});

test("private server checks deny direct anonymous requests", async ({
  request,
}) => {
  const res = await request.post("/api/foundation", {
    headers: { Origin: "http://localhost:3000" },
    data: {},
  });
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
