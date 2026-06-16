import dotenv from 'dotenv';
import { InvoiceExtractor } from './InvoiceExtractor';
import { ServiceNowClient } from './ServiceNowClient';
dotenv.config();

// Tipo que representa cada item na fila
interface QueueItem {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    resolve: (value: object) => void;
    reject: (reason: any) => void;
}

class QueueManager {
    private queue: QueueItem[] = [];
    private timer: NodeJS.Timeout | null = null;
    private readonly MAX_SIZE = 5;
    private readonly TIMEOUT_MS = 10000;
    private snowClient: ServiceNowClient;

    constructor() {
        this.snowClient = new ServiceNowClient();
    }

    /**
     * Adiciona um arquivo à fila e retorna uma Promise que será resolvida
     * quando o Gemini terminar de processar aquele arquivo.
     */
    public enqueue(buffer: Buffer, mimeType: string, originalName: string): Promise<object> {
        return new Promise((resolve, reject) => {
            const item: QueueItem = { buffer, mimeType, originalName, resolve, reject };
            this.queue.push(item);

            console.log(`[Queue] Adicionado "${originalName}". Tamanho da fila: ${this.queue.length}`);

            if (this.queue.length >= this.MAX_SIZE) {
                console.log(`[Queue] Atingiu tamanho máximo (${this.MAX_SIZE}). Iniciando processamento...`);
                this.flush();
            } else if (!this.timer) {
                console.log(`[Queue] Timer de ${this.TIMEOUT_MS}ms iniciado.`);
                this.timer = setTimeout(() => {
                    console.log(`[Queue] Timer expirou. Iniciando processamento...`);
                    this.flush();
                }, this.TIMEOUT_MS);
            }
        });
    }

    private flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.queue.length === 0) return;

        const batch = [...this.queue];
        this.queue = [];

        console.log(`[BatchProcessor] Processando lote de ${batch.length} arquivo(s)...`);
        this.processBatch(batch);
    }

    private async processBatch(batch: QueueItem[]) {
        // Processa cada item do lote iterativamente usando o serviço isolado
        for (const item of batch) {
            try {
                // 1. Extrai dados da(s) Nota(s) — agora retorna um ARRAY
                const invoices = await InvoiceExtractor.extractData(item.buffer, item.mimeType, item.originalName);
                console.log(`[Gemini] Sucesso em "${item.originalName}". ${invoices.length} nota(s) extraída(s).`);

                // 2. Envia CADA nota para o ServiceNow como um registro separado
                const results: object[] = [];
                for (let i = 0; i < invoices.length; i++) {
                    const invoice = invoices[i];
                    try {
                        console.log(`[QueueManager] Enviando nota ${i + 1}/${invoices.length} de "${item.originalName}" para o ServiceNow...`);
                        const recordId = await this.snowClient.createInvoiceRecord(invoice, item.originalName, item.buffer, item.mimeType);
                        console.log(`[QueueManager] Registro criado: ${recordId}`);
                        results.push({ ...invoice, ticket_servicenow: recordId });
                    } catch (snowError: any) {
                        console.error(`[QueueManager] Erro ao enviar nota ${i + 1} para o ServiceNow: ${snowError.message}`);
                        results.push({ ...invoice, ticket_servicenow: "ERRO_AO_CRIAR_TICKET" });
                    }
                }

                // Resolve a Promise com todos os resultados desse arquivo
                item.resolve(results.length === 1 ? results[0] : results);
            } catch (error) {
                console.error(`[Gemini] Erro ao analisar "${item.originalName}":`, error);
                item.reject(error);
            }
        }

        console.log(`[BatchProcessor] Lote finalizado!`);
    }
}

export const queueManager = new QueueManager();