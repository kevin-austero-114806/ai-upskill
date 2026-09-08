// Applies a named defect to the working tree, so the failing code the triage
// agent reads looks like an ordinary mistake rather than an injection seam.
// Reverse with `--reset` (git checkout of app/ and tests/).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BACKUP_DIR = '.defect-backup';

const RECIPES = {
  'product-bug': {
    file: 'app/server.mjs',
    find: `  const done = list.filter((t) => t.done).length;
  return \`\${done} of \${list.length} done\`;`,
    replace: `  const remaining = list.filter((t) => !t.done).length;
  return \`\${remaining} of \${list.length} done\`;`,
  },
  'test-bug': {
    file: 'tests/todo.spec.ts',
    find: `await expect(page.getByRole('button', { name: 'Add todo' })).toBeVisible();`,
    replace: `await expect(page.getByRole('button', { name: 'Add task' })).toBeVisible();`,
  },
  flaky: {
    file: 'tests/todo.spec.ts',
    find: `test('summary survives a reload', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await page.reload();
  await expect(page.getByTestId('summary')).toHaveText('0 of 1 done');
});`,
    replace: `test('summary survives a reload', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await page.reload();
  await expect(page.getByTestId('summary')).toHaveText('0 of 1 done');
});

test('generated ids land on even boundaries', async () => {
  const sample = () => Math.floor(Math.random() * 1000);
  expect(sample() % 2).toBe(0);
  expect(sample() % 2).toBe(0);
  expect(sample() % 2).toBe(0);
  expect(sample() % 2).toBe(0);
});`,
  },
  timeout: {
    file: 'app/server.mjs',
    find: `  todo.done = !todo.done;
  res.json(todo);`,
    replace: `  todo.done = !todo.done;`,
  },
  infra: {
    file: 'app/server.mjs',
    find: `const port = Number(process.env.PORT ?? 3000);`,
    replace: `if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not configured');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);`,
  },
};

const args = process.argv.slice(2).flatMap((a) => a.split(',')).map((a) => a.trim()).filter(Boolean);

if (args.includes('--reset')) {
  if (!existsSync(BACKUP_DIR)) {
    console.log('nothing to reset — no defects applied');
    process.exit(0);
  }
  for (const file of new Set(Object.values(RECIPES).map((r) => r.file))) {
    const backup = join(BACKUP_DIR, file);
    if (existsSync(backup)) {
      writeFileSync(file, readFileSync(backup, 'utf8'));
      console.log(`restored ${file}`);
    }
  }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  process.exit(0);
}

if (args.length === 0) {
  console.error(`usage: node scripts/apply-defect.mjs <${Object.keys(RECIPES).join('|')}>[,...] | --reset`);
  process.exit(1);
}

for (const name of args) {
  const recipe = RECIPES[name];
  if (!recipe) {
    console.error(`unknown defect "${name}" — expected one of: ${Object.keys(RECIPES).join(', ')}`);
    process.exit(1);
  }
  const original = readFileSync(recipe.file, 'utf8');
  // Recipes are written with LF; a git checkout on Windows can hand us CRLF.
  const crlf = /\r\n/.test(original);
  const source = crlf ? original.split('\r\n').join('\n') : original;
  if (!source.includes(recipe.find)) {
    console.error(
      `cannot apply "${name}": ${recipe.file} does not contain the expected text. ` +
        'Run --reset first, or the recipe is stale.'
    );
    process.exit(1);
  }
  const backup = join(BACKUP_DIR, recipe.file);
  if (!existsSync(backup)) {
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, original);
  }
  const patched = source.replace(recipe.find, recipe.replace);
  writeFileSync(recipe.file, crlf ? patched.split('\n').join('\r\n') : patched);
  console.log(`applied ${name} to ${recipe.file}`);
}
