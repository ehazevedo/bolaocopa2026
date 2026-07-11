#!/usr/bin/env python3
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber


SLOT_SEQUENCE = [
    ("OIT-2", "Oitavas de Final", 90, "Paraguai", "França"),
    ("OIT-1", "Oitavas de Final", 89, "Canadá", "Marrocos"),
    ("OIT-3", "Oitavas de Final", 91, "Brasil", "Noruega"),
    ("OIT-4", "Oitavas de Final", 92, "México", "Inglaterra"),
    ("OIT-5", "Oitavas de Final", 93, "Portugal", "Espanha"),
    ("OIT-6", "Oitavas de Final", 94, "EUA", "Bélgica"),
    ("OIT-7", "Oitavas de Final", 95, "Argentina", "Egito"),
    ("OIT-8", "Oitavas de Final", 96, "Suíça", "Colômbia"),
    ("QF-1", "Quartas de Final", 97, "Vencedor OIT-2", "Vencedor OIT-1"),
    ("QF-2", "Quartas de Final", 98, "Vencedor OIT-5", "Vencedor OIT-6"),
    ("QF-3", "Quartas de Final", 99, "Vencedor OIT-3", "Vencedor OIT-4"),
    ("QF-4", "Quartas de Final", 100, "Vencedor OIT-7", "Vencedor OIT-8"),
    ("SF-1", "Semifinal", 101, "Vencedor QF-1", "Vencedor QF-2"),
    ("SF-2", "Semifinal", 102, "Vencedor QF-3", "Vencedor QF-4"),
    ("TERCEIRO", "Terceiro Lugar", 103, "Perdedor SF-1", "Perdedor SF-2"),
    ("FINAL", "Final", 104, "Vencedor SF-1", "Vencedor SF-2"),
]

PARTICIPANTS_BY_PAGE = [
    ["VAN", "EDU", "THAIS", "LU e IAN"],
    ["JOAO", "LISA", "HELENA", "CARLAI"],
    ["HAROLDO", "LEONARDO", "PAULO", "IVETE"],
    ["ZICA", "GUILHERME", "ANNETTE", "AGUSTÍN"],
    ["RENATINHA", "LUIAME", "BRUNO", "JULIANA"],
    ["CAROL", "LAHUD"],
]

MATCH_RE = re.compile(
    r"([A-ZÁÉÍÓÚÂÊÔÃÕÇÜÑ ]+?)\s+(\d+)\s*:\s*(\d+)\s+"
    r"([A-ZÁÉÍÓÚÂÊÔÃÕÇÜÑ ]+?)(?=\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇÜÑ ]+\s+\d+\s*:|$)"
)


def normalize(value):
    replacements = str.maketrans({
        "Á": "A", "À": "A", "Ã": "A", "Â": "A",
        "É": "E", "Ê": "E",
        "Í": "I",
        "Ó": "O", "Õ": "O", "Ô": "O",
        "Ú": "U", "Ü": "U",
        "Ç": "C",
    })
    return " ".join(str(value).upper().translate(replacements).split())


def parse_data_file(path):
    text = Path(path).read_text(encoding="utf-8")
    prefix = "window.BOLAO_DATA = "
    if not text.startswith(prefix) or not text.rstrip().endswith(";"):
        raise ValueError(f"{path} does not look like data/bolao-data.js")
    return json.loads(text[len(prefix):].rstrip()[:-1])


def write_data_file(path, data):
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    Path(path).write_text(f"window.BOLAO_DATA = {payload};\n", encoding="utf-8")


def parse_pdf(pdf_path):
    bets_by_name = {name: [] for names in PARTICIPANTS_BY_PAGE for name in names}

    with pdfplumber.open(str(pdf_path)) as pdf:
        if len(pdf.pages) != len(PARTICIPANTS_BY_PAGE):
            raise ValueError(f"Expected 6 pages, found {len(pdf.pages)}")

        for page_index, page in enumerate(pdf.pages):
            names = PARTICIPANTS_BY_PAGE[page_index]
            rows_seen = 0
            text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""

            for line in text.splitlines():
                matches = MATCH_RE.findall(line)
                if not matches:
                    continue
                if len(matches) != len(names):
                    raise ValueError(
                        f"Page {page_index + 1}: expected {len(names)} columns, "
                        f"found {len(matches)} in line {line!r}"
                    )
                if rows_seen >= len(SLOT_SEQUENCE):
                    raise ValueError(f"Page {page_index + 1}: too many bet rows")

                slot, phase, match_id, _, _ = SLOT_SEQUENCE[rows_seen]
                for name, raw_match in zip(names, matches):
                    team1, g1, g2, team2 = raw_match
                    bets_by_name[name].append({
                        "slot": slot,
                        "matchId": match_id,
                        "phase": phase,
                        "team1": team1.strip().title(),
                        "team2": team2.strip().title(),
                        "g1": int(g1),
                        "g2": int(g2),
                    })
                rows_seen += 1

            if rows_seen != len(SLOT_SEQUENCE):
                raise ValueError(f"Page {page_index + 1}: expected 16 rows, found {rows_seen}")

    apply_known_corrections(bets_by_name)

    for bets in bets_by_name.values():
        infer_winners(bets)

    return bets_by_name


def apply_known_corrections(bets_by_name):
    corrections = {
        ("PAULO", "QF-1", "team2"): "Canadá",
        ("IVETE", "QF-3", "team2"): "Inglaterra",
    }
    for (participant, slot, field), value in corrections.items():
        for bet in bets_by_name.get(participant, []):
            if bet["slot"] == slot:
                bet[field] = value
                break


def team_in_bet(team, bet):
    return normalize(team) in {normalize(bet["team1"]), normalize(bet["team2"])}


def infer_winners(bets):
    by_slot = {bet["slot"]: bet for bet in bets}
    downstream = {
        "OIT-1": "QF-1", "OIT-2": "QF-1",
        "OIT-5": "QF-2", "OIT-6": "QF-2",
        "OIT-3": "QF-3", "OIT-4": "QF-3",
        "OIT-7": "QF-4", "OIT-8": "QF-4",
        "QF-1": "SF-1", "QF-2": "SF-1",
        "QF-3": "SF-2", "QF-4": "SF-2",
        "SF-1": "FINAL", "SF-2": "FINAL",
    }

    for bet in bets:
        winner = None
        source = ""
        if bet["g1"] > bet["g2"]:
            winner = bet["team1"]
            source = "score"
        elif bet["g2"] > bet["g1"]:
            winner = bet["team2"]
            source = "score"
        else:
            next_bet = by_slot.get(downstream.get(bet["slot"]))
            if next_bet and team_in_bet(bet["team1"], next_bet):
                winner = bet["team1"]
                source = "next-round"
            elif next_bet and team_in_bet(bet["team2"], next_bet):
                winner = bet["team2"]
                source = "next-round"

        bet["winner"] = winner
        bet["winnerSource"] = source


def bracket_slots():
    slots = []
    for slot, phase, match_id, team1, team2 in SLOT_SEQUENCE:
        slots.append({
            "slot": slot,
            "matchId": match_id,
            "phase": phase,
            "group": "Fase Final",
            "team1": team1,
            "team2": team2,
        })
    return slots


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--data", default="data/bolao-data.js")
    args = parser.parse_args()

    data = parse_data_file(args.data)
    bets_by_name = parse_pdf(args.pdf)
    by_name = {normalize(participant["name"]): participant for participant in data["participants"]}

    missing = []
    for pdf_name, bets in bets_by_name.items():
        participant = by_name.get(normalize(pdf_name))
        if not participant:
            missing.append(pdf_name)
            continue
        participant["bracketBets"] = bets

    if missing:
        raise ValueError(f"Participants not found in data file: {', '.join(missing)}")

    data["bracketSlots"] = bracket_slots()
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    data["finalPhaseSource"] = str(Path(args.pdf))

    write_data_file(args.data, data)
    total = sum(len(participant.get("bracketBets", [])) for participant in data["participants"])
    print(f"Imported {total} final phase bracket bets for {len(bets_by_name)} participants.")


if __name__ == "__main__":
    main()
