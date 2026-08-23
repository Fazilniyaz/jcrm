import { ModuleSkeleton, Skeleton } from "@/components/ui";

/*
 * Route-level fallback for every module.
 *
 * Two things depend on this file existing, and both were broken without it.
 *
 * 1. Feedback. Without a loading boundary the App Router has nothing to swap
 *    to, so a navigation blocks: the previous module stays fully painted and
 *    the app looks frozen until the new RSC payload lands.
 *
 * 2. Prefetch. This route is dynamic — the layout above reads cookies() for
 *    the session and the access grants — and Next only prefetches a dynamic
 *    route down to its nearest loading boundary. With no boundary, every
 *    <Link> in the sidebar was prefetching nothing, so the whole round trip
 *    was paid on click.
 *
 * The shape mirrors the real page (PageHead, then the module body) so the
 * layout does not jump when the content arrives.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-3 w-72" />
      </div>
      <ModuleSkeleton />
    </>
  );
}
