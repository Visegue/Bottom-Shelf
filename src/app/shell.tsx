import { changeLanguage } from "./actions";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

export function Shell({
  locale,
  children,
  returnTo = "/",
}: {
  locale: Locale;
  children: React.ReactNode;
  returnTo?: string;
}) {
  return (
    <div className="shell">
      <header>
        <Link className="brand" href="/">
          Bottom Shelf
          <span className="brand-dot" aria-hidden="true">
            ●
          </span>
        </Link>
        <form
          action={changeLanguage}
          className="language"
          aria-label={locale === "sv" ? "Språk" : "Language"}
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <button name="locale" value="sv" aria-pressed={locale === "sv"}>
            Svenska
          </button>
          <button name="locale" value="en" aria-pressed={locale === "en"}>
            English
          </button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
