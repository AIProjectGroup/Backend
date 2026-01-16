import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';

import routes from './routes';
import { connectDB } from './data/DB';
import rateLimiterMiddleware from './middleware/rateLimit';

const app: Express = express();
app.set('trust proxy', true);

const port = process.env.PORT || 3500;

app.use(rateLimiterMiddleware);
app.use(bodyParser.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(helmet());

const origin_url = process.env.FRONTEND_SERVER_ORIGIN;
app.use(
  cors({
    origin: origin_url,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  })
);

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ message: 'Success' });
});

app.use('/api', routes);

const startServer = async () => {
  await connectDB();
  app.listen(port, () => {
    console.log(`[server]: Server is running at Port ${port}`);
  });
};

startServer();
