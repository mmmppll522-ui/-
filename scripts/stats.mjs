#!/usr/bin/env node
// Prints collection statistics and a random sample of recipes for review.
//   node scripts/stats.mjs                    # stats + 10 random recipes
//   node scripts/stats.mjs --sample 5 --seed 42
//   node scripts/stats.mjs --md > report.md   # markdown output
import { loadAll, mulberry32 } from './lib/data.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};
const sampleSize = opt('--sample', 10);
const seed = opt('--seed', Date.now() % 100000);
const md = args.includes('--md');

const { meta, cuisines, ingredients, recipes } = loadAll();
const ING = new Map(ingredients.map((i) => [i.id, i]));
const count = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());

const out = [];
const h = (t) => out.push(md ? `\n## ${t}\n` : `\n=== ${t} ===`);
const row = (...cells) => out.push(md ? `| ${cells.join(' | ')} |` : cells.join('  '));
const header = (...cells) => {
  row(...cells);
  if (md) out.push(`|${cells.map(() => '---').join('|')}|`);
};

// ---- per cuisine vs target
h('Recipes per cuisine');
const byCuisine = count(recipes.map((r) => r.cuisine));
header('cuisine', 'recipes', 'target', 'status');
let started = 0;
for (const c of cuisines.cuisines) {
  const n = byCuisine.get(c.id) ?? 0;
  if (n === 0) continue;
  started++;
  row(`${c.flag} ${c.name.en} (${c.name.ar})`, n, c.target, n >= c.target ? '✅' : `${c.target - n} to go`);
}
const totalTarget = cuisines.cuisines.reduce((s, c) => s + c.target, 0);
out.push(`${md ? '\n' : ''}Total: ${recipes.length} recipes across ${started}/${cuisines.cuisines.length} cuisines (v1 target ${totalTarget}).`);

// ---- breakdowns
const breakdown = (title, keys, labels) => {
  h(title);
  header('value', 'recipes');
  for (const [k, n] of [...count(keys)].sort((a, b) => b[1] - a[1])) row(labels?.[k]?.en ?? k, n);
};
breakdown('By course', recipes.map((r) => r.course), meta.courses);
breakdown('By meal type', recipes.flatMap((r) => r.meal_type), meta.meal_types);
breakdown('By difficulty', recipes.map((r) => r.difficulty), meta.difficulties);

h('Diet');
header('flag', 'recipes');
for (const f of ['halal', 'vegetarian', 'vegan', 'gluten_free']) row(f, recipes.filter((r) => r.diet[f]).length);

h('Ingredients');
const usage = count(recipes.flatMap((r) => r.ingredients.map((i) => i.ingredient_id)));
out.push(`${ingredients.length} ingredients in the dictionary, ${usage.size} used by recipes.`);
out.push(`${ingredients.reduce((s, i) => s + Object.values(i.synonyms).flat().length, 0)} synonyms across ar/tr/en.`);
header('most used', 'recipes');
for (const [id, n] of [...usage].sort((a, b) => b[1] - a[1]).slice(0, 15)) row(`${ING.get(id).names.en} (${ING.get(id).names.ar})`, n);

// ---- random sample
h(`${sampleSize} random recipes (seed ${seed})`);
const rand = mulberry32(seed);
const pool = [...recipes];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
for (const [n, r] of pool.slice(0, sampleSize).entries()) {
  const core = r.ingredients.filter((i) => !i.optional && !ING.get(i.ingredient_id).pantry_staple);
  const lines = [
    `${n + 1}. ${r.name.ar} — ${r.name.en} — ${r.name.tr}  [${r.id}]`,
    `   ${r.cuisine} · ${meta.courses[r.course].en} · ${r.prep_minutes + r.cook_minutes} min · serves ${r.servings} · ${r.difficulty}` +
      ` · halal:${r.diet.halal ? '✓' : '✗'} veg:${r.diet.vegetarian ? '✓' : '✗'}`,
    `   core ingredients: ${core.map((i) => ING.get(i.ingredient_id).names.ar).join('، ')}`,
    `   first step: ${r.steps.ar[0]}`,
    `   sources: ${r.sources.join(' , ')}`,
  ];
  out.push(md ? lines.join('  \n') + '\n' : lines.join('\n'));
}

console.log(out.join('\n'));
