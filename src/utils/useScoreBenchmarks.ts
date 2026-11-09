import { useEffect, useState } from "react";
import { getScoreBenchmarkVersion, loadScoreBenchmarks, subscribeScoreBenchmarks } from "./scoreBenchmarks";

/** Carga la referencia del score de salud y devuelve su versión (para recalcular al llegar). */
export function useScoreBenchmarks(): number {
  const [v, setV] = useState(getScoreBenchmarkVersion());
  useEffect(() => {
    const off = subscribeScoreBenchmarks(() => setV(getScoreBenchmarkVersion()));
    loadScoreBenchmarks();
    return off;
  }, []);
  return v;
}
