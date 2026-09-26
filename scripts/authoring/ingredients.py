"""Append/update entries in data/ingredients.json.  Usage: see I() signature."""
import json
import os

PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "ingredients.json")
ITEMS = json.load(open(PATH, encoding="utf-8"))
BY_ID = {i["id"]: i for i in ITEMS}
G = ("gluten",)
D = ("dairy",)


def I(id, cat, ar, ar_syn, tr, tr_syn, en, en_syn, s, subs=(), parents=(), contains=(), staple=False, spice=False, generic=False):
    sa, st, se, sd, sf = s
    entry = {
        "id": id,
        "names": {"ar": ar, "tr": tr, "en": en},
        "synonyms": {"ar": list(ar_syn), "tr": list(tr_syn), "en": list(en_syn)},
        "category": cat,
        "pantry_staple": staple,
        "basic_spice": spice,
        "generic": generic,
        "parents": list(parents),
        "contains": list(contains),
        "substitutes": list(subs),
        "search_term": {"ar": sa, "tr": st, "en": se, "de": sd, "fr": sf},
    }
    if id in BY_ID:
        ITEMS[ITEMS.index(BY_ID[id])] = entry
    else:
        ITEMS.append(entry)
    BY_ID[id] = entry


def edit(id, **fields):
    """Shallow edit of an existing entry, e.g. edit('zucchini', synonyms={...})."""
    BY_ID[id].update(fields)


def save():
    json.dump(ITEMS, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(len(ITEMS), "ingredients saved")
