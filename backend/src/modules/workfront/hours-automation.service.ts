import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

const STATE_FILE = 'wf_state.json';

@Injectable()
export class HoursAutomationService {
  private readonly logger = new Logger(HoursAutomationService.name);

  private async ensureStateFile(): Promise<string> { const p = path.resolve(process.cwd(), STATE_FILE); try { await fs.access(p); return p; } catch { throw new Error('Sessão não encontrada. Faça login em /api/login'); } }
  private ensureTasksUrl(url: string): string { if(/\/tasks/.test(url)) return url; if(/\/overview/.test(url)) return url.replace(/\/overview.*/, '/tasks'); if(/\/documents/.test(url)) return url.replace(/\/documents.*/, '/tasks'); if(/\/project\/[a-f0-9]+$/i.test(url)) return url + '/tasks'; return url + '/tasks'; }
  private frameLocator(page:any){ return page.frameLocator('iframe[src*="workfront"], iframe[src*="experience"], iframe').first(); }
  private async closeSidebarIfOpen(frameLocator:any, page:any){ try { const sb = frameLocator.locator('#page-sidebar [data-testid="minix-container"]').first(); if((await sb.count())>0 && await sb.isVisible()){ const closeBtn = frameLocator.locator('button[data-testid="minix-header-close-btn"]').first(); if((await closeBtn.count())>0){ await closeBtn.click(); await page.waitForTimeout(600);} } } catch{} }

  async logHours(params: { projectUrl: string; hours: number; note?: string; taskName?: string; headless?: boolean }): Promise<{ success:boolean; message:string; loggedHours?:number }> {
    const { projectUrl, hours, note, taskName, headless = false } = params;
    if(hours <= 0) return { success:false, message:'Horas deve ser > 0' };
    this.logger.log(`⏱️ Lançando ${hours}h${taskName ? ' na tarefa '+taskName: ''}`);

    const url = this.ensureTasksUrl(projectUrl);
    const browser = await chromium.launch({ headless, args: headless?[]:['--start-maximized'] });
    try {
      const statePath = await this.ensureStateFile();
      const context = await browser.newContext({ storageState: statePath, viewport: null });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      const frame = this.frameLocator(page);
      await this.closeSidebarIfOpen(frame, page);

      // Row selection
      let row:any = null;
      if(taskName){
        const rs = [
          `[role="row"]:has-text("${taskName}")`,
          `tr:has-text("${taskName}")`,
          `div:has-text("${taskName}")`
        ];
        for(const sel of rs){ try { const c = frame.locator(sel).first(); if((await c.count())>0 && await c.isVisible()){ row = c; break; } } catch{} }
      }
      if(!row){ const rows = frame.locator('[role="row"]'); if((await rows.count())>1) row = rows.nth(1); }
      if(!row) throw new Error('Linha de tarefa não encontrada');

      // Hour cell
      const hourSelectors = [ '[data-testid*="Actual Hours"]', '[data-testid*="Hours"]', '[aria-label*="Hours" i]', 'div:has-text("Hours")' ];
      let cell:any = null;
      for(const sel of hourSelectors){ try { const c = row.locator(sel).first(); if((await c.count())>0 && await c.isVisible()){ cell = c; break; } } catch{} }
      if(!cell){ const grid = row.locator('[role="gridcell"]'); for(let i=0;i<(await grid.count());i++){ const gc = grid.nth(i); const txt = (await gc.textContent())||''; if(/hour/i.test(txt) || txt.trim()===''){ cell = gc; break;} } }
      if(!cell) throw new Error('Célula de horas não encontrada');

      await cell.click({ force:true });
      await page.waitForTimeout(800);

      const editSelectors = [ 'input[type="text"]:not([readonly])', 'input[role="spinbutton"]', 'input', '[contenteditable="true"]' ];
      let input:any = null;
      for(const sel of editSelectors){ try { const c = frame.locator(sel).first(); if((await c.count())>0 && await c.isVisible()){ input = c; break; } } catch{} }
      if(!input) throw new Error('Input de horas não encontrado');

      try { await input.click({ force:true }); } catch{}
      await page.keyboard.press('Control+A').catch(()=>{});
      await page.keyboard.press('Delete').catch(()=>{});
      await input.fill(hours.toString());
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter').catch(()=>{});
      await page.waitForTimeout(1200);

      if(note){
        const noteSelectors = [ 'textarea[aria-label*="Note" i]', '[contenteditable="true"]:has-text("Add note")' ];
        for(const sel of noteSelectors){ try { const n = frame.locator(sel).first(); if((await n.count())>0 && await n.isVisible()){ await n.click(); await page.waitForTimeout(150); try{ await n.fill(note);}catch{ await page.keyboard.insertText(note);} await page.keyboard.press('Enter').catch(()=>{}); await page.waitForTimeout(400); break; } } catch{} }
      }

      return { success:true, message:`Horas lançadas (${hours})`, loggedHours: hours };
    } catch(e:any){
      this.logger.error(`❌ Erro ao lançar horas: ${e?.message}`);
      return { success:false, message: e?.message || 'Falha ao lançar horas' };
    } finally { try { await browser.close(); } catch{} }
  }
}
