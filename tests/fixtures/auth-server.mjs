import { createServer } from "node:http";

// External Managed Auth boundary fixture. Never imported into the app or deployed.
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/get-session")) {
    const cookie = req.headers.cookie ?? "";
    const token = cookie.match(/__Secure-neon-auth.session_token=([^;]+)/)?.[1];
    if (!token || token === "invalid") {
      res.end("null");
      return;
    }
    const user = {
      id: token === "different-id" ? "other-user" : "test-owner",
      name: "Test owner",
      email:
        token === "different-email"
          ? "other@example.test"
          : "owner@example.test",
      emailVerified: token !== "unverified",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.end(
      JSON.stringify({
        user,
        session: {
          id: "test-session",
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    return;
  }
  res.end("{}");
}).listen(4101, "127.0.0.1");
