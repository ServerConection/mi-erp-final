-- Avisa al worker (erp-workers) cada vez que cambia envios_ventas,
-- para refrescar al instante las MVs *_ev de indicadores.
-- Aditivo: no modifica datos ni otros triggers.
CREATE OR REPLACE FUNCTION public.notify_envios_ventas_cambio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('envios_ventas_cambio', TG_OP);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_envios_ventas_cambio ON public.envios_ventas;
CREATE TRIGGER trg_notify_envios_ventas_cambio
AFTER INSERT OR UPDATE OR DELETE ON public.envios_ventas
FOR EACH STATEMENT EXECUTE FUNCTION public.notify_envios_ventas_cambio();
