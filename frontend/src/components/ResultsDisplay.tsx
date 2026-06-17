'use client';

import { useState } from 'react';
import styles from './ResultsDisplay.module.css';

interface InvoiceData {
  fornecedor?: string;
  cnpj?: string;
  chave_acesso?: string;
  numero_nota?: string;
  descricao_itens?: string;
  valor_bruto?: number | string;
  valor_liquido?: number | string;
  data_emissao?: string;
  tipo_despesa?: string;
  centro_de_custo?: string;
  necessidade_aprovacao?: boolean;
  confianca_leitura?: number | string;
}

interface ResultItem {
  file_name: string;
  status: 'concluido' | 'erro';
  extracted_data?: InvoiceData | InvoiceData[];
  error?: string;
}

interface ResultsDisplayProps {
  results: ResultItem[] | null;
  loading: boolean;
}

function formatCurrency(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCNPJ(cnpj: string | undefined): string {
  if (!cnpj) return '—';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatDate(date: string | undefined): string {
  if (!date) return '—';
  const parts = date.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return date;
}

function getConfidenceLevel(conf: number | string | undefined): { label: string; className: string } {
  if (conf === undefined || conf === null) return { label: '—', className: '' };
  const num = typeof conf === 'string' ? parseInt(conf) : conf;
  if (num >= 80) return { label: `${num}%`, className: styles.confHigh };
  if (num >= 50) return { label: `${num}%`, className: styles.confMedium };
  return { label: `${num}%`, className: styles.confLow };
}

function InvoiceCard({ invoice, index }: { invoice: InvoiceData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const conf = getConfidenceLevel(invoice.confianca_leitura);

  return (
    <div className={styles.invoiceCard} style={{ animationDelay: `${index * 0.08}s` }}>
      {/* Header row */}
      <div className={styles.invoiceHeader}>
        <div className={styles.invoiceHeaderLeft}>
          <span className={styles.invoiceVendor}>
            {invoice.fornecedor || 'Fornecedor não identificado'}
          </span>
          {invoice.numero_nota && (
            <span className={styles.invoiceNumber}>NF #{invoice.numero_nota}</span>
          )}
        </div>
        <div className={styles.invoiceHeaderRight}>
          {invoice.tipo_despesa && (
            <span className={styles.categoryTag}>{invoice.tipo_despesa}</span>
          )}
        </div>
      </div>

      {/* Main metrics row */}
      <div className={styles.metricsRow}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Valor Bruto</span>
          <span className={styles.metricValue}>{formatCurrency(invoice.valor_bruto)}</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Valor Líquido</span>
          <span className={styles.metricValue}>{formatCurrency(invoice.valor_liquido)}</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Emissão</span>
          <span className={styles.metricValue}>{formatDate(invoice.data_emissao)}</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Confiança</span>
          <span className={`${styles.metricValue} ${conf.className}`}>{conf.label}</span>
        </div>
      </div>

      {/* Description */}
      {invoice.descricao_itens && (
        <div className={styles.descriptionRow}>
          <span className={styles.descriptionLabel}>Itens</span>
          <p className={styles.descriptionText}>{invoice.descricao_itens}</p>
        </div>
      )}

      {/* Expand details */}
      <button
        className={styles.expandBtn}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <svg
          className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
      </button>

      {expanded && (
        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>CNPJ</span>
            <span className={styles.detailValue}>{formatCNPJ(invoice.cnpj)}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Centro de Custo</span>
            <span className={styles.detailValue}>{invoice.centro_de_custo || '—'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Aprovação Necessária</span>
            <span className={`${styles.detailValue} ${invoice.necessidade_aprovacao ? styles.approvalYes : styles.approvalNo}`}>
              {invoice.necessidade_aprovacao ? 'Sim' : 'Não'}
            </span>
          </div>
          {invoice.chave_acesso && (
            <div className={`${styles.detailItem} ${styles.detailFull}`}>
              <span className={styles.detailLabel}>Chave de Acesso</span>
              <span className={styles.detailValueMono}>{invoice.chave_acesso}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsDisplay({ results, loading }: ResultsDisplayProps) {
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loader}>
          <div className={styles.spinnerWrapper}>
            <div className={styles.spinner} />
            <div className={styles.spinnerInner} />
          </div>
          <p className={styles.loadingTitle}>Analisando documentos...</p>
          <p className={styles.loadingSubtitle}>A IA está extraindo os dados das notas fiscais</p>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  const successCount = results.filter(r => r.status === 'concluido').length;
  const errorCount = results.filter(r => r.status === 'erro').length;

  return (
    <div className={styles.container}>
      {/* Results header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <h2 className={styles.headerTitle}>Resultados</h2>
        </div>
        <div className={styles.headerStats}>
          {successCount > 0 && (
            <span className={styles.statSuccess}>{successCount} concluído{successCount > 1 ? 's' : ''}</span>
          )}
          {errorCount > 0 && (
            <span className={styles.statError}>{errorCount} erro{errorCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* File results */}
      {results.map((item, index) => (
        <div key={index} className={styles.fileBlock}>
          {/* File header row */}
          <div className={styles.fileHeader}>
            <div className={styles.fileNameRow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span className={styles.fileName}>{item.file_name}</span>
            </div>
            <span className={`${styles.statusBadge} ${item.status === 'concluido' ? styles.statusSuccess : styles.statusError}`}>
              {item.status === 'concluido' ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Concluído
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Erro
                </>
              )}
            </span>
          </div>

          {/* Error display */}
          {item.error && (
            <div className={styles.fileError}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{item.error}</span>
            </div>
          )}

          {/* Invoice cards */}
          {item.extracted_data && (
            <div className={styles.invoicesContainer}>
              {(Array.isArray(item.extracted_data) ? item.extracted_data : [item.extracted_data]).map(
                (invoice, invoiceIdx) => (
                  <InvoiceCard key={invoiceIdx} invoice={invoice} index={invoiceIdx} />
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
