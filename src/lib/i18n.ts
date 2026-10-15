import { cookies } from "next/headers";

export const messages = {
  sv: {
    title: "Din samling börjar här.",
    intro: "En egen plats för flaskorna du har hemma. Bara du har nyckeln.",
    signIn: "Fortsätt med Google",
    signingIn: "Ansluter till Google…",
    signedInAs: "Inloggad som",
    signOut: "Logga ut",
    signingOut: "Loggar ut…",
    private: "Din privata hylla",
    checkTitle: "Kontrollera anslutningarna",
    checkIntro:
      "Provet använder tillfälliga uppgifter och en liten testbild. Båda tas bort efter kontrollen.",
    check: "Kör anslutningsprov",
    checking: "Kontrollerar…",
    success:
      "Databasen och den privata bildlagringen fungerar. Testdata och testbild är borttagna.",
    setup: "Inloggningen är inte färdigkonfigurerad ännu.",
    errors: {
      unauthorized: "Logga in för att fortsätta.",
      forbidden:
        "Det här kontot har inte tillgång. Logga ut och välj det godkända Google-kontot.",
      configuration:
        "Anslutningen är inte färdigkonfigurerad. Försök igen när uppsättningen är klar.",
      unavailable:
        "Kontrollen misslyckades. Försök igen. Om felet kvarstår behöver anslutningen kontrolleras.",
      cleanup:
        "Testdata kunde inte städas bort. Kontrollera miljön innan du kör provet igen.",
      request: "Begäran kunde inte genomföras. Ladda om sidan och försök igen.",
      network:
        "Det gick inte att ansluta. Kontrollera internetanslutningen och försök igen.",
      auth: "Inloggningen misslyckades. Försök igen med Google.",
    },
  },
  en: {
    title: "Your collection starts here.",
    intro:
      "A place of your own for the bottles at home. Only you have the key.",
    signIn: "Continue with Google",
    signingIn: "Connecting to Google…",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signingOut: "Signing out…",
    private: "Your private shelf",
    checkTitle: "Check the connections",
    checkIntro:
      "The check uses temporary data and a small test image. Both are removed afterwards.",
    check: "Run connection check",
    checking: "Checking…",
    success:
      "The database and private image storage work. Test data and the test image have been removed.",
    setup: "Sign-in has not been configured yet.",
    errors: {
      unauthorized: "Sign in to continue.",
      forbidden:
        "This account does not have access. Sign out and choose the approved Google account.",
      configuration:
        "The connection has not been configured yet. Try again when setup is complete.",
      unavailable:
        "The check failed. Try again. If the error persists, the connection needs to be checked.",
      cleanup:
        "Test data could not be removed. Check the environment before running the check again.",
      request:
        "The request could not be completed. Reload the page and try again.",
      network:
        "Could not connect. Check your internet connection and try again.",
      auth: "Sign-in failed. Try again with Google.",
    },
  },
};
export type Locale = keyof typeof messages;
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("bottom-shelf-language")?.value === "en"
    ? "en"
    : "sv";
}
