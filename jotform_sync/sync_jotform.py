"""
Sincroniza submissions de Jotform (NOVONET y VELSA) hacia Postgres,
resolviendo campos de seleccion (radio/dropdown/checkbox) a su TEXTO
visible en vez del ID/valor crudo.

Uso:
    python sync_jotform.py --diagnose novonet   -> inspecciona preguntas y
                                                    una respuesta cruda, para
                                                    detectar el/los campos que
                                                    llegan como ID en vez de texto
    python sync_jotform.py --diagnose velsa
    python sync_jotform.py                       -> corre la sincronizacion real
                                                    de ambos formularios
"""

import os
import sys
import json
import time
import argparse
import requests
import psycopg2
from psycopg2.extras import Json, execute_values
from dotenv import load_dotenv

load_dotenv()

JOTFORM_API_BASE = "https://api.jotform.com"
JOTFORM_API_KEY = os.environ.get("JOTFORM_API_KEY")

PG_CONFIG = dict(
    host=os.environ.get("PG_HOST"),
    port=os.environ.get("PG_PORT", "5432"),
    dbname=os.environ.get("PG_DB"),
    user=os.environ.get("PG_USER"),
    password=os.environ.get("PG_PASSWORD"),
)

# Tipos de campo cuya respuesta hay que resolver contra la lista de opciones
SELECTION_TYPES = {
    "control_radio",
    "control_dropdown",
    "control_checkbox",
}

FORMS = {
    "novonet": {"id": "213356674788673", "table": "jotform_submissions"},
    "velsa": {"id": "251603619851660", "table": "jotform_submissions_velsa"},
}


def jotform_get(path, params=None):
    params = params or {}
    params["apiKey"] = JOTFORM_API_KEY
    url = f"{JOTFORM_API_BASE}{path}"
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()["content"]


def get_question_map(form_id):
    """
    Devuelve { qid: {"text": ..., "type": ..., "options": [lista_de_textos]} }
    """
    questions = jotform_get(f"/form/{form_id}/questions")
    qmap = {}
    for qid, q in questions.items():
        options_raw = q.get("options", "")
        options = [o.strip() for o in options_raw.split("|")] if options_raw else []
        qmap[qid] = {
            "text": q.get("text", ""),
            "type": q.get("type", ""),
            "options": options,
            "name": q.get("name", ""),
        }
    return qmap


def fetch_all_submissions(form_id, page_size=100):
    """Trae TODAS las submissions del formulario, paginando."""
    all_subs = []
    offset = 0
    while True:
        batch = jotform_get(
            f"/form/{form_id}/submissions",
            params={"limit": page_size, "offset": offset, "orderby": "created_at"},
        )
        if not batch:
            break
        all_subs.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        time.sleep(0.2)  # no saturar la API
    return all_subs


def resolve_answer(qmeta, raw_answer):
    """
    Si el campo es de seleccion y la respuesta cruda no calza con ninguna
    opcion visible (ej: llega un ID en vez de 'ACTIVO'), se intenta resolver
    por posicion. Si no se puede resolver, se devuelve el valor crudo tal cual
    y se marca para revision manual.
    """
    if qmeta["type"] not in SELECTION_TYPES:
        return raw_answer, False

    options = qmeta["options"]
    if raw_answer in options:
        return raw_answer, False

    # Intento de resolucion por indice (cuando el "answer" es realmente
    # un indice de posicion en vez del texto)
    if isinstance(raw_answer, str) and raw_answer.isdigit():
        idx = int(raw_answer)
        if 0 <= idx < len(options):
            return options[idx], False

    # No se pudo resolver -> se deja el valor crudo y se marca "needs_review"
    return raw_answer, True


def build_clean_data(qmap, answers):
    """
    answers: dict qid -> {"name":, "text":, "type":, "answer": ...} (formato Jotform)
    Devuelve un dict {question_text: valor_resuelto} + lista de campos sin resolver
    """
    clean = {}
    unresolved = []
    for qid, ans in answers.items():
        qmeta = qmap.get(qid, {"type": ans.get("type", ""), "options": [], "text": ans.get("text", "")})
        raw = ans.get("answer")
        resolved, needs_review = resolve_answer(qmeta, raw)
        key = qmeta["text"] or ans.get("text") or qid
        clean[key] = resolved
        if needs_review:
            unresolved.append({"qid": qid, "campo": key, "valor_crudo": raw})
    return clean, unresolved


def upsert_submissions(conn, table, form_id, submissions, qmap):
    rows = []
    for sub in submissions:
        answers = sub.get("answers", {})
        clean_data, unresolved = build_clean_data(qmap, answers)
        if unresolved:
            print(f"[REVISAR] submission {sub['id']} tiene campos sin resolver: {unresolved}")
        rows.append(
            (
                sub["id"],
                form_id,
                Json(clean_data),
                sub.get("created_at"),
                sub.get("created_at"),
                sub.get("updated_at"),
            )
        )

    with conn.cursor() as cur:
        execute_values(
            cur,
            f"""
            INSERT INTO public.{table}
                (submission_id, form_id, data, submitted_at, created_at, updated_at)
            VALUES %s
            ON CONFLICT (submission_id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = EXCLUDED.updated_at
            """,
            rows,
        )
    conn.commit()


def diagnose(form_key):
    form = FORMS[form_key]
    qmap = get_question_map(form["id"])
    print(f"\n=== Preguntas de {form_key} (form {form['id']}) ===")
    for qid, q in qmap.items():
        print(f"qid={qid:>4}  tipo={q['type']:<20}  texto={q['text']!r}  opciones={q['options']}")

    subs = fetch_all_submissions(form["id"], page_size=1)
    if not subs:
        print("No hay submissions para inspeccionar.")
        return
    sample = subs[0]
    print(f"\n=== Respuesta cruda de la submission {sample['id']} ===")
    print(json.dumps(sample.get("answers", {}), indent=2, ensure_ascii=False))

    clean, unresolved = build_clean_data(qmap, sample.get("answers", {}))
    print(f"\n=== Datos resueltos a texto ===")
    print(json.dumps(clean, indent=2, ensure_ascii=False))
    if unresolved:
        print(f"\n[ATENCION] Campos que NO se pudieron resolver automaticamente: {unresolved}")
        print("Estos probablemente son dropdowns conectados a otra tabla/fuente de datos en Jotform.")


def sync_all():
    conn = psycopg2.connect(**PG_CONFIG)
    try:
        for key, form in FORMS.items():
            print(f"Sincronizando {key} (form {form['id']})...")
            qmap = get_question_map(form["id"])
            subs = fetch_all_submissions(form["id"])
            upsert_submissions(conn, form["table"], form["id"], subs, qmap)
            print(f"{key}: {len(subs)} submissions procesadas.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--diagnose", choices=list(FORMS.keys()), help="Inspecciona un formulario sin escribir en la BD")
    args = parser.parse_args()

    if not JOTFORM_API_KEY:
        sys.exit("Falta JOTFORM_API_KEY en el archivo .env")

    if args.diagnose:
        diagnose(args.diagnose)
    else:
        if not all(PG_CONFIG.values()):
            sys.exit("Faltan variables de conexion a Postgres en el archivo .env")
        sync_all()
