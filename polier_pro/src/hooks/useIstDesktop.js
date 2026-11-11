import { useEffect, useState } from "react";

// Ab 1024 px Breite bekommt Polaris im Browser das Desktop-Layout
// (Seitenleiste, Werkplan-Farben). Darunter bleibt die Handy-App wie sie ist.
// Das Attribut data-layout auf <html> schaltet die Desktop-Farben in theme.css.
const ABFRAGE = "(min-width: 1024px)";

export function useIstDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(ABFRAGE).matches);
  useEffect(() => {
    const mq = window.matchMedia(ABFRAGE);
    const neu = () => setDesktop(mq.matches);
    mq.addEventListener("change", neu);
    return () => mq.removeEventListener("change", neu);
  }, []);
  useEffect(() => {
    if (desktop) document.documentElement.dataset.layout = "desktop";
    else delete document.documentElement.dataset.layout;
  }, [desktop]);
  return desktop;
}
