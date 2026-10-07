-- Conserva la auditoría autenticada que envía PUT /api/backoffice/:id.
--
-- El trigger histórico reemplazaba NEW.hist_cambio_estatus usando siempre
-- OLD.hist_cambio_estatus. Por eso descartaba el evento v2 (usuario_id,
-- nombre_usuario, perfil, empresa) preparado por el backend y la interfaz
-- terminaba mostrando "usuario no registrado".
--
-- Si quien actualiza el estado ya modificó hist_cambio_estatus, se respeta
-- ese historial. Si un proceso externo cambia únicamente el estado, el
-- trigger conserva su función de respaldo y agrega un evento de sistema.

CREATE OR REPLACE FUNCTION public.fn_registrar_historial_estatus()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.netlife_estatus_real IS DISTINCT FROM NEW.netlife_estatus_real THEN
        IF NEW.hist_cambio_estatus IS NOT DISTINCT FROM OLD.hist_cambio_estatus THEN
            NEW.hist_cambio_estatus = COALESCE(OLD.hist_cambio_estatus, '[]'::jsonb)
              || jsonb_build_object(
                   'version', 2,
                   'origen', 'trigger_bd',
                   'usuario_id', NULL,
                   'usuario', NULL,
                   'nombre_usuario', NULL,
                   'fecha_hora', NOW(),
                   'cambios', jsonb_build_array(jsonb_build_object(
                       'campo', 'netlife_estatus_real',
                       'anterior', OLD.netlife_estatus_real,
                       'nuevo', NEW.netlife_estatus_real,
                       'reafirmacion', FALSE
                   ))
                 );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

