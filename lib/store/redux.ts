import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "@/lib/api/api";

/*
 * The Redux store.
 *
 * Built by a factory rather than exported as a singleton: this app renders on
 * the server, and a module-level store would be shared between requests — one
 * visitor's cached employee list served to the next.
 */
export function makeStore() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

  // Refetch on reconnect and on tab focus, so a dashboard left open overnight
  // isn't showing yesterday's board.
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
