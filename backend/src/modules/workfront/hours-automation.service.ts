import { Injectable, Logger } from '@nestjs/common';
import { createOptimizedContext, disposeBrowser } from './utils/playwright-optimization';
import { WorkfrontDomHelper } from './utils/workfront-dom.helper';
import { resolveHeadless } from './utils/headless.util';

@Injectable()
export class HoursAutomationService {
  private readonly logger = new Logger(HoursAutomationService.name);
  // Valor fixo de horas lançadas por tarefa. Se quiser tornar configurável, mover para variáveis de ambiente.
  static readonly FORCED_HOURS_PER_TASK = 0.4;
  // Métodos utilitários agora centralizados em WorkfrontDomHelper

  // NOVO: formata horas (usa vírgula como solicitado)
  private formatHoursValue(hours: number) {
    // 1 casa decimal, troca ponto por vírgula
    return hours.toFixed(1).replace('.', ',');
  }

  // NOVO helper: expande hierarquias colapsadas (setinhas)
  private async expandCollapsedHierarchy(frame: any, page: any) {
    try {
      const arrows = frame.locator('[data-testid="hierarchy-arrow"][data-collapsed="true"], [data-test-id="hierarchy-arrow"][data-collapsed="true"]');
      const count = await arrows.count();
      if (count === 0) return;
      this.logger.log(`🧩 Expandindo ${count} hierarquia(s) colapsada(s)`);
      for (let i = 0; i < count; i++) {
        try {
          await arrows.nth(i).click({ timeout: 1200 }).catch(() => { });
          await page.waitForTimeout(300);
        } catch { }
      }
    } catch { }
  }

  // NOVO: descobre container scrollável (cache por execução)
  private async findScrollableContainer(frame: any): Promise<string | null> {
    const candidates = [
      'div.ReactVirtualized__Grid',
      'div[role="rowgroup"]',
      'div.list-body',
      'div.list-body-container',
      'div[class*="virtual"]',
      'div[style*="overflow"]',
      '[data-testid="layout-content-area"] div[style*="overflow"]'
    ];
    for (const sel of candidates) {
      try {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        const isScrollable = await loc.evaluate((el: any) => {
          const style = window.getComputedStyle(el);
          const canScroll = el.scrollHeight > el.clientHeight + 40;
          const overflowY = style.overflowY;
          return canScroll && ['auto', 'scroll'].includes(overflowY);
        });
        if (isScrollable) {
          this.logger.log(`🧾 Container de scroll detectado: ${sel}`);
          return sel;
        }
      } catch { }
    }
    this.logger.warn('⚠️ Nenhum container de scroll específico detectado (fallback para body/page.wheel)');
    return null;
  }

  // NOVO helper: loop de scroll + busca
  private async scrollFindLoop(frame: any, page: any, taskName: string): Promise<boolean> {
    const baseSelector = 'a.css-15ykr7s';
    const normalize = (s: string) => s.trim().toLowerCase();
    const sanitize = (s: string) => normalize(s.replace(/^\d+\.\s*/, '')); // remove "13. "
    const target = sanitize(taskName);
    let scrollSel = await this.findScrollableContainer(frame);
    let lastScrollTop = -1;
    let stagnation = 0;

    for (let attempt = 1; attempt <= 30; attempt++) {
      // Captura mapa das âncoras atuais
      let foundHref: string | null = null;
      try {
        const scan = await frame.locator(baseSelector).evaluateAll(
          (nodes, tgt) => {
            const norm = (s: string) => s.trim().toLowerCase();
            const san = (s: string) => norm(s.replace(/^\d+\.\s*/, ''));
            const list = nodes.map(n => {
              const txt = (n.textContent || '').trim();
              return {
                raw: txt,
                sanitized: san(txt),
                href: (n as HTMLAnchorElement).getAttribute('href') || ''
              };
            });
            const exact = list.find(l => l.sanitized === tgt);
            const partial = exact || list.find(l => l.sanitized.includes(tgt));
            return { list, match: partial || null };
          },
          target
        );
        if (scan.match) {
          foundHref = scan.match.href;
          this.logger.log(`🔗 Match encontrado (tentativa ${attempt}) raw="${scan.match.raw}" sanitized="${scan.match.sanitized}" href=${scan.match.href}`);
        } else {
          this.logger.log(`📑 Tentativa ${attempt}: ${scan.list.length} anchors visíveis (nenhum match ainda)`);
        }
      } catch {
        this.logger.warn(`⚠️ Falha ao avaliar anchors (tentativa ${attempt})`);
      }

      if (foundHref) {
        try {
          await frame.locator(`${baseSelector}[href="${foundHref}"]`).first().click({ timeout: 4000 }).catch(() => { });
          await page.waitForTimeout(3000);
          return true;
        } catch {
          this.logger.warn('⚠️ Falha ao clicar no href encontrado, tentando click por texto');
          try {
            await frame.locator(`${baseSelector}:has-text("${taskName}")`).first().click({ timeout: 4000 }).catch(() => { });
            await page.waitForTimeout(3000);
            return true;
          } catch { }
        }
      }

      // Expandir hierarquias se existirem
      await this.expandCollapsedHierarchy(frame, page);

      // Realiza scroll
      let newTop = 0;
      if (scrollSel) {
        try {
          newTop = await frame.locator(scrollSel).evaluate((el: any) => {
            const before = el.scrollTop;
            el.scrollBy(0, el.clientHeight * 0.85);
            return el.scrollTop;
          });
        } catch {
          this.logger.warn('⚠️ Falha ao rolar container detectado, removendo e usando fallback');
          scrollSel = null;
        }
      }
      if (!scrollSel) {
        // fallback: body ou wheel
        try {
          await frame.locator('body').evaluate(() => {
            const el = document.scrollingElement || document.documentElement || document.body;
            el.scrollBy(0, window.innerHeight * 0.85);
            return el.scrollTop;
          });
        } catch {
          // Movimenta com wheel na página (iframe)
          try { await page.mouse.wheel(0, 600); } catch { }
        }
      }

      // Detecta estagnação
      if (newTop === lastScrollTop) stagnation++; else stagnation = 0;
      lastScrollTop = newTop;
      this.logger.log(`↕️ Scroll tentativa ${attempt}: top=${newTop} stagnation=${stagnation}`);

      if (stagnation >= 3) {
        this.logger.log('⛔ Sem progresso de scroll sucessivas vezes (encerrando)');
        break;
      }

      await page.waitForTimeout(800);
    }
    return false;
  }

  // SUBSTITUÍDO: openTaskDetail usando scrollFindLoop + variações
  private async openTaskDetail(frame: any, page: any, taskName: string) {
    this.logger.log(`🔎 Buscando tarefa: ${taskName}`);
    // Tentativa rápida (exato ou com prefixo numérico)
    const quickSelectors = [
      `a.css-15ykr7s:has-text("${taskName}")`,
      `a.css-15ykr7s:has-text(" ${taskName}")`,
      `a.css-15ykr7s:has-text(". ${taskName}")`
    ];
    for (const sel of quickSelectors) {
      try {
        const cand = frame.locator(sel).first();
        if ((await cand.count()) > 0 && await cand.isVisible()) {
          this.logger.log(`⚡ Tarefa localizada sem scroll (${sel})`);
          await cand.click({ timeout: 4000 }).catch(() => { });
          await page.waitForTimeout(2500);
          return true;
        }
      } catch { }
    }
    // Busca com scroll
    const ok = await this.scrollFindLoop(frame, page, taskName);
    if (!ok) this.logger.warn(`⚠️ Não foi possível localizar "${taskName}" após varredura completa`);
    return ok;
  }

  // NOVO: clica botão "Log Time" dentro da tarefa
  private async clickLogTimeButton(frame: any, page: any) {
    this.logger.log('🕒 Procurando botão "Log Time"...');
    const selectors = [
      'button:has-text("Log Time")',
      'button span:has-text("Log Time")',
      'button[data-testid*="log-time"]'
    ];
    for (const sel of selectors) {
      try {
        const btn = frame.locator(sel).first();
        if ((await btn.count()) > 0 && await btn.isVisible()) {
          await btn.click({ timeout: 4000 }).catch(() => { });
          await page.waitForTimeout(1500);
          return true;
        }
      } catch { }
    }
    this.logger.warn('⚠️ Botão "Log Time" não encontrado');
    return false;
  }

  // NOVO: preenche popup de Log Time (dia atual) e envia
  private async fillAndSubmitLogTime(frame: any, page: any, hoursValue: string) {
    this.logger.log(`✍️ Inserindo horas no popup: ${hoursValue}`);
    // Input do dia de hoje: possui data-data-type="day-input" e data-is-today="true"
    let input = frame.locator('input[data-data-type="day-input"][data-is-today="true"]').first();
    if ((await input.count()) === 0) {
      input = frame.locator('input[data-data-type="day-input"]').first();
    }
    if ((await input.count()) === 0) {
      this.logger.warn('⚠️ Input de horas (popup) não localizado');
      return false;
    }
    try {
      await input.click({ force: true }).catch(() => { });
      await page.waitForTimeout(200);
      await input.fill(''); // limpa
      await page.waitForTimeout(80);
      // tentativa direta
      await input.type(hoursValue, { delay: 80 }).catch(async () => {
        await page.keyboard.insertText(hoursValue);
      });
      await page.waitForTimeout(300);
    } catch (e: any) {
      this.logger.warn('⚠️ Falha ao digitar horas: ' + e?.message);
      return false;
    }

    // Botão submit
    this.logger.log('💾 Submetendo horas (Log time)');
    const submitSelectors = [
      'button[data-testid="log-time-submit"]',
      'button:has-text("Log time")',
      'button:has-text("Log Time")'
    ];
    for (const sel of submitSelectors) {
      try {
        const b = frame.locator(sel).first();
        if ((await b.count()) > 0 && await b.isVisible()) {
          await b.click({ timeout: 4000 }).catch(() => { });
          await page.waitForTimeout(2500);
          return true;
        }
      } catch { }
    }
    this.logger.warn('⚠️ Botão de submit do popup não encontrado');
    return false;
  }

  // NOVO: volta para lista de tasks (/tasks)
  private async returnToTasks(page: any, baseTasksUrl: string) {
    this.logger.log('↩️ Retornando para a lista de tarefas');
    // Tenta back primeiro
    try {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => { });
      await page.waitForTimeout(1500);
    } catch { }
    // Garante URL correta
    if (!/\/tasks(\?|$)/.test(page.url())) {
      try {
        await page.goto(baseTasksUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
      } catch { }
    }
  }

  // NOVO: fluxo completo para uma tarefa
  private async processTaskHours(page: any, frame: any, tasksUrl: string, taskName: string, hours: number, note?: string) {
    this.logger.log(`🧩 Iniciando lançamento para tarefa "${taskName}"`);
    if (!await this.openTaskDetail(frame, page, taskName)) {
      return { task: taskName, success: false, message: 'Não abriu detalhe da tarefa' };
    }
    if (!await this.clickLogTimeButton(frame, page)) {
      return { task: taskName, success: false, message: 'Botão Log Time não disponível' };
    }
    const hoursValue = this.formatHoursValue(hours);
    const filled = await this.fillAndSubmitLogTime(frame, page, hoursValue);
    if (!filled) {
      return { task: taskName, success: false, message: 'Falha ao preencher/enviar horas' };
    }

    // (Opcional) Nota – interface atual não foi detalhada para nota; placeholder para futura implementação
    if (note) {
      this.logger.log('🛈 Nota informada (não implementado no popup atual)');
    }

    this.logger.log(`✅ Horas registradas na tarefa "${taskName}"`);
    await this.returnToTasks(page, tasksUrl);
    return { task: taskName, success: true, message: 'Horas lançadas' };
  }

  // NOVO: utilitário de mapa completo da página de tasks
  async mapTasksPage(params: { projectUrl: string; headless?: boolean }): Promise<{ success: boolean; message: string; data?: any }> {
  const { projectUrl, headless = resolveHeadless() } = params;
  const tasksUrl = WorkfrontDomHelper.ensureTasksUrl(projectUrl);
    this.logger.log(`🗺️ Iniciando mapeamento da página: ${tasksUrl}`);
  const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await WorkfrontDomHelper.ensureStateFile() });
    try {
      const page = await context.newPage();
      await page.goto(tasksUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(7000);
  const frame = WorkfrontDomHelper.frameLocator(page);
  await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);

      const data = await this.collectPageMap(frame);
      this.logger.log('📌 Resumo do mapa:');
      this.logger.log(JSON.stringify({
        anchorCount: data.anchors.length,
        taskAnchors: data.taskAnchors.map((a: any) => a.text),
        logTimeButtons: data.logTimeButtons.map((b: any) => b.text),
        gridRows: data.gridRows.length
      }, null, 2));

      return { success: true, message: 'Mapeamento concluído', data };
    } catch (e: any) {
      this.logger.error('❌ Falha ao mapear: ' + e?.message);
      return { success: false, message: e?.message || 'Erro ao mapear página' };
    } finally { try { await disposeBrowser(undefined, browser); } catch { } }
  }

  // NOVO: coleta estruturada
  private async collectPageMap(frame: any) {
    // Anchors genéricos
    const anchors = await frame.locator('a').evaluateAll(nodes =>
      nodes.map(n => ({
        text: (n.textContent || '').trim(),
        href: (n as HTMLAnchorElement).getAttribute('href'),
        class: n.getAttribute('class') || ''
      })).filter(a => a.text)
    ).catch(() => []);

    // Apenas tarefas (.css-15ykr7s)
    const taskAnchors = anchors.filter((a: any) => a.class.includes('css-15ykr7s'));

    // Botões "Log Time"
    const logTimeButtons = await frame.locator('button:has-text("Log Time"), button:has-text("Log time")').evaluateAll(nodes =>
      nodes.map(n => ({
        text: (n.textContent || '').trim(),
        class: n.getAttribute('class') || '',
        ariaLabel: n.getAttribute('aria-label') || ''
      }))
    ).catch(() => []);

    // Linhas da grid (limitado a 50 para evitar excesso)
    const gridRows = await frame.locator('[role="row"]').evaluateAll(
      (nodes: Element[]) =>
        nodes.slice(0, 50).map((r, idx) => {
          const cells = Array
            .from((r as HTMLElement).querySelectorAll<HTMLElement>('[role="gridcell"], div, span'))
            .map(el => ((el as HTMLElement).textContent || '').trim())
            .filter(t => t)
            .slice(0, 15);
          return { index: idx, sampleTexts: cells };
        })
    ).catch(() => []);

    return { anchors, taskAnchors, logTimeButtons, gridRows };
  }

  // NOVO: helper simples (se precisar no futuro)
  private safeText(val: any) { return (val || '').toString().trim(); }

  // ALTERADO: logHours suporta debugMap
  async logHours(params: { projectUrl: string; hours: number; note?: string; taskName?: string; headless?: boolean; fast?: boolean; debugMap?: boolean }): Promise<{ success: boolean; message: string; loggedHours?: number; map?: any }> {
  const { projectUrl, note, taskName, headless = resolveHeadless(), fast = true, debugMap = false } = params;
    // Ignora params.hours e força 0.3
    const forcedHours = HoursAutomationService.FORCED_HOURS_PER_TASK;
  const tasksUrl = WorkfrontDomHelper.ensureTasksUrl(projectUrl);
    this.logger.log(`🚀 Iniciando fluxo de Log Time em: ${tasksUrl}`);
    this.logger.log(`ℹ️ Forçando lançamento de ${forcedHours}h por tarefa (valor recebido ignorado).`);

  const { browser, context } = await createOptimizedContext({ headless, storageStatePath: await WorkfrontDomHelper.ensureStateFile() });
    let page: any; let frame: any;
    try {
      page = await context.newPage();
      this.logger.log('🌐 Carregando página de tasks...');
      await page.goto(tasksUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
  frame = WorkfrontDomHelper.frameLocator(page);
  await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);

      let collectedMap: any | undefined;
      if (debugMap) {
        this.logger.log('🧪 debugMap=TRUE -> mapeando página antes de lançar horas');
        collectedMap = await this.collectPageMap(frame);
        this.logger.log('🗂️ Map preview: ' + JSON.stringify({
          taskAnchors: collectedMap.taskAnchors.map((a: any) => a.text),
          logTimeButtons: collectedMap.logTimeButtons.length
        }));
      }

      const tasksToProcess = taskName ? [taskName] : ['Asset Release', 'Final Materials'];

      const results: any[] = [];
      for (const t of tasksToProcess) {
        const r = await this.processTaskHours(page, frame, tasksUrl, t, forcedHours, note);
        results.push(r);
      }

      const successes = results.filter(r => r.success).length;
      const totalLogged = successes * forcedHours;
      const allOk = successes === results.length;
      this.logger.log(`📊 Resumo Log Time: ${successes}/${results.length} tarefas sucesso | Total horas: ${totalLogged}`);

      return {
        success: allOk,
        message: allOk ? `Horas (0.3) lançadas em todas as tarefas` : 'Concluído com falhas em algumas tarefas',
        loggedHours: totalLogged,
        map: debugMap ? collectedMap : undefined
      };
    } catch (e: any) {
      this.logger.error(`❌ Erro geral no fluxo de horas: ${e?.message}`);
      return { success: false, message: e?.message || 'Falha no fluxo de horas' };
    } finally {
      try { await disposeBrowser(undefined, browser); } catch { }
    }
  }

  // NOVO: mesma lógica de logHours porém reutilizando página/iframe já abertos (não abre/fecha browser)
  async logHoursInOpenSession(params: { page: any; frame: any; projectUrl: string; hours: number; note?: string; taskName?: string; debugMap?: boolean; maxAttempts?: number; retryDelay?: number }): Promise<{ success: boolean; message: string; loggedHours?: number; map?: any }> {
    const { page, frame, projectUrl, note, taskName, debugMap = false, maxAttempts = 3, retryDelay = 2500 } = params;
    const forcedHours = HoursAutomationService.FORCED_HOURS_PER_TASK;
  const tasksUrl = WorkfrontDomHelper.ensureTasksUrl(projectUrl);
    try {
      // Navega para /tasks se necessário
      if (!/\/tasks(\?|$)/.test(page.url())) {
        this.logger.log('🌐 Navegando para página de tasks dentro da sessão existente...');
        await page.goto(tasksUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
      }
  await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);

      let collectedMap: any | undefined;
      if (debugMap) {
        this.logger.log('🧪 (sessão) debugMap=TRUE -> mapeando página antes de lançar horas');
        collectedMap = await this.collectPageMap(frame);
      }

      const tasksToProcess = taskName ? [taskName] : ['Asset Release', 'Final Materials'];
      const results: any[] = [];
      for (const t of tasksToProcess) {
        let attempt = 0;
        let ok = false;
        let lastMsg = '';
        while (attempt < maxAttempts && !ok) {
          attempt++;
          this.logger.log(`⏳ Tentativa de log de horas para "${t}" (tentativa ${attempt}/${maxAttempts})`);
          // Clique no accordion como "comprovação" de tentativa
          try {
            const accordion = frame.locator('[data-testid*="accordion"], .accordion, .MuiAccordion-root').first();
            if ((await accordion.count()) > 0) {
              await accordion.click({ timeout: 2000 }).catch(() => { });
              this.logger.log('🪗 Clique no accordion realizado para forçar renderização.');
            }
          } catch { }
          const r = await this.processTaskHours(page, frame, tasksUrl, t, forcedHours, note);
          ok = r.success;
          lastMsg = r.message;
          if (!ok && attempt < maxAttempts) {
            this.logger.warn(`⚠️ Falha ao lançar horas para "${t}" (tentativa ${attempt}): ${lastMsg}. Recarregando página e tentando novamente em ${retryDelay}ms...`);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(retryDelay);
            await WorkfrontDomHelper.closeSidebarIfOpen(frame, page);
          }
        }
        results.push({ task: t, success: ok, message: lastMsg });
      }
      const successes = results.filter(r => r.success).length;
      const totalLogged = successes * forcedHours;
      const allOk = successes === results.length;
      this.logger.log(`📊 (sessão) Resumo Log Time: ${successes}/${results.length} sucesso | Total horas: ${totalLogged}`);
      return {
        success: allOk,
        message: allOk ? 'Horas (0.3) lançadas em todas as tarefas (sessão)' : 'Concluído com falhas em algumas tarefas (sessão)',
        loggedHours: totalLogged,
        map: debugMap ? collectedMap : undefined
      };
    } catch (e: any) {
      this.logger.error(`❌ Erro no logHoursInOpenSession: ${e?.message}`);
      return { success: false, message: e?.message || 'Falha no fluxo de horas (sessão)' };
    }
  }

  // applyFastNetworkRouting removida (substituída por otimização global em createOptimizedContext)
}
