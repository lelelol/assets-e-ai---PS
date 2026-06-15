import { supabase } from './supabaseClient';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializa o cliente do Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

class QueueManager {
    private queue: string[] = [];
    private timer: NodeJS.Timeout | null = null;
    private readonly MAX_SIZE = 5;
    private readonly TIMEOUT_MS = 30000;

    public async push(invoiceId: string) {
        this.queue.push(invoiceId);
        console.log(`[Queue] Adicionado ${invoiceId}. Tamanho da fila: ${this.queue.length}`);

        if (this.queue.length >= this.MAX_SIZE) {
            console.log(`[Queue] Atingiu tamanho maximo (${this.MAX_SIZE}). Iniciando processamento...`);
            this.flush();
        } else if (!this.timer) {
            console.log(`[Queue] Timer de ${this.TIMEOUT_MS}ms iniciado.`);
            this.timer = setTimeout(() => {
                console.log(`[Queue] Timer expirou. Iniciando processamento...`);
                this.flush();
            }, this.TIMEOUT_MS);
        }
    }

    private flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.queue.length === 0) return;

        const batch = [...this.queue];
        this.queue = []; 
        
        console.log(`[BatchProcessor] Processando lote de ${batch.length} notas...`);
        this.processBatch(batch); 
    }

    // Função auxiliar para baixar a imagem/PDF da URL e preparar para o Gemini
    private async fileToGenerativePart(fileUrl: string, fileName: string) {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Define o tipo MIME correto baseado na extensão
        let mimeType = 'application/pdf'; 
        if (fileName.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else if (fileName.toLowerCase().match(/\.(jpg|jpeg)$/)) mimeType = 'image/jpeg';

        return {
            inlineData: {
                data: buffer.toString("base64"),
                mimeType
            },
        };
    }

    private async processBatch(batch: string[]) {
        try {
            // 1. Atualiza todos para 'processando'
            await supabase.from('invoices').update({ status: 'processando' }).in('id', batch);
            console.log(`[BatchProcessor] Status atualizado para 'processando'.`);

            // 2. Busca os dados completos das notas no Supabase (precisamos das URLs)
            const { data: invoices, error: fetchError } = await supabase
                .from('invoices')
                .select('id, file_url, file_name')
                .in('id', batch);

            if (fetchError || !invoices) throw fetchError;

            // 3. Configura o modelo (Flash é ideal para arquivos multimodais e forçamos a saída em JSON)
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            // O seu Prompt Mestre de extração
            const prompt = `Analise a nota fiscal ou recibo em anexo e extraia as seguintes informações. 
            Retorne ESTRITAMENTE um JSON válido com esta estrutura:
            {
                "fornecedor": "Nome da empresa ou CNPJ",
                "valor_total": "Apenas o numero float, ex: 1500.50",
                "data_emissao": "Data no formato YYYY-MM-DD",
                "categoria_despesa": "Sua melhor dedução do tipo de despesa (ex: TI, Alimentacao, Transporte, Servicos)",
                "confianca_leitura": "Um numero de 0 a 100 indicando quao legivel estava a nota"
            }`;

            // 4. Processa cada nota do lote iterativamente
            for (const invoice of invoices) {
                try {
                    console.log(`[Gemini] Analisando nota ${invoice.id}...`);
                    
                    const filePart = await this.fileToGenerativePart(invoice.file_url, invoice.file_name);
                    const result = await model.generateContent([prompt, filePart]);
                    
                    // Como forçamos o responseMimeType, o texto já vem em JSON limpo
                    const extractedData = JSON.parse(result.response.text());

                    // 5. Atualiza o banco com o sucesso e os dados
                    await supabase
                        .from('invoices')
                        .update({ 
                            status: 'concluido', 
                            extracted_data: extractedData 
                        })
                        .eq('id', invoice.id);

                    console.log(`[Gemini] Sucesso na nota ${invoice.id}. Valor: ${extractedData.valor_total}`);
                } catch (itemError) {
                    console.error(`[Gemini] Erro ao analisar nota ${invoice.id}:`, itemError);
                    
                    // Se falhar apenas UMA nota, marcamos ela como erro, mas o loop continua para as outras
                    await supabase
                        .from('invoices')
                        .update({ status: 'erro' })
                        .eq('id', invoice.id);
                }
            }

            console.log(`[BatchProcessor] Lote finalizado!`);

        } catch (error) {
            console.error(`[BatchProcessor] Erro critico no lote:`, error);
        }
    }
}

export const queueManager = new QueueManager();