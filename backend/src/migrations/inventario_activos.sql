-- MODULO INVENTARIO DE ACTIVOS TI
-- Ejecutar manualmente en la base de datos del ERP (pgAdmin / psql).

CREATE SEQUENCE IF NOT EXISTS public.inventario_activos_id_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.inventario_activos (
  id                    VARCHAR(30) PRIMARY KEY
                          DEFAULT ('EQ-' || LPAD(NEXTVAL('public.inventario_activos_id_seq')::TEXT, 4, '0')),
  empresa               VARCHAR(20) NOT NULL
                          CHECK (empresa IN ('NOVONET', 'VELSA')),
  tipo_dispositivo      VARCHAR(30) NOT NULL
                          CHECK (tipo_dispositivo IN ('CPU', 'MONITOR', 'LAPTOP', 'TELEVISION', 'IMPRESORA')),
  marca                 VARCHAR(150) NOT NULL,
  modelo                VARCHAR(150),
  numero_serie          VARCHAR(255) NOT NULL,
  procesador            VARCHAR(255),
  ram                   VARCHAR(100),
  disco_tipo            VARCHAR(20)
                          CHECK (disco_tipo IS NULL OR disco_tipo IN ('MECANICO', 'SOLIDO', 'OTRO')),
  disco_espacio         VARCHAR(100),
  fecha_fabricacion     DATE,
  pulgadas              VARCHAR(50),
  impresion             VARCHAR(30)
                          CHECK (impresion IS NULL OR impresion IN ('COLOR', 'BLANCO Y NEGRO')),
  ubicacion             VARCHAR(255) NOT NULL,
  area                  VARCHAR(255) NOT NULL,
  responsable           VARCHAR(150) NOT NULL,
  estado                VARCHAR(30) NOT NULL
                          CHECK (estado IN ('ACTIVO', 'EN REPARACION', 'DISPONIBLE', 'DE BAJA')),
  fecha_adquisicion     DATE,
  fecha_revision        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mouse                 VARCHAR(20)
                          CHECK (mouse IS NULL OR mouse IN ('SI', 'NO', 'CAMBIAR')),
  teclado               VARCHAR(20)
                          CHECK (teclado IS NULL OR teclado IN ('SI', 'NO', 'CAMBIAR')),
  regulador             VARCHAR(10)
                          CHECK (regulador IS NULL OR regulador IN ('SI', 'NO')),
  observacion_vida_util TEXT,
  cambio_reemplazo      VARCHAR(20)
                          CHECK (cambio_reemplazo IS NULL OR cambio_reemplazo IN ('MANTENER', 'POTENCIAR', 'REEMPLAZAR')),
  foto                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por            VARCHAR(150) NOT NULL,
  actualizado_por       VARCHAR(150) NOT NULL,
  CONSTRAINT inventario_activos_numero_serie_uq UNIQUE (numero_serie)
);

CREATE INDEX IF NOT EXISTS inventario_activos_empresa_idx
  ON public.inventario_activos (empresa);

CREATE INDEX IF NOT EXISTS inventario_activos_tipo_dispositivo_idx
  ON public.inventario_activos (tipo_dispositivo);

