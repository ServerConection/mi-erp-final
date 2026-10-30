-- ============================================================================
-- Rol de Pagos (Administración) — ajustes manuales por asesor y mes
-- Ejecutar UNA vez en pgAdmin. Solo CREA una tabla nueva; no toca nada existente.
-- concepto: bono_tc | incentivos | chargeback | calidad_venta | adelantos |
--           retencion | atrasos | asegurado | comision_total | asegurado_pagado |
--           anticipo_40 | plan_celular   (monto NULL = volver al valor automático)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rol_pagos_ajustes (
  id              BIGSERIAL PRIMARY KEY,
  empresa         TEXT          NOT NULL,          -- NOVONET | VELSA
  mes             TEXT          NOT NULL,          -- 'AAAA-MM'
  usuario         TEXT          NOT NULL,          -- usuario del asesor en el ERP
  concepto        TEXT          NOT NULL,
  monto           NUMERIC(12,2),
  actualizado_por TEXT,
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, mes, usuario, concepto)
);
CREATE INDEX IF NOT EXISTS idx_rol_pagos_ajustes_mes ON public.rol_pagos_ajustes (empresa, mes);
