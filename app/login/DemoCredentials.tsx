import { ArrowRight } from "lucide-react";
import { portalsByGroup } from "@/lib/portals";
import { loginAsDemo } from "@/lib/actions";

/**
 * Each row is its own form posting to a server action, so "open" works without
 * client JS and without ever putting the password in a query string.
 *
 * With fifteen portals a flat list runs off the screen, so they are bucketed by
 * group and the whole thing scrolls inside its own box rather than pushing the
 * sign-in form off the page.
 */
export default function DemoCredentials() {
  return (
    <div className="max-h-96 space-y-4 overflow-y-auto rounded-card border border-line p-3">
      {portalsByGroup().map(({ group, items }) => (
        <section key={group}>
          <h2 className="mb-1.5 px-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
            {group}
          </h2>
          <ul className="space-y-1.5">
            {items.map((p) => (
              <li key={p.slug}>
                <form action={loginAsDemo}>
                  <input type="hidden" name="portal" value={p.slug} />
                  <button
                    type="submit"
                    className="group flex w-full items-center gap-3 rounded-sm border border-line bg-card p-2.5 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[0.8125rem] font-semibold text-heading">
                          {p.name}
                        </span>
                        <span className="truncate text-[0.6875rem] text-muted">{p.demo.user}</span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-muted">
                        {p.demo.email} · {p.demo.password}
                      </span>
                    </span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
