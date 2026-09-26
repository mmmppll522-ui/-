// Shared helpers for loading the project's JSON data files.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = join(ROOT, 'data');
export const RECIPES_DIR = join(DATA, 'recipes');

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function recipeFiles() {
  return readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(RECIPES_DIR, f));
}

export function loadAll() {
  const meta = readJson(join(DATA, 'meta.json'));
  const cuisines = readJson(join(DATA, 'cuisines.json'));
  const tags = readJson(join(DATA, 'tags.json'));
  const ingredients = readJson(join(DATA, 'ingredients.json'));
  const batches = recipeFiles().map((file) => ({ file, recipes: readJson(file) }));
  const recipes = batches.flatMap((b) => b.recipes.map((r) => ({ ...r, __file: b.file })));
  return { meta, cuisines, tags, ingredients, batches, recipes };
}

// Deterministic PRNG so "random" samples can be reproduced with --seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normalises Arabic/Turkish/English text for synonym matching:
// strips diacritics and tatweel, unifies alef/ya/ta-marbuta forms, lowercases.
export function normalizeTerm(s) {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}
