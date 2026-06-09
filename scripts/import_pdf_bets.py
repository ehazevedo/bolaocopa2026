#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


DEFAULT_PDF = "/Users/ehazevedo/Downloads/Bolao Copa do Mundo Fifa 2026.pdf"

MANUAL_CORRECTIONS = {
    ("CAROL", 66): (1, 1),
}

NAME_CORRECTIONS = {
    "TAIS": "THAIS",
}


def load_existing_matches(path: Path):
    text = path.read_text(encoding="utf-8")
    prefix = "window.BOLAO_DATA = "
    if not text.startswith(prefix):
        raise ValueError(f"{path} não parece ser um arquivo bolao-data.js válido.")
    return json.loads(text[len(prefix) :].strip().rstrip(";"))


def extract_items(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        items = []

        def visitor(text, cm, tm, font_dict, font_size):
            clean = text.strip()
            if not clean:
                return
            items.append(
                {
                    "x": float(tm[4]),
                    "y": float(tm[5]),
                    "text": clean,
                    "fontSize": float(font_size),
                }
            )

        page.extract_text(visitor_text=visitor)
        pages.append(items)
    return pages


def as_int(text):
    try:
        return int(str(text).strip())
    except Exception:
        return None


def nearest(items, x_min, x_max, y, y_tol=2.1):
    candidates = [
        item for item in items if x_min <= item["x"] <= x_max and abs(item["y"] - y) <= y_tol
    ]
    candidates = [item for item in candidates if as_int(item["text"]) is not None]
    if len(candidates) != 1:
        return None
    return as_int(candidates[0]["text"])


def page_columns(items):
    colon_xs = sorted(
        {
            round(item["x"])
            for item in items
            if item["text"] == ":" and item["x"] > 330 and abs(item["y"] - 1050) <= 2
        }
    )
    headers = []
    for center in colon_xs:
        labels = [
            item["text"]
            for item in sorted(items, key=lambda value: value["x"])
            if 1062 <= item["y"] <= 1068 and center - 38 <= item["x"] <= center + 20
        ]
        name = " ".join(labels).strip()
        headers.append({"center": center, "name": name})
    return headers


def page_rows(items):
    rows = []
    for item in items:
        value = as_int(item["text"])
        if value is None:
            continue
        if 45 <= item["x"] <= 75 and 0 < value <= 72 and -20 < item["y"] < 1060:
            rows.append({"matchId": value, "y": item["y"]})
    rows.sort(key=lambda row: row["matchId"])
    return rows


def extract_pdf_bets(pdf_path: Path):
    pages = extract_items(pdf_path)
    participants = []
    warnings = []

    for page_index, items in enumerate(pages, start=1):
        columns = page_columns(items)
        rows = page_rows(items)
        if len(rows) != 72:
            warnings.append(f"Página {page_index}: encontrei {len(rows)} linhas de jogos, esperado 72.")
        if not columns:
            warnings.append(f"Página {page_index}: nenhuma coluna de participante encontrada.")

        for col_index, column in enumerate(columns, start=1):
            name = column["name"] or f"Participante {len(participants) + 1}"
            name = NAME_CORRECTIONS.get(name, name)
            center = column["center"]
            bets = []
            missing = []

            for row in rows:
                y = row["y"] + 1
                g1 = nearest(items, center - 31, center - 9, y)
                g2 = nearest(items, center + 9, center + 31, y)
                correction = MANUAL_CORRECTIONS.get((name, row["matchId"]))
                if correction:
                    g1, g2 = correction
                if g1 is None or g2 is None:
                    missing.append(row["matchId"])
                    continue
                bets.append({"matchId": row["matchId"], "g1": g1, "g2": g2})

            participants.append(
                {
                    "id": slugify(name),
                    "name": name,
                    "file": f"{pdf_path.name} página {page_index} coluna {col_index}",
                    "bets": bets,
                }
            )
            if missing:
                warnings.append(
                    f"{name}: {len(missing)} palpite(s) não extraído(s): {', '.join(map(str, missing))}."
                )

    return participants, warnings


def slugify(value: str) -> str:
    normalized = value.lower().strip()
    for src, dst in {
        "á": "a",
        "à": "a",
        "ã": "a",
        "â": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "õ": "o",
        "ô": "o",
        "ú": "u",
        "ç": "c",
    }.items():
        normalized = normalized.replace(src, dst)
    return "".join(char if char.isalnum() else "-" for char in normalized).strip("-")


def dedupe_participant_ids(participants):
    seen = defaultdict(int)
    for participant in participants:
        base = participant["id"] or "participante"
        seen[base] += 1
        participant["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"


def validate(participants):
    problems = []
    if len(participants) != 22:
        problems.append(f"Participantes: {len(participants)} extraído(s), esperado 22.")

    for participant in participants:
        if len(participant["bets"]) != 72:
            problems.append(f"{participant['name']}: {len(participant['bets'])} palpite(s), esperado 72.")
        match_ids = [bet["matchId"] for bet in participant["bets"]]
        missing = sorted(set(range(1, 73)) - set(match_ids))
        duplicates = sorted({match_id for match_id in match_ids if match_ids.count(match_id) > 1})
        if missing:
            problems.append(f"{participant['name']}: jogos faltando {missing}.")
        if duplicates:
            problems.append(f"{participant['name']}: jogos duplicados {duplicates}.")
        for bet in participant["bets"]:
            if not (0 <= bet["g1"] <= 9 and 0 <= bet["g2"] <= 9):
                problems.append(f"{participant['name']} jogo {bet['matchId']}: placar suspeito {bet['g1']}x{bet['g2']}.")

    return problems


def write_audit(path: Path, participants):
    lines = ["participante,matchId,g1,g2"]
    for participant in participants:
        for bet in participant["bets"]:
            lines.append(f"{participant['name']},{bet['matchId']},{bet['g1']},{bet['g2']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Importa palpites consolidados de um PDF do bolão.")
    parser.add_argument("--pdf", default=DEFAULT_PDF)
    parser.add_argument("--base", default="data/bolao-data.js")
    parser.add_argument("--output", default="data/bolao-data.js")
    parser.add_argument("--audit", default="data/pdf-bets-audit.csv")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    base_path = Path(args.base)
    output_path = Path(args.output)
    audit_path = Path(args.audit)

    data = load_existing_matches(base_path)
    participants, warnings = extract_pdf_bets(pdf_path)
    dedupe_participant_ids(participants)
    problems = validate(participants)

    if problems:
        for problem in problems:
            print(f"ERRO: {problem}")
        raise SystemExit(1)

    data["participants"] = participants
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    data["sourceFolder"] = str(pdf_path)
    data["warnings"] = warnings
    data["prizes"] = {
        "participants": 22,
        "entryFee": 150,
        "total": 3300,
        "first": 1980,
        "second": 990,
        "third": 330,
    }

    output_path.write_text(
        "window.BOLAO_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    write_audit(audit_path, participants)

    print(f"Participantes: {len(participants)}")
    print(f"Palpites: {sum(len(p['bets']) for p in participants)}")
    print("Nomes:")
    for participant in participants:
        print(f"- {participant['name']}")
    if warnings:
        print("Avisos:")
        for warning in warnings:
            print(f"- {warning}")
    print(f"Base salva em {output_path}")
    print(f"Auditoria salva em {audit_path}")


if __name__ == "__main__":
    main()
