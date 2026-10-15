"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function changeLanguage(form: FormData) {
  const locale = form.get("locale");
  if (locale !== "sv" && locale !== "en") return;
  (await cookies()).set("bottom-shelf-language", locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(form.get("returnTo") === "/check" ? "/check" : "/");
}
