import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabase } from '../services/supabaseClient';
import { queueManager } from '../services/QueueManager';

export const uploadRouter = Router();

// Configure multer with memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

uploadRouter.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided.' });
        }

        const file = req.file;
        const originalName = file.originalname;
        // Generate a random file name to avoid collisions
        const fileName = `${Date.now()}_${Math.round(Math.random() * 1e9)}_${originalName}`;

        // 1. Upload to Supabase Storage
        const { data: storageData, error: storageError } = await supabase
            .storage
            .from('invoice_files')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
            });

        if (storageError) {
            console.error('Storage upload error:', storageError);
            return res.status(500).json({ error: 'Failed to upload to storage.' });
        }

        // Get public URL
        const { data: urlData } = supabase
            .storage
            .from('invoice_files')
            .getPublicUrl(fileName);

        const fileUrl = urlData.publicUrl;

        // 2. Insert into 'invoices' table
        const { data: invoiceData, error: dbError } = await supabase
            .from('invoices')
            .insert({
                file_name: originalName,
                file_url: fileUrl,
                status: 'pendente'
            })
            .select('id')
            .single();

        if (dbError) {
            console.error('Database insert error:', dbError);
            return res.status(500).json({ error: 'Failed to save invoice record.' });
        }

        // 3. Add to Queue 
        const invoiceId = invoiceData.id;
        queueManager.push(invoiceId);

        // 4. Return Accepted immediately
        return res.status(202).json({
            message: 'Invoice received and queued for processing.',
            id: invoiceId
        });

    } catch (error) {
        console.error('Upload handler error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});