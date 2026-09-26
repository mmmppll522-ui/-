# Data schema — «شو أطبخ؟»

The JSON files in `data/` are the **source of truth**. They are validated by
`npm run validate` and will be uploaded to Supabase by a script in Phase 2.
Always run `npm run check` before committing.

| File | Content |
|---|---|
| `data/recipes/<cuisine>-NN.json` | One batch (max 25) of recipes for one cuisine |
| `data/ingredients.json` | Unified ingredient dictionary shared by all recipes |
| `data/cuisines.json` | Cuisine groups, regions, cuisines, flags, per-cuisine targets |
| `data/meta.json` | Labels (ar/tr/en) for categories, units, meal types, courses, difficulty, diet flags |
| `data/tags.json` | Allowed recipe tags with labels |

UI languages are `ar` (default), `tr`, `en`. Store-search languages add `de` and `fr`.

## Recipe

```jsonc
{
  "id": "syr-kibbeh-bil-sanieh",          // <cuisine prefix>-<dish>, unique
  "name": { "ar": "…", "tr": "…", "en": "…", "native": "…" },
  "cuisine": "syrian",                    // id from cuisines.json
  "region": "levant",                     // must equal the cuisine's region
  "meal_type": ["lunch", "dinner"],       // breakfast | lunch | dinner | snack | dessert | drink
  "course": "main",                       // main | side | appetizer | soup | salad | dessert | pastry | bread | sauce | drink
  "prep_minutes": 45, "cook_minutes": 45, "servings": 6,
  "difficulty": "medium",                 // easy | medium | hard
  "popularity": 5,                        // 1–5, used to rank results after match %
  "diet": { "halal": true, "vegetarian": false, "vegan": false, "gluten_free": false },
  "halal_note": { "ar": "…", "tr": "…", "en": "…" },   // required only when halal = false
  "ingredients": [
    { "ingredient_id": "bulgur_fine", "amount": 2, "unit": "cup", "optional": false, "note": "" },
    { "ingredient_id": "salt", "amount": null, "unit": "to_taste", "optional": false, "note": "" },
    { "ingredient_id": "butter", "amount": 4, "unit": "tbsp", "optional": false,
      "note": { "ar": "أو سمنة", "tr": "veya sade yağ", "en": "or ghee" } }
  ],
  "steps": { "ar": ["…"], "tr": ["…"], "en": ["…"] },  // same number of steps in each language
  "tips":  { "ar": ["…"], "tr": ["…"], "en": ["…"] },
  "tags": ["feast", "ramadan"],           // keys from tags.json
  "sources": ["https://…", "https://…"]   // ≥ 2 URLs from ≥ 2 different websites
}
```

Rules enforced by the validator:

- `amount` is a positive number, or `null` only with unit `to_taste`. Units come from `meta.json`.
- `note` is `""` or an object with `ar`, `tr`, `en`.
- Diet flags must agree with the ingredients' `contains` flags:
  a required ingredient containing `meat/poultry/seafood/pork/gelatin` → not vegetarian;
  plus `dairy/egg/honey` → not vegan; `gluten` → not gluten-free; `pork/alcohol` → not halal.
  Flags may not be under-claimed either (e.g. `vegan: false` with no animal ingredient is an error).
  Optional ingredients do not break a flag (e.g. optional bread in a gluten-free soup).
- Steps are written in our own words (no copying from source sites).

## Ingredient

```jsonc
{
  "id": "tomato",
  "names":    { "ar": "طماطم", "tr": "domates", "en": "tomato" },
  "synonyms": { "ar": ["بندورة", "قوطة"], "tr": [], "en": ["tomatoes"] },  // dialects & variants, used by autocomplete
  "category": "vegetables",               // key of meta.categories
  "pantry_staple": false,                 // salt, water, sugar, black pepper, oils → never counted as missing
  "basic_spice": false,                   // common spices covered by the “I have the basics” toggle
  "generic": false,                       // true for umbrella entries users type (meat, cheese, lentils…)
  "parents": [],                          // e.g. chicken_breast → ["chicken"]; used for matching
  "contains": [],                         // meat | poultry | seafood | pork | alcohol | gelatin | dairy | egg | honey | gluten
  "substitutes": ["canned_tomato"],       // acceptable replacements (shown with a note)
  "search_term": { "ar": "طماطم", "tr": "domates", "en": "tomatoes", "de": "Tomaten", "fr": "tomates" }
}
```

Matching semantics (Phase 2):

- An ingredient the user has satisfies a recipe line if the ids are equal, or one is an
  ancestor of the other through `parents` (having “chicken” covers “chicken thighs” and vice versa).
- `substitutes` count as available but are flagged with a note in the UI.
- Optional lines and `pantry_staple` items never count against the user; `basic_spice`
  items are covered while the “I have the basics” toggle is on.
- The autocomplete indexes `names` + `synonyms` after normalisation
  (see `normalizeTerm` in `scripts/lib/data.mjs`); the validator warns when one
  normalised term points at two ingredients.

## Adding a batch

1. Research each dish in ≥ 2 reputable sources and note the URLs.
2. Add new ingredients to `data/ingredients.json` first (all names, dialect synonyms, search terms).
3. Create `data/recipes/<cuisine>-NN.json` with at most 25 recipes.
4. `npm run format && npm run check`, then update `PROGRESS.md`.

## Authoring helpers (optional)

`scripts/authoring/` holds two small Python helpers used to write batches faster.
The generated JSON in `data/` stays the source of truth.

- `ingredients.py` — `I(id, category, ar, ar_synonyms, tr, tr_synonyms, en, en_synonyms, (search ar,tr,en,de,fr), subs=…, parents=…, contains=…)` then `save()`.
- `dsl.py` — `cuisine("lebanese")`, then one `R(...)` call per recipe with compact
  ingredient lines (`<id> <amount|-> <unit> [?] [| note ar | note tr | note en]`),
  then `emit("lebanese")` to write `lebanese-01.json`, `lebanese-02.json`, … (25 per file).
  Diet flags are derived automatically from the ingredients' `contains` flags.

Always finish with `npm run format && npm run check`.
