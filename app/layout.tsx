import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import ReduxProvider from "@/lib/store/ReduxProvider";

// Valex ships --default-font-family:"Roboto",sans-serif
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Jadvix CRM – Sales Dashboard",
  description: "Jadvix LTD sales monitoring and customer relationship dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      dir="ltr"
      data-theme-mode="light"
      className={`${roboto.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* Sits at the root so the login and invite screens can talk to the API
            too, not only the signed-in shell. */}
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
