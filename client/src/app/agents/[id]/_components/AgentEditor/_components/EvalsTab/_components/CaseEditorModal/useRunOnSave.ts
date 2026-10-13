import React from "react";

const KEY = "devdigest.eval.runOnSave";

/** Read / write the "Run on save" toggle. Storage can throw (private mode, blocked): then it is just OFF. */
export function readRunOnSave(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeRunOnSave(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* not remembered, still works for this session */
  }
}

/** Run on save defaults to OFF (a run is a paid call) and is remembered per browser. */
export function useRunOnSave(): [boolean, (on: boolean) => void] {
  const [on, setOn] = React.useState(false);
  // read after mount: localStorage does not exist during SSR and a mismatch would break hydration
  React.useEffect(() => setOn(readRunOnSave()), []);
  const set = React.useCallback((v: boolean) => {
    setOn(v);
    writeRunOnSave(v);
  }, []);
  return [on, set];
}
