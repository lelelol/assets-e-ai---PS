import express from 'express';
import cors from 'cors';
import { uploadRouter } from './controllers/uploadController';

const app = express();

app.use(cors());
app.use(express.json());

import { authMiddleware } from './middlewares/authMiddleware';

app.use('/api/invoices', authMiddleware, uploadRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});