import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export interface InvoiceData {
    fornecedor: string;
    cnpj: string;
    chave_acesso: string;
    numero_nota: string;
    descricao_itens: string;
    valor_bruto: number | string;
    valor_liquido: number | string;
    data_emissao: string;
    tipo_despesa: string;
    centro_de_custo: string;
    necessidade_aprovacao: boolean;
    confianca_leitura: number | string;
}

export class InvoiceExtractor {
    /**
     * Converte o buffer do arquivo para o formato que o Gemini espera (inlineData base64).
     */
    private static bufferToGenerativePart(buffer: Buffer, mimeType: string) {
        return {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType,
            },
        };
    }

    /**
     * Remove tags HTML e retorna apenas o texto puro visível do documento.
     */
    private static stripHtmlTags(html: string): string {
        return html
            .replace(/<style[\s\S]*?<\/style>/gi, '')   // Remove blocos <style>
            .replace(/<script[\s\S]*?<\/script>/gi, '')  // Remove blocos <script>
            .replace(/<head[\s\S]*?<\/head>/gi, '')      // Remove o <head> inteiro
            .replace(/<[^>]+>/g, ' ')                    // Remove todas as tags restantes
            .replace(/&nbsp;/g, ' ')                     // Substitui &nbsp;
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')                        // Colapsa espaços múltiplos
            .trim();
    }

    /**
     * Detecta se o arquivo é baseado em texto (XML, HTML, etc.) pela EXTENSÃO do arquivo.
     * Não confiamos apenas no mimeType do multer pois ele pode vir como application/octet-stream.
     */
    private static isTextBasedFile(mimeType: string, fileName: string): boolean {
        const ext = fileName.toLowerCase().split('.').pop() || '';
        const textExtensions = ['xml', 'html', 'htm', 'txt', 'csv', 'json'];
        const textMimeFragments = ['xml', 'html', 'text', 'json', 'csv'];

        if (textExtensions.includes(ext)) return true;
        if (textMimeFragments.some(frag => mimeType.includes(frag))) return true;

        return false;
    }

    /**
     * Extrai os dados da(s) nota(s) fiscal(is) utilizando o modelo Gemini.
     * Retorna um ARRAY — mesmo que haja apenas 1 nota no arquivo.
     */
    public static async extractData(buffer: Buffer, mimeType: string, originalName: string): Promise<InvoiceData[]> {
        // Configura o modelo
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });

        // Prompt Mestre de extração — pede TODAS as notas como um array
        const prompt = `Você é um especialista em análise de notas fiscais brasileiras.
Analise o conteúdo fornecido abaixo e extraia as informações de TODAS as notas fiscais encontradas.
Retorne ESTRITAMENTE um JSON válido no formato de ARRAY (lista), onde cada elemento é uma nota fiscal:
[
  {
    "fornecedor": "Nome da empresa emissora (Vendor Name). Deixe string vazia se nao encontrar.",
    "cnpj": "Apenas os numeros do CNPJ do emissor, sem pontuacao. Deixe string vazia se nao encontrar.",
    "chave_acesso": "A chave de acesso de 44 digitos da NF-e/CT-e. Deixe string vazia se nao encontrar.",
    "numero_nota": "O numero da nota fiscal. Deixe string vazia se nao encontrar.",
    "descricao_itens": "Resumo claro e conciso dos itens, produtos ou servicos descritos e cobrados na nota.",
    "valor_bruto": 0.00,
    "valor_liquido": 0.00,
    "data_emissao": "YYYY-MM-DD ou string vazia se nao encontrar",
    "tipo_despesa": "Classifique ESTRITAMENTE em UMA destas opcoes: 'TI & Software', 'Hardware & Equipamentos', 'Facilities & Infraestrutura', 'Materiais de Escritório', 'Serviços Terceirizados', 'RH & Treinamentos', 'Viagens & Hospedagem', 'Alimentação', 'Marketing & Eventos', 'Logística & Frete', 'Outros'",
    "centro_de_custo": "Classifique ESTRITAMENTE em UMA destas opcoes: 'TI', 'Administrativo', 'RH', 'Marketing', 'Operacoes', 'Indefinido'. Use o contexto da despesa para deduzir.",
    "necessidade_aprovacao": false,
    "confianca_leitura": 85
  }
]
REGRAS IMPORTANTES:
- SEMPRE retorne um ARRAY, mesmo que só tenha 1 nota. Ex: [ { ... } ]
- Se o arquivo tiver MÚLTIPLAS notas fiscais (ex: XML com várias NFe), retorne um objeto para CADA nota.
- valor_bruto e valor_liquido devem ser NUMEROS (float), nunca strings. Ex: 1500.50
- confianca_leitura deve ser um NUMERO inteiro de 0 a 100, nunca string. Se conseguiu extrair os dados com clareza, retorne 85 ou mais.
- necessidade_aprovacao deve ser true se valor_bruto > 1000
- tipo_despesa DEVE ser exatamente uma das opcoes listadas, sem variações.`;

        console.log(`[InvoiceExtractor] Analisando "${originalName}" (mimeType: ${mimeType})...`);
        
        let contentParts: any[] = [];
        const ext = originalName.toLowerCase().split('.').pop() || '';
        
        if (this.isTextBasedFile(mimeType, originalName)) {
            // Arquivos de texto: lê o conteúdo e injeta direto no prompt
            let textContent = buffer.toString('utf-8');

            // Se for HTML, remove todas as tags e deixa só o texto puro
            if (ext === 'html' || ext === 'htm' || mimeType.includes('html')) {
                console.log(`[InvoiceExtractor] Arquivo HTML detectado. Removendo tags HTML...`);
                textContent = this.stripHtmlTags(textContent);
            }

            // Limita o tamanho para evitar estouro de contexto (max ~60k caracteres)
            if (textContent.length > 60000) {
                console.log(`[InvoiceExtractor] Conteúdo muito grande (${textContent.length} chars), truncando para 60000...`);
                textContent = textContent.substring(0, 60000);
            }

            const fullPrompt = prompt + `\n\n--- CONTEÚDO DO ARQUIVO "${originalName}" ---\n${textContent}\n--- FIM DO CONTEÚDO ---`;
            contentParts = [fullPrompt];
            console.log(`[InvoiceExtractor] Enviando como TEXTO (${textContent.length} chars) para o Gemini...`);
        } else {
            // Arquivos binários (PDF, imagens): envia como anexo multimodal
            const filePart = this.bufferToGenerativePart(buffer, mimeType);
            contentParts = [prompt, filePart];
            console.log(`[InvoiceExtractor] Enviando como ANEXO BINÁRIO para o Gemini...`);
        }

        const result = await model.generateContent(contentParts);
        const rawResponse = result.response.text();
        const parsed = JSON.parse(rawResponse);

        // Normaliza: se o Gemini retornar um objeto solto, transforma em array
        const invoices: InvoiceData[] = Array.isArray(parsed) ? parsed : [parsed];
        
        console.log(`[InvoiceExtractor] "${originalName}": ${invoices.length} nota(s) encontrada(s).`);
        for (const inv of invoices) {
            console.log(`  → Fornecedor: ${inv.fornecedor || 'N/A'}, Valor: ${inv.valor_bruto}, Confiança: ${inv.confianca_leitura}`);
        }
        
        return invoices;
    }
}
