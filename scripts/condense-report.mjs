import { readFileSync, writeFileSync } from 'node:fs';

const IN = process.argv[2] ?? 'test-results/report.json';
const OUT = process.argv[3] ?? 'triage-input.md';
const MAX_ERROR_CHARS = 2500;

const trim = (s, n = MAX_ERROR_CHARS) => {
  const clean = String(s ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trimEnd();
  return clean.length > n ? `${clean.slice(0, n)}\n… [truncated]` : clean;
};

let report;
try {
  report = JSON.parse(readFileSync(IN, 'utf8'));
} catch (err) {
  writeFileSync(
    OUT,
    [
      '# Test failure triage input',
      '',
      `No usable Playwright report at \`${IN}\` (${err.message}).`,
      'The suite most likely never started — treat this as a run-level failure.',
      '',
    ].join('\n')
  );
  console.log(`wrote ${OUT} (no report)`);
  process.exit(0);
}

function collect(suite, trail = []) {
  const path = [...trail, suite.title].filter(Boolean);
  const out = [];
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      out.push({ spec, test: t, file: spec.file, line: spec.line, path });
    }
  }
  for (const child of suite.suites ?? []) out.push(...collect(child, path));
  return out;
}

const all = (report.suites ?? []).flatMap((s) => collect(s));
const interesting = all.filter((t) => ['unexpected', 'flaky'].includes(t.test.status));

const lines = ['# Test failure triage input', ''];

const stats = report.stats ?? {};
lines.push(
  `- Run: ${stats.expected ?? 0} passed, ${stats.unexpected ?? 0} failed, ` +
    `${stats.flaky ?? 0} flaky, ${stats.skipped ?? 0} skipped in ${Math.round((stats.duration ?? 0) / 1000)}s`
);
lines.push('');

for (const err of report.errors ?? []) {
  lines.push('## Run-level error (no tests executed)', '', '```', trim(err.message ?? err), '```', '');
}

if (interesting.length === 0 && (report.errors ?? []).length === 0) {
  lines.push('No failing tests.', '');
}

for (const { spec, test: t, file, line, path } of interesting) {
  lines.push(`## ${[...path, spec.title].join(' › ')}`, '');
  lines.push(`- File: \`${file}:${line}\``);
  lines.push(`- Status: ${t.status} (${t.results.length} attempt${t.results.length === 1 ? '' : 's'})`);
  lines.push(`- Attempt outcomes: ${t.results.map((r) => `${r.status} in ${r.duration}ms`).join(', ')}`);
  lines.push('');

  const last = t.results[t.results.length - 1];
  for (const e of last?.errors ?? []) {
    if (e.message) lines.push('```', trim(e.message), '```', '');
    if (e.snippet) lines.push('Code frame:', '```', trim(e.snippet, 1200), '```', '');
    if (e.location) lines.push(`Thrown at \`${e.location.file}:${e.location.line}:${e.location.column}\``, '');
  }
  if (last?.stdout?.length) {
    lines.push('Server/stdout:', '```', trim(last.stdout.map((c) => c.text ?? c).join(''), 800), '```', '');
  }
}

writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${OUT} (${interesting.length} failing test(s), ${(report.errors ?? []).length} run-level error(s))`);
