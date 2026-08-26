"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { browserClient } from "@/lib/supabase/client";
import { defaultProfile, GymStore, type StoreSnapshot } from "./store";
import { PREVIEW_HARNESS } from "@/lib/preview";

const StoreContext = createContext<GymStore | null>(null);

export function GymStoreProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  // Built during render so the first paint already has a store, and rebuilt
  // during render (not in an effect) if the identity changes — the store is
  // derived from the userId prop, and deriving it in an effect would render
  // one frame with the previous user's cache.
  const [store, setStore] = useState(
    () => new GymStore(userId, browserClient()),
  );
  const [seenUserId, setSeenUserId] = useState(userId);
  if (seenUserId !== userId) {
    setSeenUserId(userId);
    setStore(new GymStore(userId, browserClient()));
  }

  useEffect(() => {
    void store.start();
    return () => store.dispose();
  }, [store]);

  // Preview harness only: hand the store to the driver script so it can seed a
  // fixture through `patchProfile` / `addWeight` / `addEvent` — the same writes
  // the UI makes. Seeding IndexedDB from outside would test a schema I had
  // written twice; seeding through the store tests the one the app uses.
  useEffect(() => {
    if (!PREVIEW_HARNESS) return;
    (window as unknown as { __gym?: GymStore }).__gym = store;
    return () => {
      delete (window as unknown as { __gym?: GymStore }).__gym;
    };
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): GymStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useStore must be used inside <GymStoreProvider>");
  }
  return store;
}

/** Subscribe to the whole cache. */
export function useGym(): StoreSnapshot {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

/**
 * The profile, with the defaults the schema would apply, so screens never have
 * to branch on "the first pull has not landed yet".
 */
export function useProfile() {
  const { profile, userId } = useGym();
  return useMemo(
    () => profile ?? defaultProfile(userId),
    [profile, userId],
  );
}
