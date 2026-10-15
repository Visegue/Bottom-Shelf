import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/server";
import { AppError } from "@/lib/config";
import { getLocale, messages } from "@/lib/i18n";
import { Shell } from "./shell";
import { Controls } from "./controls";

export default async function Home() {
  const locale = await getLocale();
  const m = messages[locale];
  const configured = Boolean(
    process.env.NEON_AUTH_BASE_URL &&
    process.env.NEON_AUTH_COOKIE_SECRET &&
    process.env.OWNER_EMAIL,
  );
  let signedIn = false;
  if (configured) {
    try {
      await requireOwner();
      signedIn = true;
    } catch (e) {
      signedIn = e instanceof AppError && e.code === "forbidden";
    }
  }
  if (signedIn) redirect("/check");
  return (
    <Shell locale={locale}>
      <div className="shelf" aria-hidden="true">
        <span className="bottle" />
        <span className="bottle" />
      </div>
      <h1>{m.title}</h1>
      <p>{m.intro}</p>
      <Controls messages={m} mode="signIn" configured={configured} />
    </Shell>
  );
}
