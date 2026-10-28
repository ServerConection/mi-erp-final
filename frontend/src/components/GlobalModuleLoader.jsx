import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import LogoLoader from "./LogoLoader";

const MIN_VISIBLE_MS = 500;
const SETTLE_MS = 350;
const MAX_WAIT_MS = 45_000;

export default function GlobalModuleLoader() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/embed/")) {
      setVisible(false);
      return undefined;
    }

    startedAt.current = Date.now();
    setVisible(true);
    let settleTimer;

    const tryToFinish = () => {
      window.clearTimeout(settleTimer);
      const pending = Number(window.__erpPeticionesPendientes || 0);
      if (pending > 0) return;

      const elapsed = Date.now() - startedAt.current;
      const delay = Math.max(SETTLE_MS, MIN_VISIBLE_MS - elapsed);
      settleTimer = window.setTimeout(() => {
        if (Number(window.__erpPeticionesPendientes || 0) === 0) setVisible(false);
      }, delay);
    };

    const onRequestChange = () => tryToFinish();
    window.addEventListener("erp-peticiones-cambio", onRequestChange);

    // Da tiempo a que los efectos del módulo inicien sus consultas.
    const initialCheck = window.setTimeout(tryToFinish, 120);
    const safetyTimeout = window.setTimeout(() => setVisible(false), MAX_WAIT_MS);

    return () => {
      window.removeEventListener("erp-peticiones-cambio", onRequestChange);
      window.clearTimeout(initialCheck);
      window.clearTimeout(settleTimer);
      window.clearTimeout(safetyTimeout);
    };
  }, [pathname]);

  return <LogoLoader show={visible} fullScreen text="Cargando módulo…" />;
}
