import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

// Inicializa o cliente do Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

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

    /**
     * Converte o buffer do arquivo para o formato que o Gemini espera (inlineData base64).
     */
    private bufferToGenerativePart(buffer: Buffer, mimeType: string) {
        return {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType,
            },
        };
    }

    private async processBatch(batch: QueueItem[]) {
        // Configura o modelo (Flash é ideal para arquivos multimodais e forçamos a saída em JSON)
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });

        // Prompt Mestre de extração
        const prompt = `Analise a nota fiscal ou recibo em anexo e extraia as seguintes informações. 
        Retorne ESTRITAMENTE um JSON válido com esta estrutura:
        {
            "fornecedor": "Nome da empresa ou CNPJ",
            "valor_total": "Apenas o numero float, ex: 1500.50",
            "data_emissao": "Data no formato YYYY-MM-DD",
            "categoria_despesa": "Sua melhor dedução do tipo de despesa (ex: TI, Alimentacao, Transporte, Servicos)",
            "confianca_leitura": "Um numero de 0 a 100 indicando quao legivel estava a nota"
        }`;

        // Processa cada item do lote iterativamente
        for (const item of batch) {
            try {
                console.log(`[Gemini] Analisando "${item.originalName}"...`);

                const filePart = this.bufferToGenerativePart(item.buffer, item.mimeType);
                const result = await model.generateContent([prompt, filePart]);

                // Como forçamos o responseMimeType, o texto já vem em JSON limpo
                const extractedData = JSON.parse(result.response.text());

                console.log(`[Gemini] Sucesso em "${item.originalName}". Valor: ${extractedData.valor_total}`);

                // Resolve a Promise do controller, devolvendo os dados para o cliente
                item.resolve(extractedData);
            } catch (error) {
                console.error(`[Gemini] Erro ao analisar "${item.originalName}":`, error);

                // Rejeita a Promise desse item específico, mas continua o loop para os outros
                item.reject(error);
            }
        }

        console.log(`[BatchProcessor] Lote finalizado!`);
    }
}

export const queueManager = new QueueManager();