// app.js
class WorkfrontSharingManager {
    constructor() {
        this.selectedFiles = new Map(); // folder -> [files]
        this.documents = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkLoginStatus();
    }

    setupEventListeners() {
        // Login
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('continueBtn').addEventListener('click', () => this.showMainScreen());
        
        // Extraction
        document.getElementById('extractBtn').addEventListener('click', () => this.extractDocuments());
        
        // Sharing
        document.getElementById('shareBtn').addEventListener('click', () => this.shareSelectedFiles());
        
        // URL input
        document.getElementById('projectUrl').addEventListener('input', () => this.validateUrl());
    }

    async checkLoginStatus() {
        try {
            const response = await fetch('/api/login-status');
            const data = await response.json();
            
            const statusIndicator = document.getElementById('loginStatus');
            const statusText = document.getElementById('loginStatusText');
            const loginBtn = document.getElementById('loginBtn');
            const continueBtn = document.getElementById('continueBtn');
            
            if (data.loggedIn) {
                statusIndicator.className = 'status-indicator status-logged-in';
                statusText.textContent = `Conectado (há ${data.hoursAge}h)`;
                loginBtn.style.display = 'none';
                continueBtn.style.display = 'block';
                loginBtn.disabled = false;
            } else {
                statusIndicator.className = 'status-indicator status-logged-out';
                statusText.textContent = 'Não conectado';
                loginBtn.disabled = false;
                loginBtn.style.display = 'block';
                continueBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Erro ao verificar status de login:', error);
            this.showToast('Erro ao verificar status de login', 'error');
        }
    }

    async login() {
        this.showLoading('Fazendo login no Workfront...\\nEsta janela pode ser minimizada.');
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Login realizado com sucesso!', 'success');
                await this.checkLoginStatus();
            } else {
                this.showToast(data.message || 'Erro durante o login', 'error');
            }
        } catch (error) {
            console.error('Erro no login:', error);
            this.showToast('Erro de conexão durante o login', 'error');
        } finally {
            this.hideLoading();
        }
    }

    showMainScreen() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainScreen').style.display = 'block';
    }

    validateUrl() {
        const url = document.getElementById('projectUrl').value;
        const extractBtn = document.getElementById('extractBtn');
        
        const isValid = url && url.includes('workfront') && url.includes('documents');
        extractBtn.disabled = !isValid;
        
        if (url && !isValid) {
            this.showToast('URL deve ser da página de documentos do Workfront', 'warning');
        }
    }

    async extractDocuments() {
        const url = document.getElementById('projectUrl').value;
        
        if (!url) {
            this.showToast('Por favor, adicione a URL do projeto', 'warning');
            return;
        }

        this.showLoading('Extraindo documentos do projeto...\\nEste processo abrirá o navegador para acessar o Workfront.\\nAguarde enquanto coletamos os arquivos disponíveis.');
        
        try {
            const response = await fetch('/api/extract-documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ projectUrl: url })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.documents = data.documents;
                this.renderDocuments();
                this.showToast(`Documentos extraídos com sucesso! Encontradas ${data.totalFolders || 0} pastas com ${data.totalFiles || 0} arquivos.`, 'success');
            } else {
                console.error('Erro na extração:', data);
                let errorMessage = data.message || 'Erro ao extrair documentos';
                
                // Se há informações de debug, mostra no console
                if (data.debug) {
                    console.log('Debug info:', data.debug);
                    errorMessage += ' (veja o console para mais detalhes)';
                }
                
                this.showToast(errorMessage, 'error');
            }
        } catch (error) {
            console.error('Erro na extração:', error);
            this.showToast('Erro de conexão durante a extração', 'error');
        } finally {
            this.hideLoading();
        }
    }

    renderDocuments() {
        const container = document.getElementById('documentsContainer');
        
        if (!this.documents || !this.documents.folders) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-exclamation-circle display-4 mb-3"></i>
                    <p>Nenhum documento encontrado</p>
                </div>
            `;
            return;
        }

        let html = '';
        
        this.documents.folders.forEach(folder => {
            html += `
                <div class="folder-section mb-4">
                    <div class="folder-header">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-folder me-2"></i>
                                ${folder.name}
                            </h6>
                            <div>
                                <button type="button" class="btn btn-sm btn-outline-light me-2" onclick="app.selectAllInFolder('${folder.name}')">
                                    Selecionar Todos
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-light" onclick="app.deselectAllInFolder('${folder.name}')">
                                    Desmarcar Todos
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="folder-content p-3">
                        ${folder.files.map(file => this.renderFileItem(folder.name, file)).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.updateSelectionSummary();
    }

    renderFileItem(folderName, file) {
        const fileId = `${folderName}-${file.name}`;
        const iconClass = this.getFileIcon(file.type);
        
        return `
            <div class="file-item" data-folder="${folderName}" data-file="${file.name}" onclick="app.toggleFileSelection('${folderName}', '${file.name}')">
                <div class="d-flex align-items-center">
                    <input type="checkbox" class="form-check-input me-3" id="${fileId}">
                    <i class="bi ${iconClass} me-3 text-primary"></i>
                    <div class="flex-grow-1">
                        <div class="fw-medium">${file.name}</div>
                        <small class="text-muted">${file.size}</small>
                    </div>
                    <span class="badge bg-secondary">${file.type}</span>
                </div>
            </div>
        `;
    }

    getFileIcon(type) {
        const icons = {
            'image': 'bi-image',
            'video': 'bi-camera-video',
            'document': 'bi-file-earmark-text',
            'presentation': 'bi-file-earmark-slides',
            'design': 'bi-palette',
            'text': 'bi-file-earmark',
            'default': 'bi-file-earmark'
        };
        return icons[type] || icons.default;
    }

    toggleFileSelection(folderName, fileName) {
        const fileId = `${folderName}-${fileName}`;
        const checkbox = document.getElementById(fileId);
        const fileItem = checkbox.closest('.file-item');
        
        checkbox.checked = !checkbox.checked;
        
        if (checkbox.checked) {
            fileItem.classList.add('selected');
            this.addFileToSelection(folderName, fileName);
        } else {
            fileItem.classList.remove('selected');
            this.removeFileFromSelection(folderName, fileName);
        }
        
        this.updateSelectionSummary();
    }

    addFileToSelection(folderName, fileName) {
        if (!this.selectedFiles.has(folderName)) {
            this.selectedFiles.set(folderName, []);
        }
        
        const files = this.selectedFiles.get(folderName);
        if (!files.includes(fileName)) {
            files.push(fileName);
        }
    }

    removeFileFromSelection(folderName, fileName) {
        if (this.selectedFiles.has(folderName)) {
            const files = this.selectedFiles.get(folderName);
            const index = files.indexOf(fileName);
            if (index > -1) {
                files.splice(index, 1);
            }
            
            if (files.length === 0) {
                this.selectedFiles.delete(folderName);
            }
        }
    }

    selectAllInFolder(folderName) {
        const folder = this.documents.folders.find(f => f.name === folderName);
        if (folder) {
            folder.files.forEach(file => {
                const fileId = `${folderName}-${file.name}`;
                const checkbox = document.getElementById(fileId);
                const fileItem = checkbox.closest('.file-item');
                
                checkbox.checked = true;
                fileItem.classList.add('selected');
                this.addFileToSelection(folderName, file.name);
            });
            this.updateSelectionSummary();
        }
    }

    deselectAllInFolder(folderName) {
        const folder = this.documents.folders.find(f => f.name === folderName);
        if (folder) {
            folder.files.forEach(file => {
                const fileId = `${folderName}-${file.name}`;
                const checkbox = document.getElementById(fileId);
                const fileItem = checkbox.closest('.file-item');
                
                checkbox.checked = false;
                fileItem.classList.remove('selected');
            });
            this.selectedFiles.delete(folderName);
            this.updateSelectionSummary();
        }
    }

    updateSelectionSummary() {
        const totalFiles = Array.from(this.selectedFiles.values()).reduce((sum, files) => sum + files.length, 0);
        const totalFolders = this.selectedFiles.size;
        
        const summaryElement = document.getElementById('selectionSummary');
        const shareBtn = document.getElementById('shareBtn');
        
        if (totalFiles === 0) {
            summaryElement.textContent = 'Nenhum arquivo selecionado';
            shareBtn.disabled = true;
        } else {
            summaryElement.innerHTML = `
                <span class="text-success">
                    <i class="bi bi-check-circle me-1"></i>
                    ${totalFiles} arquivo(s) selecionado(s) em ${totalFolders} pasta(s)
                </span>
            `;
            shareBtn.disabled = false;
        }
    }

    async shareSelectedFiles() {
        if (this.selectedFiles.size === 0) {
            this.showToast('Selecione pelo menos um arquivo para compartilhar', 'warning');
            return;
        }

        const projectUrl = document.getElementById('projectUrl').value;
        const selections = Array.from(this.selectedFiles.entries()).map(([folder, files]) => ({
            folder,
            files
        }));

        const totalFiles = selections.reduce((sum, sel) => sum + sel.files.length, 0);
        
        this.showLoading(`Compartilhando ${totalFiles} arquivo(s)...\\nEste processo pode demorar alguns minutos.`);
        
        try {
            const response = await fetch('/api/share-documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectUrl,
                    selections,
                    users: [] // Será usado pelos usuários configurados no backend
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast(data.message, 'success');
                this.showResults(data.results);
            } else {
                this.showToast(data.message || 'Erro durante o compartilhamento', 'error');
                if (data.results) {
                    this.showResults(data.results);
                }
            }
        } catch (error) {
            console.error('Erro no compartilhamento:', error);
            this.showToast('Erro de conexão durante o compartilhamento', 'error');
        } finally {
            this.hideLoading();
        }
    }

    showResults(results) {
        const container = document.getElementById('resultsContainer');
        const list = document.getElementById('resultsList');
        
        let html = '';
        results.forEach(result => {
            const iconClass = result.status === 'success' ? 'bi-check-circle text-success' : 'bi-x-circle text-danger';
            html += `
                <div class="alert ${result.status === 'success' ? 'alert-success' : 'alert-danger'} py-2">
                    <i class="bi ${iconClass} me-2"></i>
                    <strong>${result.file}</strong> (${result.folder}): ${result.message}
                </div>
            `;
        });
        
        list.innerHTML = html;
        container.style.display = 'block';
    }

    showLoading(message) {
        document.getElementById('loadingText').textContent = message;
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toastId = 'toast-' + Date.now();
        
        const iconMap = {
            success: 'bi-check-circle',
            error: 'bi-x-circle',
            warning: 'bi-exclamation-triangle',
            info: 'bi-info-circle'
        };
        
        const bgMap = {
            success: 'bg-success',
            error: 'bg-danger',
            warning: 'bg-warning',
            info: 'bg-primary'
        };
        
        const toastElement = document.createElement('div');
        toastElement.className = 'toast';
        toastElement.id = toastId;
        toastElement.setAttribute('role', 'alert');
        toastElement.innerHTML = `
            <div class="toast-header ${bgMap[type]} text-white">
                <i class="bi ${iconMap[type]} me-2"></i>
                <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;
        
        toastContainer.appendChild(toastElement);
        
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: type === 'error' ? 8000 : 5000
        });
        
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
        
        toast.show();
    }

    logout() {
        // Aqui você poderia implementar logout se necessário
        location.reload();
    }
}

// Inicializa a aplicação
const app = new WorkfrontSharingManager();

// Função global para logout (chamada pelo HTML)
function logout() {
    app.logout();
}