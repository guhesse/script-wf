// src/services/workfrontProjectService.js
import workfrontProjectRepository from '../repositories/workfrontProjectRepository.js';

export class WorkfrontProjectService {
  /**
   * Salvar/atualizar projeto a partir de uma URL
   */
  async saveProjectFromUrl(projectUrl, additionalData = {}) {
    try {
      // Extrair ID do projeto da URL se possível
      const projectId = this.extractProjectIdFromUrl(projectUrl);

      const projectData = {
        url: projectUrl,
        projectId,
        title: additionalData.title || null,
        description: additionalData.description || null,
        ...additionalData,
      };

      const project = await workfrontProjectRepository.createOrUpdate(projectData);

      // Registrar acesso
      await workfrontProjectRepository.recordAccess(project.id, {
        userAgent: additionalData.userAgent,
        ipAddress: additionalData.ipAddress,
      });

      return project;
    } catch (error) {
      console.error('Erro no service saveProjectFromUrl:', error);
      throw error;
    }
  }

  /**
   * Extrair documentos do projeto e salvar no histórico
   */
  async extractAndSaveDocuments(projectUrl, options = {}) {
    try {
      const { userAgent, ipAddress, headless = true } = options;

      // 1. Salvar/atualizar projeto no banco
      const project = await this.saveProjectFromUrl(projectUrl, {
        userAgent,
        ipAddress,
        title: 'Projeto Workfront',
        description: 'Extração de documentos realizada',
      });

      // 2. Extrair documentos usando o wf_share_const
      const extractionResult = await extractDocuments(projectUrl, headless);

      // 3. Atualizar projeto com informações da extração
      if (extractionResult.success) {
        const title = extractionResult.projectTitle || `Projeto - ${extractionResult.totalFiles} arquivos`;
        const dsid = this.extractDSIDFromTitle(title);
        
        await workfrontProjectRepository.createOrUpdate({
          url: projectUrl,
          title,
          dsid,
          description: `${extractionResult.totalFolders} pastas, processado em ${extractionResult.processingTime?.totalSeconds}s`,
        });
      }

      return {
        project,
        extraction: extractionResult,
      };
    } catch (error) {
      console.error('Erro no service extractAndSaveDocuments:', error);
      throw error;
    }
  }

  /**
   * Compartilhar documentos e registrar ação
   */
  async shareDocuments(projectUrl, selections, options = {}) {
    try {
      const { selectedUser = 'carol', userAgent, ipAddress, headless = false } = options;

      // 1. Buscar ou criar projeto
      let project = await workfrontProjectRepository.findByUrl(projectUrl);
      if (!project) {
        project = await this.saveProjectFromUrl(projectUrl, {
          userAgent,
          ipAddress,
          title: 'Projeto Workfront - Compartilhamento',
        });
      }

      // 2. Registrar acesso
      await workfrontProjectRepository.recordAccess(project.id, {
        userAgent,
        ipAddress,
      });

      // 3. Executar compartilhamento para cada seleção
      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const selection of selections) {
        try {
          console.log(`\n📋 Compartilhando: ${selection.folder}/${selection.fileName}`);

          await shareDocument(
            projectUrl,
            selection.folder,
            selection.fileName,
            selectedUser,
            headless
          );

          results.push({
            folder: selection.folder,
            fileName: selection.fileName,
            success: true,
            message: 'Compartilhado com sucesso',
          });

          successCount++;
          console.log(`✅ ${selection.fileName} compartilhado com sucesso!`);
        } catch (shareError) {
          console.error(`❌ Erro ao compartilhar ${selection.fileName}:`, shareError.message);

          results.push({
            folder: selection.folder,
            fileName: selection.fileName,
            success: false,
            error: shareError.message,
          });

          errorCount++;
        }
      }

      // 4. Atualizar projeto com resultado do compartilhamento
      await workfrontProjectRepository.createOrUpdate({
        url: projectUrl,
        description: `Último compartilhamento: ${successCount} sucessos, ${errorCount} erros`,
      });

      return {
        success: errorCount === 0,
        message: `Compartilhamento concluído: ${successCount} sucessos, ${errorCount} erros`,
        project,
        results,
        summary: {
          total: selections.length,
          success: successCount,
          errors: errorCount,
        },
      };
    } catch (error) {
      console.error('Erro no service shareDocuments:', error);
      throw error;
    }
  }

  /**
   * Listar histórico de projetos
   */
  async getProjectHistory(options = {}) {
    try {
      return await workfrontProjectRepository.findAll(options);
    } catch (error) {
      console.error('Erro no service getProjectHistory:', error);
      throw error;
    }
  }

  /**
   * Buscar projeto por ID
   */
  async getProjectById(id) {
    try {
      return await workfrontProjectRepository.findById(id);
    } catch (error) {
      console.error('Erro no service getProjectById:', error);
      throw error;
    }
  }

  /**
   * Buscar projeto por URL
   */
  async getProjectByUrl(url) {
    try {
      return await workfrontProjectRepository.findByUrl(url);
    } catch (error) {
      console.error('Erro no service getProjectByUrl:', error);
      throw error;
    }
  }

  /**
   * Arquivar projeto
   */
  async archiveProject(id) {
    try {
      return await workfrontProjectRepository.updateStatus(id, 'ARCHIVED');
    } catch (error) {
      console.error('Erro no service archiveProject:', error);
      throw error;
    }
  }

  /**
   * Deletar projeto
   */
  async deleteProject(id) {
    try {
      return await workfrontProjectRepository.delete(id);
    } catch (error) {
      console.error('Erro no service deleteProject:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas do dashboard
   */
  async getDashboardStats() {
    try {
      const [stats, mostAccessed] = await Promise.all([
        workfrontProjectRepository.getStats(),
        workfrontProjectRepository.findMostAccessed(5),
      ]);

      return {
        ...stats,
        mostAccessed,
      };
    } catch (error) {
      console.error('Erro no service getDashboardStats:', error);
      throw error;
    }
  }

  /**
   * Extrair ID do projeto da URL (utilitário)
   */
  extractProjectIdFromUrl(url) {
    try {
      // Padrão: /project/ID_DO_PROJETO/
      const match = url.match(/\/project\/([a-f0-9]+)/i);
      return match ? match[1] : null;
    } catch (error) {
      console.warn('Não foi possível extrair ID do projeto da URL:', url);
      return null;
    }
  }

  /**
   * Extrair DSID do título do projeto
   * Formato esperado: 2601G0179_0057_5297982 onde 5297982 é o DSID
   */
  extractDSIDFromTitle(title) {
    try {
      if (!title) return null;
      
      // Buscar padrão de 7 dígitos que representa o DSID
      const match = title.match(/(\d{7})/);
      return match ? match[1] : null;
    } catch (error) {
      console.warn('Não foi possível extrair DSID do título:', title);
      return null;
    }
  }

  /**
   * Validar URL do projeto
   */
  isValidWorkfrontUrl(url) {
    try {
      const validPatterns = [
        /experience\.adobe\.com.*workfront.*project/i,
        /workfront\.com.*project/i,
      ];

      return validPatterns.some(pattern => pattern.test(url));
    } catch (error) {
      return false;
    }
  }
}

export default new WorkfrontProjectService();