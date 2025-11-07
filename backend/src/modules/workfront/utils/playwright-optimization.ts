import { BrowserContext, chromium, Browser, LaunchOptions, Route } from 'playwright';

/**
 * Configurações padrão de otimização para contexts Playwright.
 */
export interface OptimizedContextOptions {
    /** Reaproveitar browser já existente (caso passado) */
    browser?: Browser;
    /** Se true, força headless */
    headless?: boolean;
    /** Caminho para storageState (login) */
    storageStatePath?: string;
    /** Viewport custom */
    viewport?: { width: number; height: number };
    /** Bloquear imagens/fonts/mídia (default true) */
    blockHeavy?: boolean;
    /** Headers extras (Save-Data etc) */
    extraHeaders?: Record<string, string>;
    /** Lista adicional de domínios para bloquear */
    extraBlockDomains?: string[];
    /** Endpoints para short-circuit (responder 204) */
    shortCircuitGlobs?: string[];
}

const DEFAULT_BLOCK_DOMAINS = [
    'google-analytics',
    'gtm.js',
    'doubleclick',
    'facebook.net',
    'hotjar',
    'optimizely'
];

const HEAVY_TYPES = new Set(['image', 'media', 'font']);

export async function ensureBrowser(headless: boolean = true, launchOpts: LaunchOptions = {}): Promise<Browser> {
    const args = headless ? [] : ['--start-maximized', '--disable-blink-features=AutomationControlled'];
    return chromium.launch({ 
        headless, 
        args,
        ...launchOpts 
    });
}

export async function createOptimizedContext(opts: OptimizedContextOptions = {}): Promise<{ browser: Browser; context: BrowserContext }> {
    const {
        browser: passedBrowser,
        headless = true,
        storageStatePath,
        viewport = { width: 1280, height: 800 },
        blockHeavy = true,
        extraHeaders = { 'Save-Data': 'on' },
        extraBlockDomains = [],
        shortCircuitGlobs = []
    } = opts;

    const browser = passedBrowser || await ensureBrowser(headless);

    // Se não é headless, usa null para maximizar (ignora viewport configurado)
    const contextViewport = headless ? viewport : null;

    // Configurações do contexto (deviceScaleFactor só pode ser usado com viewport definido)
    const contextOptions: any = {
        storageState: storageStatePath,
        viewport: contextViewport,
        reducedMotion: blockHeavy ? 'reduce' : 'no-preference',
        serviceWorkers: blockHeavy ? 'block' : 'allow',
        extraHTTPHeaders: extraHeaders,
        // User Agent realista para evitar detecção de headless
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Permissões para evitar erros
        permissions: ['geolocation', 'notifications'],
        // Timezone consistente
        timezoneId: 'America/Sao_Paulo',
        // Locale consistente
        locale: 'pt-BR',
    };

    // Só adiciona deviceScaleFactor se viewport não for null
    if (contextViewport !== null) {
        contextOptions.deviceScaleFactor = 1;
    }

    const context = await browser.newContext(contextOptions);
    
    // Adiciona scripts anti-detecção de headless/automation
    await context.addInitScript(() => {
        // Remove propriedades que indicam automação
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
        
        // Mascara headless
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        Object.defineProperty(navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
        });
        
        // Chrome runtime
        (window as any).chrome = {
            runtime: {},
        };
    });

    // Aplicar roteamento apenas se há configurações de bloqueio
    if (blockHeavy || extraBlockDomains.length > 0 || shortCircuitGlobs.length > 0) {
        await context.route('**/*', async (route: Route) => {
            try {
                const req = route.request();
                const url = req.url();
                const type = req.resourceType();

                // Short circuit endpoints pesados configurados
                if (shortCircuitGlobs.length > 0 && shortCircuitGlobs.some(g => matchGlob(url, g))) {
                    return route.fulfill({ status: 204, body: '' });
                }

                if (blockHeavy && HEAVY_TYPES.has(type)) {
                    return route.abort();
                }
                
                const blockDomains = [...DEFAULT_BLOCK_DOMAINS, ...extraBlockDomains];
                if (blockDomains.length > 0 && blockDomains.some(d => url.includes(d))) {
                    return route.abort();
                }
                
                return route.continue();
            } catch {
                return route.continue();
            }
        });
    }

    return { browser, context };
}

function matchGlob(url: string, glob: string): boolean {
    // Simples: converte * em .* e escapa pontos
    const regex = new RegExp('^' + glob.split('*').map(escapeRegex).join('.*') + '$');
    return regex.test(url);
}

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Fecha browser caso não tenha sido passado externamente */
export async function disposeBrowser(passedBrowser: Browser | undefined, browser: Browser) {
    if (!passedBrowser) {
        try { await browser.close(); } catch { }
    }
}
