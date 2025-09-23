import { Logger } from '@nestjs/common';

const logger = new Logger('HeadlessUtil');

/**
 * Resolve valor de headless padrão do sistema.
 * Regras:
 * 1. Se WF_FORCE_VISIBLE = 'true' => retorna false (força janela aberta)
 * 2. Caso contrário lê WF_HEADLESS_DEFAULT (default 'true')
 * 3. Opcionalmente aceita override boolean explícito (parâmetro) se allowOverride = true
 */
export function resolveHeadless(options?: { override?: any; allowOverride?: boolean }): boolean {
    const forceVisible = (process.env.WF_FORCE_VISIBLE ?? 'false').toLowerCase() === 'true';
    if (forceVisible) return false;
    const base = (process.env.WF_HEADLESS_DEFAULT ?? 'true').toLowerCase() === 'true';
    if (options?.allowOverride) {
        if (typeof options.override === 'boolean') return options.override;
        if (typeof options.override === 'string') {
            const v = options.override.toLowerCase();
            if (v === 'true') return true;
            if (v === 'false') return false;
        }
    }
    return base;
}

/** Logging helper (chamar no bootstrap uma vez) */
export function logHeadlessConfigOnce(context: string = 'bootstrap') {
    if ((global as any).__HEADLESS_CONFIG_LOGGED) return;
    (global as any).__HEADLESS_CONFIG_LOGGED = true;
    logger.log(`[${context}] WF_HEADLESS_DEFAULT=${process.env.WF_HEADLESS_DEFAULT ?? '(undefined)'} | WF_FORCE_VISIBLE=${process.env.WF_FORCE_VISIBLE ?? '(undefined)'} | resolved=${resolveHeadless()}`);
}
