"use client";

import { useRef } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "./redux";

/**
 * Creates the store once per browser session.
 *
 * A ref rather than useState or a module constant: useState would still call
 * makeStore on every render before discarding the result, and a module constant
 * would be shared across server requests.
 */
export default function ReduxProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  storeRef.current ??= makeStore();

  return <Provider store={storeRef.current}>{children}</Provider>;
}
