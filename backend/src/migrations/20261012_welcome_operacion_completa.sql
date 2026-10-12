-- Evolucion aditiva del modulo Welcome. No elimina ni reescribe historicos.
CREATE TABLE IF NOT EXISTS public.welcome_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  line_name text NOT NULL DEFAULT 'NOTI_BACK',
  paused boolean NOT NULL DEFAULT false,
  send_start time NOT NULL DEFAULT '08:30',
  send_end time NOT NULL DEFAULT '20:00',
  updated_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.welcome_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.welcome_variants (
  id bigserial PRIMARY KEY,
  code varchar(20) NOT NULL UNIQUE,
  name text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.welcome_variants (code,name,body,sort_order) VALUES
('WELCOME_A','Opcion A','Hola, *{{nombre}}* 👋\n\nReciba un cordial saludo de NETLIFE. Le damos la bienvenida y compartimos información importante de su servicio.\n\n📦 *Plan:* {{plan}}\n💳 *Forma de pago:* {{forma_pago}}\n🗓️ *Ciclo de facturación:* {{ciclo_facturacion}}\n\nEl servicio es previo pago. La primera factura será proporcional desde la activación hasta fin de mes; la segunda corresponderá al ciclo completo.\n\n📱 Netlife Access: https://netlifeaccess.netlife.net.ec/\n🤖 ARA WhatsApp: 0962992996\n📞 3920000 · 0985970000\n🌐 https://www.netlife.ec/\n📧 atencionalcliente@netlife.net.ec\n\nResponda *1* si todo está claro o *2* si tiene alguna duda.\n\n¡Gracias y bienvenido a NETLIFE! 😊',1),
('WELCOME_B','Opcion B','¡Bienvenido a NETLIFE, *{{nombre}}*! 👋\n\nSu servicio contratado es *{{plan}}*, con forma de pago *{{forma_pago}}* y ciclo *{{ciclo_facturacion}}*.\n\nEl servicio funciona bajo modalidad de previo pago. La primera factura es proporcional y la segunda corresponde a un ciclo completo.\n\n📱 Gestione su plan en https://netlifeaccess.netlife.net.ec/\n🤖 ARA: 0962992996 · 📞 3920000 / 0985970000\n\nResponda *1* si comprendió la información o *2* si desea ayuda de un asesor. 🙌',2),
('WELCOME_C','Opcion C','👋 ¡Bienvenido a NETLIFE, *{{nombre}}*!\n\n📌 Plan: {{plan}}\n📌 Forma de pago: {{forma_pago}}\n📌 Ciclo: {{ciclo_facturacion}}\n\nEl servicio es previo pago. Su primera factura será proporcional hasta fin de mes y luego se facturará el ciclo completo.\n\nNetlife Access: https://netlifeaccess.netlife.net.ec/\nAtención: 0962992996 · 3920000 · 0985970000\n\nEscriba *1* si todo está claro o *2* si tiene dudas. 😊',3),
('WELCOME_D','Opcion D','¡Muy buenas, *{{nombre}}*! 👋\n\nNos complace darle la bienvenida a NETLIFE.\n🔹 Plan: {{plan}}\n🔹 Forma de pago: {{forma_pago}}\n🔹 Ciclo de facturación: {{ciclo_facturacion}}\n\nSu servicio es previo pago y la primera factura será proporcional. Puede consultar su información en https://netlifeaccess.netlife.net.ec/\n\nCanales: ARA 0962992996 · 3920000 · 0985970000\n\nResponda *1* para confirmar o *2* si necesita atención. 🙌',4),
('WELCOME_E','Opcion E','👋 Estimado/a *{{nombre}}*: ¡bienvenido a NETLIFE!\n\nContrató el plan *{{plan}}*, mediante *{{forma_pago}}*, con ciclo *{{ciclo_facturacion}}*.\n\nRecuerde que el servicio es previo pago. La primera factura se calcula proporcionalmente desde la activación y la segunda corresponde al ciclo completo.\n\n📱 https://netlifeaccess.netlife.net.ec/\n🤖 0962992996 · 📞 3920000 / 0985970000\n\nResponda *1* si recibió y comprendió la información o *2* si tiene alguna duda. 😊',5)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.welcome_notifications
  ADD COLUMN IF NOT EXISTS variant_id bigint REFERENCES public.welcome_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_status varchar(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS response_status varchar(20),
  ADD COLUMN IF NOT EXISTS response_text text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversation_id bigint,
  ADD COLUMN IF NOT EXISTS attended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attended_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_welcome_response_pending
  ON public.welcome_notifications(response_status, attended, responded_at DESC);
