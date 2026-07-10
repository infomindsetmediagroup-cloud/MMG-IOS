import express from 'express';
import { handleKairosRequest } from './routes/kairos.js';
import {
  handleSessionExchange,
  handleSessionLogout,
  handleSessionStatus
} from './routes/session.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const dashboardOrigin = process.env.KAIROS_DASHBOARD_ORIGIN?.trim()
  || 'https://infomindsetmediagroup-cloud.github.io';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === dashboardOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: '64kb' }));

const healthHandler: express.RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'kairos-backend-runtime' });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.post('/api/session/exchange', handleSessionExchange);
app.get('/api/session', handleSessionStatus);
app.delete('/api/session', handleSessionLogout);
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