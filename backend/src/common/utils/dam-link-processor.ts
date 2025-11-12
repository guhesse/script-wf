/**
 * Utilitário para processar links do DAM Dell
 * Consolida a lógica de limpeza de URLs entre briefing.service e briefing-extraction.service
 */

/**
 * Processa link DAM removendo redirecionamentos de login
 * 
 * Links COMPLETOS (mantidos quando processLinks=false):
 * - https://dam.dell.com/content/dell-assetshare/login/assetshare/details.html/content/dam/file.psd
 * - https://dam.dell.com/content/dell-assetshare/login?asset=/content/dam/file.psd
 * 
 * Links PROCESSADOS (quando processLinks=true):
 * - https://dam.dell.com/content/dam/file.psd
 * 
 * @param url URL original do DAM
 * @returns URL processada extraindo apenas /content/dam/...
 */
export function processDAMLink(url: string): string {
    if (!url) return url;

    try {
        // REGRA: Só processar se tiver algum padrão de login/redirect
        // Se já for um link direto /content/dam/, NÃO mexer
        
        // Formato 1: /content/dell-assetshare/login?asset=/content/dam/...
        // REDUZIR PARA: https://dam.dell.com/content/dam/...
        if (url.includes('/content/dell-assetshare/login?asset=')) {
            const match = url.match(/\/content\/dell-assetshare\/login\?asset=(\/content\/dam\/.+)/);
            if (match && match[1]) {
                return 'https://dam.dell.com' + match[1];
            }
        }

        // Formato 2: /content/dell-assetshare/login/assetshare/details.html/content/dam/...
        // REDUZIR PARA: https://dam.dell.com/content/dam/...
        if (url.includes('/content/dell-assetshare/login/assetshare/details.html/')) {
            const match = url.match(/\/content\/dell-assetshare\/login\/assetshare\/details\.html(\/content\/dam\/.+)/);
            if (match && match[1]) {
                return 'https://dam.dell.com' + match[1];
            }
        }

        // Formato 3: Qualquer /details.html/ seguido de /content/dam/
        // REDUZIR PARA: https://dam.dell.com/content/dam/...
        if (url.includes('/details.html/') && url.includes('/content/dam/')) {
            const match = url.match(/\/details\.html(\/content\/dam\/.+)/);
            if (match && match[1]) {
                return 'https://dam.dell.com' + match[1];
            }
        }

        // NÃO processar links que já são diretos (sem login/redirect)
        // Se chegou aqui e tem /content/dam/ mas não tem padrões de redirect, manter original
        return url;
        
    } catch (error) {
        // Em caso de erro, retornar URL original
        return url;
    }
}

/**
 * Processa múltiplos links DAM de uma vez
 * @param urls Array de URLs para processar
 * @returns Array de URLs processadas
 */
export function processDAMLinks(urls: string[]): string[] {
    return urls.map(processDAMLink);
}
