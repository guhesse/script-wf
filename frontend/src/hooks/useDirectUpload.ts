import { useState, useCallback } from 'react';
import { useAppAuth } from '@/hooks/useAppAuth';

// Limite para considerar arquivo "grande" (30MB)
const LARGE_FILE_THRESHOLD = 30 * 1024 * 1024;

interface UploadProgress {
    fileName: string;
    progress: number;
    status: 'preparing' | 'uploading' | 'completed' | 'error';
    error?: string;
}

interface DirectUploadResult {
    success: boolean;
    uploadId: string;
    fileName: string;
    cdnUrl: string;
    storagePath: string;
}

export const useDirectUpload = () => {
    const { token } = useAppAuth();
    const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});

    // Verificar se arquivo deve usar upload direto
    const shouldUseDirectUpload = useCallback((file: File): boolean => {
        return file.size > LARGE_FILE_THRESHOLD;
    }, []);

    // Upload direto para o Bunny CDN
    const uploadFileDirect = useCallback(async (file: File): Promise<DirectUploadResult> => {
        const fileId = `${file.name}-${file.size}`;

        try {
            // Atualizar progresso - preparando
            setUploadProgress(prev => ({
                ...prev,
                [fileId]: {
                    fileName: file.name,
                    progress: 0,
                    status: 'preparing'
                }
            }));

            // Gerar URL de upload direto via nova API
            const prepareResponse = await fetch('/api/upload/prepare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assetZip: { name: file.name, size: file.size, type: file.type },
                    finalMaterials: [],
                    projectUrl: 'temp-upload',
                    selectedUser: 'carol'
                })
            });

            if (!prepareResponse.ok) {
                throw new Error(`Erro ao preparar upload: ${prepareResponse.statusText}`);
            }

            const responseData = await prepareResponse.json();
            const firstUpload = responseData.uploads[0]; // Pegar o primeiro arquivo
            const { uploadId, uploadUrl, headers, cdnUrl, storagePath } = firstUpload;

            // Atualizar progresso - iniciando upload
            setUploadProgress(prev => ({
                ...prev,
                [fileId]: {
                    ...prev[fileId],
                    progress: 5,
                    status: 'uploading'
                }
            }));

            // Upload direto para o Bunny CDN
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    ...headers,
                    'Content-Type': file.type || 'application/octet-stream'
                },
                body: file
            });

            if (!uploadResponse.ok) {
                throw new Error(`Erro no upload: ${uploadResponse.statusText}`);
            }

            // Marcar como utilizado
            await fetch(`/api/upload/mark-used/${uploadId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            // Atualizar progresso - concluído
            setUploadProgress(prev => ({
                ...prev,
                [fileId]: {
                    ...prev[fileId],
                    progress: 100,
                    status: 'completed'
                }
            }));

            return {
                success: true,
                uploadId,
                fileName: file.name,
                cdnUrl,
                storagePath
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

            // Atualizar progresso - erro
            setUploadProgress(prev => ({
                ...prev,
                [fileId]: {
                    ...prev[fileId],
                    progress: 0,
                    status: 'error',
                    error: errorMessage
                }
            }));

            throw error;
        }
    }, [token]);

    // Upload múltiplos arquivos
    const uploadMultipleFiles = useCallback(async (files: File[]): Promise<DirectUploadResult[]> => {
        const results: DirectUploadResult[] = [];

        // Dividir arquivos grandes e pequenos
        const largeFiles = files.filter(shouldUseDirectUpload);
        const smallFiles = files.filter(f => !shouldUseDirectUpload(f));

        // Upload arquivos grandes diretamente
        for (const file of largeFiles) {
            try {
                const result = await uploadFileDirect(file);
                results.push(result);
            } catch (error) {
                console.error(`Erro no upload de ${file.name}:`, error);
                // Continuar com outros arquivos mesmo se um falhar
            }
        }

        // Upload arquivos pequenos via servidor (método tradicional)
        if (smallFiles.length > 0) {
            // TODO: Implementar upload tradicional para arquivos pequenos
            console.log(`${smallFiles.length} arquivos pequenos serão enviados via servidor`);
        }

        return results;
    }, [shouldUseDirectUpload, uploadFileDirect]);

    // Limpar progresso
    const clearProgress = useCallback(() => {
        setUploadProgress({});
    }, []);

    // Remover progresso de um arquivo específico
    const removeFileProgress = useCallback((fileName: string, fileSize: number) => {
        const fileId = `${fileName}-${fileSize}`;
        setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
        });
    }, []);

    return {
        // Estados
        uploadProgress,

        // Funções
        shouldUseDirectUpload,
        uploadFileDirect,
        uploadMultipleFiles,
        clearProgress,
        removeFileProgress,

        // Utilitários
        isLargeFile: shouldUseDirectUpload,
        largeFileThreshold: LARGE_FILE_THRESHOLD
    };
};