ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS disconnected_since timestamptz;
ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz;
ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS last_reconnected_at timestamptz;
ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS downtime_seconds bigint NOT NULL DEFAULT 0;
ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS last_downtime_seconds bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.wa_line_disconnect_events (
  id bigserial PRIMARY KEY,
  line_id uuid NOT NULL,
  user_id integer,
  disconnected_at timestamptz NOT NULL,
  reconnected_at timestamptz,
  duration_seconds bigint,
  reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_line_disconnect_open ON public.wa_line_disconnect_events(line_id) WHERE reconnected_at IS NULL;

CREATE OR REPLACE FUNCTION public.wa_track_line_downtime() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'connected' AND NEW.status IS DISTINCT FROM 'connected' THEN
    NEW.disconnected_since := NOW();
    NEW.last_disconnected_at := NOW();
    INSERT INTO public.wa_line_disconnect_events(line_id,user_id,disconnected_at,reason)
    VALUES(NEW.id,NEW.created_by,NOW(),NEW.status) ON CONFLICT DO NOTHING;
  ELSIF NEW.status = 'connected' AND OLD.status IS DISTINCT FROM 'connected' THEN
    NEW.last_reconnected_at := NOW();
    IF OLD.disconnected_since IS NOT NULL THEN
      NEW.last_downtime_seconds := GREATEST(0,EXTRACT(EPOCH FROM NOW()-OLD.disconnected_since)::bigint);
      NEW.downtime_seconds := OLD.downtime_seconds + NEW.last_downtime_seconds;
      UPDATE public.wa_line_disconnect_events SET reconnected_at=NOW(),duration_seconds=NEW.last_downtime_seconds
      WHERE line_id=NEW.id AND reconnected_at IS NULL;
    END IF;
    NEW.disconnected_since := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wa_line_downtime ON public.lines;
CREATE TRIGGER wa_line_downtime BEFORE UPDATE OF status ON public.lines FOR EACH ROW EXECUTE FUNCTION public.wa_track_line_downtime();
