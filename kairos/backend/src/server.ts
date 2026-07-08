import express from 'express';
import { handleKairosRequest } from './routes/kairos.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'kairos-backend-runtime' });
});

app.post('/api/kairos', handleKairosRequest);

app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    code: 'not_found',
    message: 'Route not found.'
  });
});

app.listen(port, () => {
  console.info(`[kairos-runtime] listening on port ${port}`);
});
