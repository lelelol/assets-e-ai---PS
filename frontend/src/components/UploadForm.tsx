import { useState, useRef } from 'react';
import styles from './UploadForm.module.css';

interface UploadFormProps {
  onUpload: (formData: FormData) => void;
  loading: boolean;
}

export default function UploadForm({ onUpload, loading }: UploadFormProps) {
  const [syncSnow, setSyncSnow] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (files.length === 0) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    // Convert boolean to string for the API
    formData.set('sync_snow', syncSnow.toString());
    
    // Ensure files are explicitly added from state (useful if drag-and-dropped)
    formData.delete('hidden-files');
    formData.delete('files');
    files.forEach(file => {
      formData.append('files', file);
    });

    onUpload(formData);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add(styles.dragOver);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove(styles.dragOver);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove(styles.dragOver);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files!)]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (e: React.MouseEvent, indexToRemove: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFiles(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="x-api-key">API Key</label>
        <input 
          type="password" 
          id="x-api-key" 
          name="x-api-key" 
          className={styles.input} 
          placeholder="Enter your API Key"
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Upload Invoices (PDF/Images)</label>
        <div 
          className={styles.uploadArea}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            name="hidden-files" 
            multiple 
            className={styles.hiddenInput} 
            onChange={handleFileChange}
            onClick={(e) => e.stopPropagation()}
            ref={fileInputRef}
          />
          <div className={styles.uploadIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <p className={styles.uploadText}>
            <span className={styles.uploadHighlight}>Click to browse</span> or drag and drop files here
          </p>
          {files.length > 0 && (
            <div className={styles.fileList}>
              {files.map((f, i) => (
                <div key={i} className={styles.fileChip} onClick={(e) => e.stopPropagation()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                  <span className={styles.fileNameText}>{f.name}</span>
                  <button type="button" className={styles.removeFileBtn} onClick={(e) => removeFile(e, i)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.toggleGroup} onClick={() => setSyncSnow(!syncSnow)}>
        <div className={`${styles.toggle} ${syncSnow ? styles.toggleActive : ''}`}>
          <div className={styles.toggleHandle}></div>
        </div>
        <span className={styles.label} style={{ marginBottom: 0, cursor: 'pointer' }}>
          Sync with ServiceNow
        </span>
      </div>

      {syncSnow && (
        <div className={styles.snowConfig}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="snow_instance">Instance Name</label>
            <input type="text" id="snow_instance" name="snow_instance" className={styles.input} placeholder="dev12345" required={syncSnow} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="snow_user">Username</label>
            <input type="text" id="snow_user" name="snow_user" className={styles.input} placeholder="admin" required={syncSnow} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.label} htmlFor="snow_pass">Password</label>
            <input type="password" id="snow_pass" name="snow_pass" className={styles.input} required={syncSnow} />
          </div>
        </div>
      )}

      <button type="submit" className={styles.button} disabled={loading || files.length === 0}>
        {loading ? 'Processing...' : 'Extract Data'}
      </button>
    </form>
  );
}
