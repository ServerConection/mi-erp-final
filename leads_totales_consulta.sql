-- ============================================================
-- LEADS TOTALES - NOVONET y VELSA
-- Rango de fechas: del 1ro del mes actual hasta hoy
-- ============================================================

-- Cambia estas dos fechas si quieres otro rango
-- (por defecto: del día 1 del mes actual a la fecha actual)
-- Para usarlo en pgAdmin/DBeaver/psql tal cual: solo edita los dos literales
-- de fecha en cada bloque ('2026-06-01' y '2026-06-26').

-- ============================================================
-- 1) NOVONET (tabla mestra_bitrix)
-- ============================================================
SELECT
    COUNT(*) FILTER (
        WHERE COALESCE(b_creado_el_fecha::date, NULL) BETWEEN '2026-06-01'::date AND '2026-06-26'::date
        AND b_etapa_de_la_negociacion <> 'DUPLICADO'
        AND (
            b_etapa_de_la_negociacion = 'VENTA SUBIDA'
            OR COALESCE(b_origen, '') NOT IN (
                'WAZZUP: WhatsApp - Ecuanet Regestion',
                'BASE 593-962881280',
                'BASE 593-958993371',
                'BASE 593-999803743',
                'Base 593-995967355',
                'Whatsapp 593958993371'
            )
        )
    ) AS leads_totales_novonet
FROM mestra_bitrix;

-- ============================================================
-- 2) VELSA (tabla negociaciones_reporteria)
-- ============================================================
SELECT
    COUNT(*) FILTER (
        WHERE creado_en::date BETWEEN '2026-06-01'::date AND '2026-06-26'::date
    ) AS leads_totales_velsa
FROM negociaciones_reporteria;

-- ============================================================
-- 3) TOTAL COMBINADO (Novonet + Velsa)
-- ============================================================
SELECT
    (SELECT COUNT(*) FILTER (
        WHERE COALESCE(b_creado_el_fecha::date, NULL) BETWEEN '2026-06-01'::date AND '2026-06-26'::date
        AND b_etapa_de_la_negociacion <> 'DUPLICADO'
        AND (
            b_etapa_de_la_negociacion = 'VENTA SUBIDA'
            OR COALESCE(b_origen, '') NOT IN (
                'WAZZUP: WhatsApp - Ecuanet Regestion',
                'BASE 593-962881280',
                'BASE 593-958993371',
                'BASE 593-999803743',
                'Base 593-995967355',
                'Whatsapp 593958993371'
            )
        )
    ) FROM mestra_bitrix) AS leads_totales_novonet,
    (SELECT COUNT(*) FILTER (
        WHERE creado_en::date BETWEEN '2026-06-01'::date AND '2026-06-26'::date
    ) FROM negociaciones_reporteria) AS leads_totales_velsa,
    (SELECT COUNT(*) FILTER (
        WHERE COALESCE(b_creado_el_fecha::date, NULL) BETWEEN '2026-06-01'::date AND '2026-06-26'::date
        AND b_etapa_de_la_negociacion <> 'DUPLICADO'
        AND (
            b_etapa_de_la_negociacion = 'VENTA SUBIDA'
            OR COALESCE(b_origen, '') NOT IN (
                'WAZZUP: WhatsApp - Ecuanet Regestion',
                'BASE 593-962881280',
                'BASE 593-958993371',
                'BASE 593-999803743',
                'Base 593-995967355',
                'Whatsapp 593958993371'
            )
        )
    ) FROM mestra_bitrix)
    +
    (SELECT COUNT(*) FILTER (
        WHERE creado_en::date BETWEEN '2026-06-01'::date AND '2026-06-26'::date
    ) FROM negociaciones_reporteria) AS leads_totales_combinado;
