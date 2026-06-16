import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
// Importação de mime-types removida, pois estamos fazendo a verificação pela extensão manualmente
import { InvoiceExtractor } from '../services/InvoiceExtractor';
import { ServiceNowClient } from '../services/ServiceNowClient';

const server = new McpServer({
    name: "4matt-invoice-snow",
    version: "1.0.0"
});

// Ferramenta que o agente (Cursor/Claude) poderá chamar
server.tool(
    "process_and_send_invoice",
    "Processa uma nota fiscal local via Gemini e cria um registro no ServiceNow",
    {
        filePath: z.string().describe("O caminho absoluto do arquivo no computador (ex: C:\\Users\\...\\nota.pdf)")
    },
    async ({ filePath }) => {
        try {
            console.error(`[MCP] Solicitado processamento do arquivo: ${filePath}`);

            // 1. Validar se arquivo existe
            if (!fs.existsSync(filePath)) {
                return {
                    content: [{ type: "text", text: `Erro: O arquivo não foi encontrado em ${filePath}` }]
                };
            }

            // 2. Ler arquivo e descobrir Mime Type
            const buffer = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            const ext = path.extname(filePath).toLowerCase();
            
            let mimeType = 'application/octet-stream';
            if (ext === '.pdf') mimeType = 'application/pdf';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.xml') mimeType = 'text/xml';

            // 3. Extrair dados via Gemini
            console.error(`[MCP] Iniciando extração com Gemini...`);
            const invoices = await InvoiceExtractor.extractData(buffer, mimeType, fileName);
            console.error(`[MCP] Extração concluída. ${invoices.length} nota(s) encontrada(s).`);

            // 4. Enviar para o ServiceNow (com arquivo para anexo)
            console.error(`[MCP] Enviando dados para o ServiceNow...`);
            const snowClient = new ServiceNowClient();
            
            let resultText = `Sucesso! A(s) nota(s) fiscal(is) do arquivo "${fileName}" foram processadas e enviadas ao ServiceNow.\n\n`;

            for (let i = 0; i < invoices.length; i++) {
                const invoice = invoices[i];
                const recordId = await snowClient.createInvoiceRecord(invoice, fileName, buffer, mimeType);
                console.error(`[MCP] Sucesso na nota ${i+1}! Registro ${recordId}`);
                
                resultText += `--- Nota ${i+1} ---\n` +
                              `Registro ID: ${recordId}\n` +
                              `Fornecedor: ${invoice.fornecedor}\n` +
                              `Valor Bruto: ${invoice.valor_bruto}\n` +
                              `Centro de Custo: ${invoice.centro_de_custo}\n\n`;
            }

            return {
                content: [
                    { 
                        type: "text", 
                        text: resultText.trim()
                    }
                ]
            };
        } catch (error: any) {
            console.error("[MCP] Erro fatal:", error.message);
            return {
                content: [{ type: "text", text: `Ocorreu um erro ao processar a nota: ${error.message}` }]
            };
        }
    }
);

// Inicia o servidor MCP via Standard I/O (Stdio)
async function start() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("4MATT Invoice MCP Server running on stdio");
}

start().catch(err => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
});
