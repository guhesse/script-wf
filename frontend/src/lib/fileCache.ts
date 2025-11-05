/**
 * Utilitário para salvar File objects no IndexedDB
 * localStorage não suporta File objects, então usamos IndexedDB
 */

const DB_NAME = 'WorkfrontFileCache';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface CachedFile {
  id: string;
  file: File;
  timestamp: number;
}

class FileCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async saveFiles(assetZip: File | null, finalMaterials: File[]): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('IndexedDB não inicializado');

    // Limpar arquivos antigos primeiro (fora da transação principal)
    await this.clearFiles();

    // Criar uma nova transação para salvar
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const timestamp = Date.now();
    const operations: Promise<void>[] = [];

    // Salvar asset zip
    if (assetZip) {
      operations.push(
        new Promise<void>((resolve, reject) => {
          const request = store.put({ id: 'assetZip', file: assetZip, timestamp });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      );
    }

    // Salvar final materials
    for (let i = 0; i < finalMaterials.length; i++) {
      operations.push(
        new Promise<void>((resolve, reject) => {
          const request = store.put({ id: `final_${i}`, file: finalMaterials[i], timestamp });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      );
    }

    // Aguardar todas as operações em paralelo
    await Promise.all(operations);

    console.log('✅ Arquivos salvos no IndexedDB:', {
      assetZip: assetZip?.name,
      finalMaterials: finalMaterials.map(f => f.name)
    });
  }

  async loadFiles(): Promise<{ assetZip: File | null; finalMaterials: File[] }> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('IndexedDB não inicializado');

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // Carregar asset zip
    const assetZip = await new Promise<File | null>((resolve) => {
      const request = store.get('assetZip');
      request.onsuccess = () => {
        const result = request.result as CachedFile | undefined;
        if (result) {
          // Verificar se não está expirado (>24h)
          const isExpired = Date.now() - result.timestamp > 24 * 60 * 60 * 1000;
          if (!isExpired) {
            resolve(result.file);
            return;
          }
        }
        resolve(null);
      };
      request.onerror = () => resolve(null);
    });

    // Carregar final materials
    const finalMaterials: File[] = [];
    for (let i = 0; i < 100; i++) { // Máximo de 100 arquivos
      const file = await new Promise<File | null>((resolve) => {
        const request = store.get(`final_${i}`);
        request.onsuccess = () => {
          const result = request.result as CachedFile | undefined;
          if (result) {
            const isExpired = Date.now() - result.timestamp > 24 * 60 * 60 * 1000;
            if (!isExpired) {
              resolve(result.file);
              return;
            }
          }
          resolve(null);
        };
        request.onerror = () => resolve(null);
      });

      if (file) {
        finalMaterials.push(file);
      } else {
        break; // Não há mais arquivos
      }
    }

    console.log('✅ Arquivos carregados do IndexedDB:', {
      assetZip: assetZip?.name,
      finalMaterials: finalMaterials.map(f => f.name)
    });

    return { assetZip, finalMaterials };
  }

  async clearFiles(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('IndexedDB não inicializado');

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log('🗑️ Cache de arquivos limpo (IndexedDB)');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async hasFiles(): Promise<boolean> {
    if (!this.db) await this.init();
    if (!this.db) return false;

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => resolve(false);
    });
  }
}

export const fileCache = new FileCache();
