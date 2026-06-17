'use client';

import { useState } from 'react';
import styles from './page.module.css';
import UploadForm from '../components/UploadForm';
import ResultsDisplay from '../components/ResultsDisplay';

export default function Home() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    setResults(null);

    const apiKey = formData.get('x-api-key') as string;
    formData.delete('x-api-key');

    try {
      const response = await fetch('https://assets-e-ai-ps.onrender.com/api/invoices/upload', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = 'Failed to upload files';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h1 className={styles.title}>Invoice AI</h1>
        </div>
        <p className={styles.subtitle}>Extração inteligente de notas fiscais com IA</p>
      </div>

      <div className={styles.content}>
        <UploadForm onUpload={handleUpload} loading={loading} />
        
        {error && (
          <div className={styles.errorAlert}>
            <svg className={styles.errorIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        {(results || loading) && (
          <ResultsDisplay results={results} loading={loading} />
        )}
      </div>
    </main>
  );
}
