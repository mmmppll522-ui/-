#!/usr/bin/env node
// Validates every data file against the schema described in docs/DATA_SCHEMA.md.
// Exits with code 1 when any error is found. Warnings never fail the run.
//   node scripts/validate.mjs            # summary
//   node scripts/validate.mjs --verbose  # also print every warning
import { relative } from 'node:path';
import { loadAll, normalizeTerm, ROOT } from './lib/data.mjs';

const verbose = process.argv.includes('--verbose');
const { meta, cuisines, tags, ingredients, batches, recipes } = loadAll();

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const LANGS = meta.languages; // ar, tr, en
const SEARCH_LANGS = meta.search_languages;
const CATEGORIES = new Set(Object.keys(meta.categories));
const UNITS = new Set(Object.keys(meta.units));
const MEAL_TYPES = new Set(Object.keys(meta.meal_types));
const COURSES = new Set(Object.keys(meta.courses));
const DIFFICULTIES = new Set(Object.keys(meta.difficulties));
const CONTAINS = new Set(Object.keys(meta.contains));
const TAGS = new Set(Object.keys(tags));
const CUISINES = new Map(cuisines.cuisines.map((c) => [c.id, c]));
const REGIONS = new Set(Object.keys(cuisines.regions));

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isBool = (v) => typeof v === 'boolean';
const isInt = (v) => Number.isInteger(v);

// ---------------------------------------------------------------- cuisines
for (const c of cuisines.cuisines) {
  if (!REGIONS.has(c.region)) err(`cuisine ${c.id}`, `unknown region "${c.region}"`);
  for (const l of LANGS) if (!isStr(c.name?.[l])) err(`cuisine ${c.id}`, `missing name.${l}`);
}

// ------------------------------------------------------------- ingredients
const ING = new Map();
for (const ing of ingredients) {
  const where = `ingredient ${ing.id}`;
  if (!/^[a-z0-9_]+$/.test(ing.id ?? '')) err(where, 'id must be snake_case');
  if (ING.has(ing.id)) err(where, 'duplicate id');
  ING.set(ing.id, ing);
  for (const l of LANGS) {
    if (!isStr(ing.names?.[l])) err(where, `missing names.${l}`);
    if (!Array.isArray(ing.synonyms?.[l])) err(where, `synonyms.${l} must be an array`);
  }
  for (const l of SEARCH_LANGS) if (!isStr(ing.search_term?.[l])) err(where, `missing search_term.${l}`);
  if (!CATEGORIES.has(ing.category)) err(where, `unknown category "${ing.category}"`);
  for (const f of ['pantry_staple', 'basic_spice', 'generic']) if (!isBool(ing[f])) err(where, `${f} must be boolean`);
  for (const c of ing.contains ?? []) if (!CONTAINS.has(c)) err(where, `unknown contains flag "${c}"`);
}
for (const ing of ingredients) {
  const where = `ingredient ${ing.id}`;
  for (const f of ['substitutes', 'parents']) {
    for (const ref of ing[f] ?? []) {
      if (ref === ing.id) err(where, `${f} references itself`);
      else if (!ING.has(ref)) err(where, `${f} references unknown ingredient "${ref}"`);
    }
  }
}

// Ambiguous autocomplete terms: the same normalised word pointing at two ingredients.
const termOwners = new Map();
for (const ing of ingredients) {
  for (const l of LANGS) {
    for (const t of [ing.names[l], ...(ing.synonyms[l] ?? [])]) {
      const key = `${l}:${normalizeTerm(t)}`;
      if (!termOwners.has(key)) termOwners.set(key, new Set());
      termOwners.get(key).add(ing.id);
    }
  }
}
for (const [key, owners] of termOwners) {
  if (owners.size > 1) warn('synonyms', `"${key}" maps to ${[...owners].join(', ')}`);
}

// ----------------------------------------------------------------- recipes
const MEATY = ['meat', 'poultry', 'seafood', 'pork', 'gelatin'];
const ANIMAL = [...MEATY, 'dairy', 'egg', 'honey'];
const NOT_HALAL = ['pork', 'alcohol'];

const seenIds = new Map();
for (const { file, recipes: list } of batches) {
  const f = relative(ROOT, file);
  if (!Array.isArray(list)) { err(f, 'file must contain an array of recipes'); continue; }
  if (list.length > 25) warn(f, `batch has ${list.length} recipes (target is 25 per file)`);
}

for (const r of recipes) {
  const where = `recipe ${r.id} (${relative(ROOT, r.__file)})`;
  if (!/^[a-z]{2,4}-[a-z0-9-]+$/.test(r.id ?? '')) err(where, 'id must look like "syr-dish-name"');
  if (seenIds.has(r.id)) err(where, `duplicate id (also in ${seenIds.get(r.id)})`);
  seenIds.set(r.id, relative(ROOT, r.__file));

  for (const l of [...LANGS, 'native']) if (!isStr(r.name?.[l])) err(where, `missing name.${l}`);

  const cuisine = CUISINES.get(r.cuisine);
  if (!cuisine) err(where, `unknown cuisine "${r.cuisine}"`);
  else if (cuisine.region !== r.region) err(where, `region "${r.region}" does not match cuisine region "${cuisine.region}"`);

  if (!Array.isArray(r.meal_type) || r.meal_type.length === 0) err(where, 'meal_type must be a non-empty array');
  else for (const m of r.meal_type) if (!MEAL_TYPES.has(m)) err(where, `unknown meal_type "${m}"`);
  if (!COURSES.has(r.course)) err(where, `unknown course "${r.course}"`);
  if (!DIFFICULTIES.has(r.difficulty)) err(where, `unknown difficulty "${r.difficulty}"`);
  for (const f of ['prep_minutes', 'cook_minutes']) if (!isInt(r[f]) || r[f] < 0) err(where, `${f} must be an integer >= 0`);
  if (!isInt(r.servings) || r.servings < 1) err(where, 'servings must be an integer >= 1');
  if (!isInt(r.popularity) || r.popularity < 1 || r.popularity > 5) err(where, 'popularity must be 1-5');

  // ingredients
  const used = new Set();
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) err(where, 'ingredients must be a non-empty array');
  for (const [i, item] of (r.ingredients ?? []).entries()) {
    const w = `${where} ingredient #${i + 1}`;
    if (!ING.has(item.ingredient_id)) { err(w, `unknown ingredient_id "${item.ingredient_id}"`); continue; }
    if (used.has(item.ingredient_id)) warn(w, `"${item.ingredient_id}" listed twice`);
    used.add(item.ingredient_id);
    if (!UNITS.has(item.unit)) err(w, `unknown unit "${item.unit}"`);
    if (item.unit === 'to_taste') {
      if (item.amount !== null) err(w, 'amount must be null when unit is to_taste');
    } else if (typeof item.amount !== 'number' || !(item.amount > 0)) {
      err(w, 'amount must be a positive number');
    }
    if (!isBool(item.optional)) err(w, 'optional must be boolean');
    if (item.note !== '' && !(item.note && LANGS.every((l) => isStr(item.note[l])))) {
      err(w, 'note must be "" or an object with ar/tr/en');
    }
  }

  // steps and tips
  const stepCounts = LANGS.map((l) => (Array.isArray(r.steps?.[l]) ? r.steps[l].length : -1));
  if (stepCounts.some((n) => n < 1)) err(where, 'steps.ar/tr/en must be non-empty arrays');
  else if (new Set(stepCounts).size > 1) err(where, `steps have different lengths per language (${stepCounts.join('/')})`);
  for (const l of LANGS) for (const s of r.steps?.[l] ?? []) if (!isStr(s)) err(where, `empty step in steps.${l}`);
  if (!Array.isArray(r.tips?.ar)) err(where, 'tips.ar must be an array');
  for (const l of ['tr', 'en']) {
    if (r.tips?.[l] && r.tips[l].length !== r.tips.ar.length) warn(where, `tips.${l} length differs from tips.ar`);
  }

  // tags and sources
  for (const t of r.tags ?? []) if (!TAGS.has(t)) err(where, `unknown tag "${t}"`);
  const sources = new Set(r.sources ?? []);
  if (sources.size < 2) err(where, 'needs at least 2 distinct sources');
  for (const s of sources) if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(s)) err(where, `invalid source URL "${s}"`);
  const hosts = new Set([...sources].map((s) => { try { return new URL(s).host.replace(/^www\./, ''); } catch { return s; } }));
  if (hosts.size < 2) err(where, 'sources must come from at least 2 different websites');

  // diet flags must agree with the ingredient dictionary
  const d = r.diet ?? {};
  for (const f of ['halal', 'vegetarian', 'vegan', 'gluten_free']) if (!isBool(d[f])) err(where, `diet.${f} must be boolean`);
  const all = (r.ingredients ?? []).filter((x) => ING.has(x.ingredient_id));
  const required = all.filter((x) => !x.optional);
  const has = (list, flags) => list.some((x) => (ING.get(x.ingredient_id).contains ?? []).some((c) => flags.includes(c)));

  if (d.halal && has(required, NOT_HALAL)) err(where, 'marked halal but contains pork/alcohol');
  if (d.halal && has(all, NOT_HALAL)) warn(where, 'optional ingredient is pork/alcohol; add a halal note');
  if (!d.halal && !has(all, NOT_HALAL)) err(where, 'marked not halal but no pork/alcohol ingredient found');
  if (!d.halal && !isStr(r.halal_note?.ar)) err(where, 'non-halal recipes need halal_note {ar,tr,en}');

  if (d.vegetarian && has(required, MEATY)) err(where, 'marked vegetarian but contains meat/poultry/seafood');
  if (!d.vegetarian && !has(all, MEATY)) err(where, 'marked not vegetarian but has no meat/poultry/seafood');
  if (d.vegan && !d.vegetarian) err(where, 'vegan implies vegetarian');
  if (d.vegan && has(required, ANIMAL)) err(where, 'marked vegan but contains animal products');
  if (!d.vegan && !has(all, ANIMAL)) err(where, 'marked not vegan but has no animal products');
  if (d.gluten_free && has(required, ['gluten'])) err(where, 'marked gluten_free but contains gluten');
  if (!d.gluten_free && !has(all, ['gluten'])) err(where, 'marked not gluten_free but has no gluten ingredient');
}

// ------------------------------------------------------------------ report
// Every ingredient should be reachable: used by a recipe, offered as a substitute, or a generic parent.
const usedIds = new Set(recipes.flatMap((r) => (r.ingredients ?? []).map((x) => x.ingredient_id)));
const referenced = new Set(ingredients.flatMap((i) => [...(i.substitutes ?? []), ...(i.parents ?? [])]));
const unused = ingredients.filter((i) => !i.generic && !usedIds.has(i.id) && !referenced.has(i.id));
if (unused.length) warn('ingredients', `${unused.length} ingredients unused and unreferenced: ${unused.map((i) => i.id).join(', ')}`);

console.log(`Checked ${recipes.length} recipes in ${batches.length} files, ${ingredients.length} ingredients, ${cuisines.cuisines.length} cuisines.`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s)${verbose ? ':' : ' (run with --verbose to list)'}`);
  if (verbose) for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log('  ✖ ' + e);
  process.exit(1);
}
console.log('\n✔ All data is valid.');
