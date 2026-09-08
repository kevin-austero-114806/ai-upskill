import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

let nextId = 1;
let todos = [];

function summarize(list) {
  const done = list.filter((t) => t.done).length;
  return `${done} of ${list.length} done`;
}

app.get('/api/todos', (_req, res) => {
  res.json({ todos, summary: summarize(todos) });
});

app.post('/api/todos', (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const todo = { id: nextId++, text, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.post('/api/todos/:id/toggle', (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: 'not found' });
  todo.done = !todo.done;
});

app.post('/api/reset', (_req, res) => {
  todos = [];
  nextId = 1;
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`todo app listening on http://localhost:${port}`);
});
