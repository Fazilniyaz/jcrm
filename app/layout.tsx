import type { Metadata } from "next";
import "./globals.css";
// The portal skin, loaded AFTER globals so it wins: base tokens → skin.
import "./portal-skin.css";
// Colour themes (the data-theme axis). Last, so they win over both files above.
import "./theme-palettes.css";
import { portalFontClass } from "./fonts";
import { PALETTE_IDS } from "@/lib/palettes";
import ReduxProvider from "@/lib/store/ReduxProvider";
import Grain from "@/components/ui/Grain";

export const metadata: Metadata = {
  title: "Jadvix CRM – Sales Dashboard",
  description: "Jadvix LTD sales monitoring and customer relationship dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-theme-mode` renders "light" on the server — the default — so a first
    // visit, and every render with JS still loading, is the bright surface this
    // portal is designed around. The pre-paint script below rewrites it (and the
    // colour palette) to the stored choice before first paint.
    <html
      lang="en"
      dir="ltr"
      data-theme-mode="light"
      data-theme="classic"
      className={`${portalFontClass} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/*
          Restores the stored theme BEFORE the first paint. Applied from an
          effect instead, the page would paint once at the light default and
          again at the user's choice — a white flash on every load for someone
          who reads in the dark. Keys match lib/theme.ts.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.setAttribute("data-theme-mode",localStorage.getItem("jadvix.theme")==="dark"?"dark":"light")}catch(e){}try{var d=document.documentElement;var p=localStorage.getItem("jadvix.theme-palette");d.setAttribute("data-theme",/^(${PALETTE_IDS.join("|")})$/.test(p)?p:"classic")}catch(e){}`,
          }}
        />
        {/* Sits behind everything, fixed and non-interactive. See Grain.tsx. */}
        <Grain />
        {/* Sits at the root so login and invite screens can talk to the API too. */}
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
