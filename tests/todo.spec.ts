import { test, expect } from '@playwright/test';

const breaks = new Set(
  (process.env.BREAK ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

test.beforeEach(async ({ request, page }) => {
  await request.post('/api/reset');
  await page.goto('/');
});

async function addTodo(page: import('@playwright/test').Page, text: string) {
  await page.getByLabel('New todo').fill(text);
  await page.getByRole('button', { name: 'Add todo' }).click();
  await expect(page.getByTestId('todo').filter({ hasText: text })).toBeVisible();
}

test('page loads with an empty list', async ({ page }) => {
  await expect(page.getByTestId('summary')).toHaveText('0 of 0 done');
  await expect(page.getByTestId('todo')).toHaveCount(0);
});

test('adds a todo', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await expect(page.getByTestId('todo')).toHaveCount(1);
});

test('add button is labelled correctly', async ({ page }) => {
  const expected = breaks.has('test-bug') ? 'Add task' : 'Add todo';
  await expect(page.getByRole('button', { name: expected })).toBeVisible();
});

test('summary counts only completed todos', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await addTodo(page, 'walk dog');
  await expect(page.getByTestId('summary')).toHaveText('0 of 2 done');

  await page.getByTestId('todo').filter({ hasText: 'buy milk' }).getByTestId('toggle').click();
  await expect(page.getByTestId('summary')).toHaveText('1 of 2 done');
});

test('toggling marks a todo done', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await page.getByTestId('toggle').click();
  await expect(page.getByTestId('todo').first()).toHaveAttribute('data-done', 'true');
});

test('summary refreshes promptly after a reload', async ({ page }) => {
  await addTodo(page, 'buy milk');
  await page.reload();
  // Deliberately tight budget for the refreshed summary.
  await expect(page.getByTestId('summary')).toHaveText('0 of 1 done', { timeout: 700 });
});
