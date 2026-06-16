import axios from 'axios';
import dotenv from 'dotenv';
import { InvoiceData } from './InvoiceExtractor';

dotenv.config();

export class ServiceNowClient {
    private instanceUrl: string;
    private username: string;
    private password: string;

    constructor() {
        this.instanceUrl = process.env.SNOW_INSTANCE || '';
        this.username = process.env.SNOW_USERNAME || '';
        this.password = process.env.SNOW_PASSWORD || '';
    }

    /**
     * Cria um registro na tabela u_invoices e anexa o arquivo original da nota fiscal
     */
    public async createInvoiceRecord(
        invoiceData: InvoiceData, 
        fileName: string, 
        fileBuffer: Buffer, 
        fileMimeType: string
    ): Promise<string> {
        if (!this.instanceUrl || !this.username || !this.password) {
            throw new Error('Credenciais do ServiceNow não configuradas no .env');
        }

        const url = `${this.instanceUrl}/api/now/table/u_invoices`;

        // Verifica se QUALQUER campo essencial está faltante
        const missingFields: string[] = [];
        if (!invoiceData.fornecedor)      missingFields.push('fornecedor');
        if (!invoiceData.cnpj)            missingFields.push('cnpj');
        if (!invoiceData.chave_acesso)    missingFields.push('chave_acesso');
        if (!invoiceData.valor_bruto)     missingFields.push('valor_bruto');
        if (!invoiceData.data_emissao)    missingFields.push('data_emissao');
        if (!invoiceData.tipo_despesa)    missingFields.push('tipo_despesa');
        if (!invoiceData.centro_de_custo) missingFields.push('centro_de_custo');

        // Mapeamento dos Labels (texto) para os Values (números) do ServiceNow
        const categoryMap: { [key: string]: string } = {
            'TI & Software': '1',
            'Hardware & Equipamentos': '2',
            'Facilities & Infraestrutura': '3',
            'Materiais de Escritório': '4',
            'Serviços Terceirizados': '5',
            'RH & Treinamentos': '6',
            'Viagens & Hospedagem': '7',
            'Alimentação': '8',
            'Marketing & Eventos': '9',
            'Logística & Frete': '10',
            'Outros': '11'
        };

        // Encontra o número correspondente à categoria, se não achar, cai em "Outros" (11)
        const categoryValue = categoryMap[invoiceData.tipo_despesa] || '11';

        const isAnyFieldBlank = missingFields.length > 0;
        const isCategoryOthers = categoryValue === '11'; // Se for "Outros" ou desconhecido
        const isLowConfidence = Number(invoiceData.confianca_leitura) < 80;

        // Se QUALQUER campo estiver faltando OU categoria for "Outros" → need_approval = true
        const needsApproval = isAnyFieldBlank || isCategoryOthers || invoiceData.necessidade_aprovacao;

        // Status: se precisa aprovação ou confiança baixa → Waiting for Approval
        let status = 'Waiting for Approval';
        if (!needsApproval && !isLowConfidence) {
            status = 'Approved';
        }

        if (isAnyFieldBlank) {
            console.log(`[ServiceNow] Campos faltantes detectados: [${missingFields.join(', ')}] → Marcando como Waiting for Approval`);
        }
        if (isCategoryOthers) {
            console.log(`[ServiceNow] Categoria "Outros" detectada → Marcando como Waiting for Approval`);
        }

        // Payload mapeando para as colunas da tabela u_invoices
        const payload = {
            u_number: invoiceData.numero_nota || '',
            u_vendor_name: invoiceData.fornecedor || '',
            u_cnpj: invoiceData.cnpj || '',
            u_access_key: invoiceData.chave_acesso || '',
            u_invoice_description: invoiceData.descricao_itens || '',
            u_gross_value: invoiceData.valor_bruto || '',
            u_net_value: invoiceData.valor_liquido || '',
            u_issue_date: invoiceData.data_emissao || '',
            u_expense_category: categoryValue, // Envia o número da categoria (Value) e não o Label
            u_cost_center: invoiceData.centro_de_custo || '',
            u_need_approval: needsApproval,
            u_ai_confidence: invoiceData.confianca_leitura ? invoiceData.confianca_leitura.toString() : '0',
            u_status: status
        };

        try {
            // 1. Cria o registro na tabela
            console.log(`[ServiceNow] Criando registro em ${url}...`);
            const response = await axios.post(url, payload, {
                auth: { username: this.username, password: this.password },
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const sysId = response.data?.result?.sys_id;
            const displayValue = response.data?.result?.u_vendor_name || sysId;
            console.log(`[ServiceNow] Registro criado: ${displayValue} (${sysId})`);

            if (!sysId) {
                return 'UNKNOWN_ID';
            }

            // 2. Anexa o arquivo original da nota fiscal ao registro
            await this.attachFile(sysId, fileName, fileBuffer, fileMimeType);

            return sysId;
        } catch (error: any) {
            console.error('[ServiceNow] Erro ao criar registro:');
            if (error.response) {
                console.error(error.response.status, error.response.data);
            } else {
                console.error(error.message);
            }
            throw new Error('Falha na integração com ServiceNow');
        }
    }

    /**
     * Anexa um arquivo a um registro existente na tabela u_invoices via Attachment API
     */
    private async attachFile(recordSysId: string, fileName: string, fileBuffer: Buffer, fileMimeType: string): Promise<void> {
        const encodedFileName = encodeURIComponent(fileName);
        const url = `${this.instanceUrl}/api/now/attachment/file?table_name=u_invoices&table_sys_id=${recordSysId}&file_name=${encodedFileName}`;

        try {
            console.log(`[ServiceNow] Anexando arquivo "${fileName}" ao registro ${recordSysId}...`);

            await axios.post(url, fileBuffer, {
                auth: { username: this.username, password: this.password },
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': fileMimeType
                },
                maxBodyLength: Infinity
            });

            console.log(`[ServiceNow] Arquivo "${fileName}" anexado com sucesso!`);
        } catch (error: any) {
            console.error(`[ServiceNow] Erro ao anexar arquivo "${fileName}":`);
            if (error.response) {
                console.error(error.response.status, error.response.data);
            } else {
                console.error(error.message);
            }
            // Não lança erro aqui — o registro já foi criado, o anexo é best-effort
            console.warn(`[ServiceNow] O registro foi criado, mas o anexo falhou.`);
        }
    }
}
