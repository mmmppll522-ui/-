"""Compact authoring format for recipes -> data/recipes/*.json.

Ingredient line:  <id> <amount|-> <unit> [?]  [| note ar | note tr | note en]
  '-' amount means null (use with to_taste); '?' marks the line optional.
Diet flags are derived from data/ingredients.json `contains` flags.
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ING = {i["id"]: i for i in json.load(open(f"{ROOT}/data/ingredients.json", encoding="utf-8"))}
CUIS = {c["id"]: c for c in json.load(open(f"{ROOT}/data/cuisines.json", encoding="utf-8"))["cuisines"]}

MEATY = {"meat", "poultry", "seafood", "pork", "gelatin"}
ANIMAL = MEATY | {"dairy", "egg", "honey"}
NOT_HALAL = {"pork", "alcohol"}

RECIPES = []
CUISINE = None


def cuisine(cid):
    global CUISINE
    CUISINE = cid


def parse_ing(text):
    out = []
    for raw in text.strip().splitlines():
        raw = raw.strip()
        if not raw:
            continue
        parts = [p.strip() for p in raw.split("|")]
        head = parts[0].split()
        optional = head[-1] == "?"
        if optional:
            head = head[:-1]
        iid, amt, unit = head[0], head[1], head[2]
        if iid not in ING:
            sys.exit(f"unknown ingredient {iid!r} in line: {raw}")
        amount = None if amt == "-" else (int(amt) if amt.isdigit() else float(amt))
        note = ""
        if len(parts) > 1:
            if len(parts) != 4:
                sys.exit(f"note needs ar|tr|en: {raw}")
            note = {"ar": parts[1], "tr": parts[2], "en": parts[3]}
        out.append({"ingredient_id": iid, "amount": amount, "unit": unit, "optional": optional, "note": note})
    return out


def flags(items, which):
    return any(set(ING[i["ingredient_id"]]["contains"]) & which for i in items)


def R(id, names, course, meals, t, diff, pop, ing, ar, tr, en, tips, tags, src, halal_note=None):
    items = parse_ing(ing)
    req = [i for i in items if not i["optional"]]
    if not (len(ar) == len(tr) == len(en)):
        sys.exit(f"{id}: step count mismatch {len(ar)}/{len(tr)}/{len(en)}")
    if isinstance(tips, tuple):
        tips = [tips]
    r = {
        "id": id,
        "name": {"ar": names[0], "tr": names[1], "en": names[2], "native": names[3]},
        "cuisine": CUISINE,
        "region": CUIS[CUISINE]["region"],
        "meal_type": meals.split(),
        "course": course,
        "prep_minutes": t[0], "cook_minutes": t[1], "servings": t[2],
        "difficulty": diff,
        "popularity": pop,
        "diet": {
            "halal": not flags(req, NOT_HALAL),
            "vegetarian": not flags(req, MEATY),
            "vegan": not flags(req, ANIMAL),
            "gluten_free": not flags(req, {"gluten"}),
        },
        "ingredients": items,
        "steps": {"ar": ar, "tr": tr, "en": en},
        "tips": {"ar": [x[0] for x in tips], "tr": [x[1] for x in tips], "en": [x[2] for x in tips]},
        "tags": tags.split(),
        "sources": src.split(),
    }
    if halal_note:
        r["halal_note"] = {"ar": halal_note[0], "tr": halal_note[1], "en": halal_note[2]}
    RECIPES.append(r)


def emit(prefix, per_file=25):
    """Write RECIPES into <prefix>-01.json, -02.json ... (25 per file)."""
    for n in range(0, len(RECIPES), per_file):
        chunk = RECIPES[n:n + per_file]
        path = f"{ROOT}/data/recipes/{prefix}-{n // per_file + 1:02d}.json"
        json.dump(chunk, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"wrote {len(chunk)} recipes -> {os.path.relpath(path, ROOT)}")
