-- Execute once, with the approved deployment credentials. No existing tables modified.
BEGIN;
CREATE TABLE IF NOT EXISTS llamadas_cdr_cargas (
 id bigserial PRIMARY KEY,
 archivo text NOT NULL,
 archivo_hash char(64) NOT NULL,
 empresa text NOT NULL CHECK (empresa IN ('NETLIFE','ECUANET')),
 direccion text NOT NULL CHECK (direccion IN ('inbound','outbound')),
 usuario_id bigint NOT NULL,
 usuario text NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 insertadas integer NOT NULL CHECK (insertadas >= 0),
 repetidas integer NOT NULL CHECK (repetidas >= 0),
 rechazadas integer NOT NULL CHECK (rechazadas >= 0),
 errores jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS llamadas_cdr (
 huella char(64) PRIMARY KEY,
 empresa text NOT NULL CHECK (empresa IN ('NETLIFE','ECUANET')),
 direccion text NOT NULL CHECK (direccion IN ('inbound','outbound')),
 fecha timestamp without time zone NOT NULL,
 agente text NOT NULL,
 telefono text NOT NULL,
 duracion integer NOT NULL CHECK (duracion >= 0),
 facturados integer NOT NULL CHECK (facturados >= 0),
 espera integer CHECK (espera >= 0),
 estado text NOT NULL,
 costo numeric(20,8) NOT NULL CHECK (costo >= 0),
 carga_id bigint NOT NULL REFERENCES llamadas_cdr_cargas(id),
 CHECK ((direccion='outbound' AND espera IS NULL) OR (direccion='inbound' AND espera IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS llamadas_cdr_empresa_fecha ON llamadas_cdr(empresa, fecha DESC);
CREATE INDEX IF NOT EXISTS llamadas_cdr_fecha ON llamadas_cdr(fecha DESC);
CREATE INDEX IF NOT EXISTS llamadas_cdr_agente_fecha ON llamadas_cdr(agente, fecha DESC);
CREATE INDEX IF NOT EXISTS llamadas_cdr_cargas_creado ON llamadas_cdr_cargas(creado_en DESC);
COMMIT;
