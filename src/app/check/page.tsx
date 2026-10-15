import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/server";
import { AppError } from "@/lib/config";
import { getLocale, messages } from "@/lib/i18n";
import { Controls } from "../controls";
import { Shell } from "../shell";

export default async function Check() {
  const locale = await getLocale();
  const m = messages[locale];
  let error: keyof typeof m.errors | null = null;
  let ownerEmail: string | null = null;
  try {
    const owner = await requireOwner();
    ownerEmail = owner.email;
  } catch (e) {
    if (e instanceof AppError && e.code === "unauthorized") redirect("/");
    error = e instanceof AppError ? e.code : "unavailable";
  }
  return (
    <Shell locale={locale} returnTo="/check">
      {ownerEmail ? (
        <output className="notice">
          {m.signedInAs} {ownerEmail}
        </output>
      ) : null}
      <h1>{error ? m.private : m.checkTitle}</h1>
      {error ? (
        <p className="notice error" role="alert">
          {m.errors[error]}
        </p>
      ) : (
        <p>{m.checkIntro}</p>
      )}
      <Controls messages={m} mode={error ? "denied" : "check"} />
    </Shell>
  );
}
