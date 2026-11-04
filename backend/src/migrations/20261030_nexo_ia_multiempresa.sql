-- Nexo IA: habilitar configuración propia para todos los pipelines de WABOT.
ALTER TABLE nexo_ia_config DROP CONSTRAINT IF EXISTS nexo_ia_config_empresa_check;
ALTER TABLE nexo_ia_config ADD CONSTRAINT nexo_ia_config_empresa_check
  CHECK (empresa IN ('NOVONET', 'VELSA', 'SEMILLERO', 'VENTAENLINEA'));

