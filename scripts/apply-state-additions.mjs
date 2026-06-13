import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const statesDir = path.join(repoRoot, 'src', 'data', 'locations', 'states');
const additionsPath = path.join(repoRoot, 'scripts', 'tmp-state-additions.json');

const additions = JSON.parse(fs.readFileSync(additionsPath, 'utf8'));

for (const [stateSlug, newCities] of Object.entries(additions)) {
  const filePath = path.join(statesDir, `${stateSlug}.json`);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const [citySlug, cityData] of Object.entries(newCities)) {
    if (existing[citySlug]) {
      throw new Error(`Duplicate city slug '${citySlug}' in ${stateSlug}.json`);
    }
    existing[citySlug] = cityData;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`);
}

console.log(`Updated ${Object.keys(additions).length} state files.`);
