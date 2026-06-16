import { Router, Request, Response } from 'express';
import multer from 'multer';
import { queueManager } from '../services/QueueManager';

export const uploadRouter = Router();

// Configura multer com armazenamento em memória
const storage = multer.memoryStorage();
const upload = multer({ storage });

uploadRouter.post('/upload', upload.array('files'), async (req: Request, res: Response): Promise<any> => {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        console.log(`[Upload] Recebidos ${files.length} arquivo(s). Enfileirando...`);

        // Cria uma Promise para cada arquivo, adicionando-o à fila
        // A flag sync_snow define se os dados devem ser enviados para o ServiceNow
        const syncSnow = req.body.sync_snow === 'true';

        const promises = files.map((file) =>
            queueManager
                .enqueue(file.buffer, file.mimetype, file.originalname, syncSnow)
                .then((data) => ({
                    file_name: file.originalname,
                    status: 'concluido' as const,
                    extracted_data: data,
                }))
                .catch((err) => ({
                    file_name: file.originalname,
                    status: 'erro' as const,
                    error: err instanceof Error ? err.message : 'Erro desconhecido ao processar o arquivo.',
                }))
        );

        // Aguarda TODOS os arquivos serem processados pela fila + Gemini
        const results = await Promise.all(promises);

        return res.status(200).json({ results });
    } catch (error) {
        console.error('Upload handler error:', error);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});