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
    return chromium.launch({ headless, args: headless ? [] : ['--start-maximized'], ...launchOpts });
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

    const context = await browser.newContext({
        storageState: storageStatePath,
        viewport,
        deviceScaleFactor: 1,
        // Configurações condicionais baseadas em blockHeavy
        reducedMotion: blockHeavy ? 'reduce' : 'no-preference',
        serviceWorkers: blockHeavy ? 'block' : 'allow',
        extraHTTPHeaders: extraHeaders
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
