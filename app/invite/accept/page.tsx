import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import AcceptInvite from "./AcceptInvite";

export const metadata = { title: "Set your password – Jadvix CRM" };

/*
 * The landing page for the link in an invitation email.
 *
 * Public by design — the token IS the credential — which is why the endpoints
 * behind it are rate limited and answer every failure with one generic message.
 */
export default async function AcceptInvitePage({
  // Typed manually rather than via PageProps<"/invite/accept">: the generated
  // route types only exist after the first build, and this page has to compile
  // before it has ever been built.
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = typeof raw === "string" ? raw : "";

  return (
    <main className="flex min-h-screen flex-col justify-center bg-body px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <Image
          src="/jadvix-logo.svg"
          alt="Jadvix"
          width={2826}
          height={654}
          priority
          unoptimized
          className="mb-8 h-8 w-auto dark:hidden"
        />
        <Image
          src="/jadvix-logo-light.svg"
          alt="Jadvix"
          width={2826}
          height={654}
          priority
          unoptimized
          className="mb-8 hidden h-8 w-auto dark:block"
        />

        <AcceptInvite token={token} />

        <p className="mt-6 flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted">
          <ShieldCheck size={14} className="mt-px shrink-0" />
          <span>
            This link works once and expires. Your password is hashed with argon2
            and is never stored or logged in readable form.
          </span>
        </p>
      </div>
    </main>
  );
}
