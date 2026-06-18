-- ============================================================
-- whatsapp_ownership.sql
-- Agrega aislamiento de datos por usuario al módulo WhatsApp.
-- Cada asesor/usuario solo verá lo que él mismo creó;
-- los usuarios con perfil ADMINISTRADOR siguen viendo todo.
-- Seguro de ejecutar varias veces (usa IF NOT EXISTS).
-- ============================================================

-- Tablas "raíz" del módulo: cada una guarda quién la creó.
ALTER TABLE lines           ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);
ALTER TABLE bots            ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);
ALTER TABLE contact_lists   ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);
ALTER TABLE templates       ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);
ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);

-- Contactos sueltos (sin lista) también quedan asociados a quien los creó/importó.
ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_lines_created_by            ON lines(created_by);
CREATE INDEX IF NOT EXISTS idx_bots_created_by             ON bots(created_by);
CREATE INDEX IF NOT EXISTS idx_contact_lists_created_by    ON contact_lists(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_created_by        ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by         ON campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_created_by ON scheduled_messages(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by          ON contacts(created_by);

-- NOTA: filas creadas ANTES de esta migración quedarán con created_by = NULL.
-- Solo los ADMINISTRADOR las verán hasta que se les asigne un dueño manualmente, ej:
--   UPDATE lines SET created_by = <id_usuario> WHERE created_by IS NULL;
