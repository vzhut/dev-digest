/* URL search-param state shared by the routes that keep tabs / filters / an open
   drawer in the query string (?tab=, ?status=, ?trace=). */
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The query string after setting `key` to `value` (null removes it); other params are kept. */
export function withSearchParam(current: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(current);
  if (value == null) sp.delete(key);
  else sp.set(key, value);
  return sp.toString();
}

/** Setter for one search param on the current route, via router.replace (no history entry). */
export function useSetSearchParam(): (key: string, value: string | null) => void {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  return (key, value) => {
    const qs = withSearchParam(search.toString(), key, value);
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
}
