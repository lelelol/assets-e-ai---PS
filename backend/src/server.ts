import express from 'express';
import cors from 'cors';
import { uploadRouter } from './controllers/uploadController';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/invoices', uploadRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});