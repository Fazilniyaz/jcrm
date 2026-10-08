"use client";

import { useMemo } from "react";

/*
 * Reference stability for polled lists.
 *
 * The shared lists re-read the server every 30 seconds (see ApiStoreProvider).
 * RTK Query hands back a NEW array on every one of those refetches whether or
 * not a single field changed, because it replaces the cache entry rather than
 * diffing it. Downstream that new reference was the whole problem:
 *
 *   new tasksQuery.data  ->  new tasks array  ->  new store value  ->  every
 *   component reading the store re-renders, and every useMemo inside those
 *   components keyed on `tasks` re-derives
 *
 * So a workspace sitting idle on the task grid rebuilt its entire derived
 * state twice a minute, for nothing. These helpers cut that at the source: map
 * the rows through a memo keyed by their CONTENT instead of their identity, so
 * an unchanged poll returns the exact array it returned last time and the
 * render stops there.
 *
 * The key is `id` + `updatedAt` per row, which the API sets on every write —
 * it is the server's own revision marker, so "same key" means "same row" with
 * no deep compare and no trust in reference identity.
 */

/** The shape every list row shares. `updatedAt` is absent on a few, hence optional. */
type Revisioned = { id: string; updatedAt?: string };

/** One frozen array, so "no data yet" is also a stable reference. */
const EMPTY: readonly never[] = Object.freeze([]);

/**
 * What marks one row as changed. `updatedAt` for everything the API timestamps.
 *
 * Overridable because not every list has one. Notification is the case that
 * matters: it carries no `updatedAt`, but `read` flips when someone opens the
 * panel. Left on the default stamp that flip would be invisible — same ids,
 * same length, same key — and the bell would never clear. Any list without an
 * `updatedAt` MUST pass a stamp covering the fields that mutate in place.
 */
type Stamp<I> = (row: I) => string;

function defaultStamp(row: Revisioned): string {
  return row.updatedAt ?? "";
}

/**
 * A cheap content fingerprint for a list.
 *
 * Length is included first so a pure addition or removal is caught before any
 * row is read. Beyond that it is one string concat per row — linear, no
 * allocation per field, and nothing like the cost of the mapping it guards.
 */
export function revisionOf<I extends Revisioned>(
  rows: readonly I[] | undefined,
  stamp: Stamp<I> = defaultStamp,
): string {
  if (!rows || rows.length === 0) return "0";
  let key = `${rows.length}`;
  for (const row of rows) key += `\u0001${row.id}\u0002${stamp(row)}`;
  return key;
}

/**
 * Map a polled list to UI rows, recomputing only when the list's content changes.
 *
 * `extraKey` is for mappings that depend on something beyond the rows — the
 * task mapping resolves `createdBy` through the employee roster, so it passes
 * the roster's own revision. Leaving it out would pin the first roster it saw
 * and show a stale name after a rename.
 */
export function useMappedList<I extends Revisioned, O>(
  rows: readonly I[] | undefined,
  map: (rows: readonly I[]) => O[],
  extraKey = "",
  stamp?: Stamp<I>,
): O[] {
  const revision = revisionOf(rows, stamp);
  // `revision` + `extraKey` ARE the dependency list: they describe the content
  // of `rows` and of everything `map` closes over. Listing `rows` or `map`
  // instead would defeat the whole point — both change identity on every poll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (rows ? map(rows) : (EMPTY as unknown as O[])), [revision, extraKey]);
}
