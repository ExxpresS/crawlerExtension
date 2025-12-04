class WorkflowPopup {
    constructor() {
        this.currentMode = 'idle'; // idle, recording, review
        this.recordingState = {
            startTime: null,
            actionCount: 0,
            stateCount: 0,
            timer: null
        };

        // Initialize export manager
        this.dbManager = new WorkflowDBManager();
        this.exportManager = null;
        this.currentExportWorkflowId = null;

        this.initializeExportManager();
        this.initializeElements();
        this.attachEventListeners();
        this.loadInitialState();
    }

    async initializeExportManager() {
        try {
            await this.dbManager.initialize();
            this.exportManager = new WorkflowExportManager(this.dbManager);
            console.log('✅ Export manager initialisé');
        } catch (error) {
            console.error('❌ Erreur initialisation export manager:', error);
        }
    }

    initializeElements() {
        // Modes
        this.idleMode = document.getElementById('idle-mode');
        this.recordingMode = document.getElementById('recording-mode');
        this.reviewMode = document.getElementById('review-mode');
        this.listMode = document.getElementById('list-mode');

        // Buttons
        this.startBtn = document.getElementById('start-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.saveBtn = document.getElementById('save-btn');
        this.discardBtn = document.getElementById('discard-btn');

        // List mode buttons
        this.backToIdleBtn = document.getElementById('back-to-idle');
        this.exportAllBtn = document.getElementById('export-all');
        this.clearAllBtn = document.getElementById('clear-all');

        // Counters and displays
        this.recordingTimer = document.getElementById('recording-timer');
        this.actionCount = document.getElementById('action-count');
        this.stateCount = document.getElementById('state-count');
        this.totalCount = document.getElementById('total-count');

        // Form elements
        this.workflowForm = document.getElementById('workflow-form');
        this.workflowTitle = document.getElementById('workflow-title');
        this.workflowDescription = document.getElementById('workflow-description');
        this.workflowTags = document.getElementById('workflow-tags');

        // Summary elements
        this.summaryActions = document.getElementById('summary-actions');
        this.summaryStates = document.getElementById('summary-states');
        this.summaryDuration = document.getElementById('summary-duration');

        // Recent workflows
        this.recentList = document.getElementById('recent-list');

        // List mode elements
        this.searchWorkflows = document.getElementById('search-workflows');
        this.workflowsList = document.getElementById('workflows-list');

        // Preview elements
        this.workflowPreview = document.getElementById('workflow-preview');
        this.suggestedTags = document.getElementById('suggested-tags');

        // Modal elements
        this.exportModal = document.getElementById('export-modal');
        this.closeExportModal = document.getElementById('close-export-modal');
        this.viewModal = document.getElementById('view-modal');
        this.closeViewModal = document.getElementById('close-view-modal');
        this.workflowDetails = document.getElementById('workflow-details');
    }

    attachEventListeners() {
        // Button events
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.cancelBtn.addEventListener('click', () => this.cancelRecording());
        this.saveBtn.addEventListener('click', () => this.saveWorkflow());
        this.discardBtn.addEventListener('click', () => this.discardWorkflow());

        // List mode events
        this.backToIdleBtn.addEventListener('click', () => this.switchToIdleMode());
        this.exportAllBtn.addEventListener('click', () => this.exportAllWorkflows());
        this.clearAllBtn.addEventListener('click', () => this.clearAllWorkflows());

        // Search functionality
        this.searchWorkflows.addEventListener('input', (e) => this.searchWorkflowsHandler(e.target.value));

        // Recent workflows click
        this.recentList.addEventListener('click', (e) => {
            if (e.target.matches('.workflow-link')) {
                this.showWorkflowsList();
            }
        });

        // Tag suggestions
        this.workflowTags.addEventListener('input', () => this.updateTagSuggestions());

        // Modal events
        this.closeExportModal.addEventListener('click', () => this.hideExportModal());
        this.closeViewModal.addEventListener('click', () => this.hideViewModal());

        // Close modals on backdrop click
        this.exportModal.addEventListener('click', (e) => {
            if (e.target === this.exportModal) {
                this.hideExportModal();
            }
        });

        this.viewModal.addEventListener('click', (e) => {
            if (e.target === this.viewModal) {
                this.hideViewModal();
            }
        });

        // Export format selection
        this.exportModal.addEventListener('click', (e) => {
            if (e.target.matches('.export-format-btn') || e.target.closest('.export-format-btn')) {
                const btn = e.target.matches('.export-format-btn') ? e.target : e.target.closest('.export-format-btn');
                const format = btn.dataset.format;
                this.performExport(format);
            }
        });

        // Listen for messages from service worker
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message);
        });
    }

    async loadInitialState() {
        try {
            // Check if recording is in progress
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_RECORDING_STATE' 
            });
            
            if (response && response.isRecording) {
                this.switchToRecordingMode();
                this.recordingState.startTime = response.startTime;
                this.recordingState.actionCount = response.actionCount || 0;
                this.recordingState.stateCount = response.stateCount || 0;
                this.updateCounters();
                this.startTimer();
            } else {
                this.switchToIdleMode();
            }
            
            // Load workflow count
            this.loadWorkflowStats();
            
        } catch (error) {
            console.error('Erreur lors du chargement de l\'état initial:', error);
            this.switchToIdleMode();
        }
    }

    async loadWorkflowStats() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_WORKFLOW_STATS' 
            });
            
            if (response) {
                this.totalCount.textContent = response.totalWorkflows || 0;
                await this.loadRecentWorkflows();
            }
        } catch (error) {
            console.error('Erreur lors du chargement des statistiques:', error);
            this.totalCount.textContent = '0';
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'RECORDING_STARTED':
                this.switchToRecordingMode();
                this.recordingState.startTime = Date.now();
                this.startTimer();
                break;
                
            case 'RECORDING_STOPPED':
                this.switchToReviewMode();
                this.stopTimer();
                this.prepareReviewData(message.data);
                break;
                
            case 'ACTION_CAPTURED':
                this.recordingState.actionCount++;
                this.updateCounters();
                break;
                
            case 'STATE_CAPTURED':
                this.recordingState.stateCount++;
                this.updateCounters();
                break;
                
            case 'RECORDING_CANCELLED':
                this.switchToIdleMode();
                this.resetRecordingState();
                break;
        }
    }

    async startRecording() {
        try {
            this.startBtn.disabled = true;
            this.startBtn.textContent = 'Démarrage...';
            
            await chrome.runtime.sendMessage({ 
                type: 'START_RECORDING' 
            });
            
        } catch (error) {
            console.error('Erreur lors du démarrage:', error);
            this.startBtn.disabled = false;
            this.startBtn.textContent = '🔴 Démarrer l\'enregistrement';
        }
    }

    async stopRecording() {
        try {
            this.stopBtn.disabled = true;
            this.stopBtn.textContent = 'Arrêt...';
            
            await chrome.runtime.sendMessage({ 
                type: 'STOP_RECORDING' 
            });
            
        } catch (error) {
            console.error('Erreur lors de l\'arrêt:', error);
            this.stopBtn.disabled = false;
            this.stopBtn.textContent = '⏹ Arrêter l\'enregistrement';
        }
    }

    async cancelRecording() {
        try {
            await chrome.runtime.sendMessage({ 
                type: 'CANCEL_RECORDING' 
            });
            
        } catch (error) {
            console.error('Erreur lors de l\'annulation:', error);
        }
    }

    async saveWorkflow() {
        const title = this.workflowTitle.value.trim();
        
        if (!title) {
            alert('Le titre du workflow est obligatoire');
            this.workflowTitle.focus();
            return;
        }
        
        try {
            const workflowData = {
                title,
                description: this.workflowDescription.value.trim(),
                tags: this.workflowTags.value.trim()
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0)
            };
            
            this.saveBtn.disabled = true;
            this.saveBtn.textContent = 'Sauvegarde...';
            
            await chrome.runtime.sendMessage({
                type: 'SAVE_WORKFLOW',
                data: workflowData
            });
            
            this.switchToIdleMode();
            this.resetRecordingState();
            this.loadWorkflowStats();
            
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            this.saveBtn.disabled = false;
            this.saveBtn.textContent = '💾 Sauvegarder';
        }
    }

    async discardWorkflow() {
        if (confirm('Êtes-vous sûr de vouloir rejeter ce workflow ?')) {
            try {
                await chrome.runtime.sendMessage({ 
                    type: 'DISCARD_WORKFLOW' 
                });
                
                this.switchToIdleMode();
                this.resetRecordingState();
                
            } catch (error) {
                console.error('Erreur lors du rejet:', error);
            }
        }
    }

    switchToIdleMode() {
        this.currentMode = 'idle';
        this.idleMode.classList.remove('hidden');
        this.recordingMode.classList.add('hidden');
        this.reviewMode.classList.add('hidden');
        
        // Reset button states
        this.startBtn.disabled = false;
        this.startBtn.textContent = '🔴 Démarrer l\'enregistrement';
    }

    switchToRecordingMode() {
        this.currentMode = 'recording';
        this.idleMode.classList.add('hidden');
        this.recordingMode.classList.remove('hidden');
        this.reviewMode.classList.add('hidden');
        
        // Reset button states
        this.stopBtn.disabled = false;
        this.stopBtn.textContent = '⏹ Arrêter l\'enregistrement';
    }

    switchToReviewMode() {
        this.currentMode = 'review';
        this.idleMode.classList.add('hidden');
        this.recordingMode.classList.add('hidden');
        this.reviewMode.classList.remove('hidden');
        
        // Reset form
        this.workflowForm.reset();
        
        // Reset button states
        this.saveBtn.disabled = false;
        this.saveBtn.textContent = '💾 Sauvegarder';
    }

    prepareReviewData(data) {
        if (data) {
            this.summaryActions.textContent = data.actionCount || this.recordingState.actionCount;
            this.summaryStates.textContent = data.stateCount || this.recordingState.stateCount;
            
            const duration = data.duration ? 
                Math.round(data.duration / 60000) : 
                (this.recordingState.startTime ? 
                    Math.round((Date.now() - this.recordingState.startTime) / 60000) : 0);
            this.summaryDuration.textContent = duration;
            
            // Generate workflow preview
            this.generateWorkflowPreview();
            
            // Generate suggested tags
            this.generateSuggestedTags();
        }
    }

    startTimer() {
        this.stopTimer(); // Clear any existing timer
        
        this.recordingState.timer = setInterval(() => {
            if (this.recordingState.startTime) {
                const elapsed = Date.now() - this.recordingState.startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                this.recordingTimer.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopTimer() {
        if (this.recordingState.timer) {
            clearInterval(this.recordingState.timer);
            this.recordingState.timer = null;
        }
    }

    updateCounters() {
        this.actionCount.textContent = this.recordingState.actionCount;
        this.stateCount.textContent = this.recordingState.stateCount;
    }

    resetRecordingState() {
        this.recordingState = {
            startTime: null,
            actionCount: 0,
            stateCount: 0,
            timer: null
        };
        this.stopTimer();
        this.recordingTimer.textContent = '00:00';
        this.updateCounters();
    }
    
    // === NOUVELLES FONCTIONNALITÉS PHASE 5 ===
    
    switchToListMode() {
        this.currentMode = 'list';
        this.idleMode.classList.add('hidden');
        this.recordingMode.classList.add('hidden');
        this.reviewMode.classList.add('hidden');
        this.listMode.classList.remove('hidden');
        
        this.loadWorkflowsList();
    }
    
    async loadRecentWorkflows() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_WORKFLOWS' 
            });
            
            if (response && response.workflows) {
                this.displayRecentWorkflows(response.workflows.slice(0, 3));
            } else {
                this.showEmptyRecentWorkflows();
            }
        } catch (error) {
            console.error('Erreur lors du chargement des workflows récents:', error);
            this.showEmptyRecentWorkflows();
        }
    }
    
    displayRecentWorkflows(workflows) {
        if (workflows.length === 0) {
            this.showEmptyRecentWorkflows();
            return;
        }
        
        const html = workflows.map(workflow => `
            <div class="workflow-item-small" data-workflow-id="${workflow.id}">
                <div class="workflow-title-small">${this.escapeHtml(workflow.title)}</div>
                <div class="workflow-meta-small">
                    ${this.formatDate(workflow.metadata.createdAt)} • 
                    ${workflow.metadata.actionCount || 0} actions
                </div>
            </div>
        `).join('');
        
        this.recentList.innerHTML = html + `
            <button class="workflow-link btn btn-secondary" style="width: 100%; margin-top: 10px;">
                📚 Voir tous les workflows
            </button>
        `;
    }
    
    showEmptyRecentWorkflows() {
        this.recentList.innerHTML = '<p class="empty-state">Aucun workflow enregistré</p>';
    }
    
    async loadWorkflowsList() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_WORKFLOWS' 
            });
            
            if (response && response.workflows) {
                this.displayWorkflowsList(response.workflows);
            } else {
                this.showEmptyWorkflowsList();
            }
        } catch (error) {
            console.error('Erreur lors du chargement de la liste:', error);
            this.showEmptyWorkflowsList();
        }
    }
    
    displayWorkflowsList(workflows) {
        if (workflows.length === 0) {
            this.showEmptyWorkflowsList();
            return;
        }
        
        const html = workflows.map(workflow => this.renderWorkflowItem(workflow)).join('');
        this.workflowsList.innerHTML = html;
        
        // Attach event listeners for workflow actions
        this.attachWorkflowItemEvents();
    }
    
    renderWorkflowItem(workflow) {
        const tags = Array.isArray(workflow.tags) ? workflow.tags : [];
        const tagsHtml = tags.map(tag => `<span class="workflow-tag">${this.escapeHtml(tag)}</span>`).join('');
        
        return `
            <div class="workflow-item" data-workflow-id="${workflow.id}">
                <div class="workflow-title">${this.escapeHtml(workflow.title)}</div>
                <div class="workflow-meta">
                    <div class="workflow-date">${this.formatDate(workflow.metadata.createdAt)}</div>
                    <div class="workflow-stats">
                        <span>${workflow.metadata.actionCount || 0} actions</span>
                        <span>${workflow.metadata.stateCount || 0} états</span>
                    </div>
                </div>
                ${workflow.description ? `<div class="workflow-description">${this.escapeHtml(workflow.description)}</div>` : ''}
                ${tags.length > 0 ? `<div class="workflow-tags">${tagsHtml}</div>` : ''}
                <div class="workflow-actions">
                    <button class="workflow-action" data-action="view" data-workflow-id="${workflow.id}">👁️ Voir</button>
                    <button class="workflow-action" data-action="export" data-workflow-id="${workflow.id}">📥 Export</button>
                    <button class="workflow-action" data-action="delete" data-workflow-id="${workflow.id}">🗑️ Suppr.</button>
                </div>
            </div>
        `;
    }
    
    attachWorkflowItemEvents() {
        this.workflowsList.addEventListener('click', async (e) => {
            if (e.target.matches('.workflow-action')) {
                const action = e.target.dataset.action;
                const workflowId = e.target.dataset.workflowId;
                
                switch (action) {
                    case 'view':
                        await this.viewWorkflow(workflowId);
                        break;
                    case 'export':
                        await this.exportWorkflow(workflowId);
                        break;
                    case 'delete':
                        await this.deleteWorkflow(workflowId);
                        break;
                }
            }
        });
    }
    
    showEmptyWorkflowsList() {
        this.workflowsList.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">📋</span>
                <p>Aucun workflow sauvegardé</p>
                <p>Commencez par enregistrer votre premier workflow !</p>
            </div>
        `;
    }
    
    async searchWorkflowsHandler(query) {
        if (!query.trim()) {
            this.loadWorkflowsList();
            return;
        }
        
        try {
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_WORKFLOWS' 
            });
            
            if (response && response.workflows) {
                const filtered = this.filterWorkflows(response.workflows, query.toLowerCase());
                this.displayWorkflowsList(filtered);
            }
        } catch (error) {
            console.error('Erreur lors de la recherche:', error);
        }
    }
    
    filterWorkflows(workflows, query) {
        return workflows.filter(workflow => {
            return (
                workflow.title.toLowerCase().includes(query) ||
                (workflow.description && workflow.description.toLowerCase().includes(query)) ||
                (workflow.tags && workflow.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        });
    }
    
    async viewWorkflow(workflowId) {
        try {
            console.log('👁️ Affichage du workflow:', workflowId);

            // Récupérer les données complètes du workflow
            const workflowData = await this.dbManager.getWorkflowComplete(workflowId);

            if (!workflowData) {
                alert('Workflow introuvable');
                return;
            }

            // Générer le contenu détaillé
            const detailsHtml = this.generateWorkflowDetailsHTML(workflowData);
            this.workflowDetails.innerHTML = detailsHtml;

            // Afficher la modale
            this.showViewModal();

        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage du workflow:', error);
            alert('Erreur lors de l\'affichage du workflow');
        }
    }

    async exportWorkflow(workflowId) {
        try {
            console.log('📥 Préparation export workflow:', workflowId);

            // Stocker l'ID pour l'export
            this.currentExportWorkflowId = workflowId;

            // Afficher la modale de sélection de format
            this.showExportModal();

        } catch (error) {
            console.error('❌ Erreur lors de l\'export:', error);
            alert('Erreur lors de l\'export du workflow');
        }
    }

    async performExport(format) {
        try {
            if (!this.exportManager) {
                alert('Export manager non initialisé');
                return;
            }

            console.log(`📥 Export en format ${format}...`);

            // Export d'un workflow spécifique ou tous ?
            if (this.currentExportWorkflowId) {
                await this.exportManager.exportWorkflow(
                    this.currentExportWorkflowId,
                    format,
                    { pretty: true }
                );
                console.log(`✅ Export ${format} réussi`);
            } else {
                // Export de tous les workflows
                await this.exportManager.exportAllWorkflows(format, { pretty: true });
                console.log(`✅ Export complet ${format} réussi`);
            }

            // Fermer la modale et réinitialiser
            this.hideExportModal();
            this.currentExportWorkflowId = null;

        } catch (error) {
            console.error('❌ Erreur lors de l\'export:', error);
            alert(`Erreur lors de l'export en format ${format}: ${error.message}`);
        }
    }

    generateWorkflowDetailsHTML(workflowData) {
        const { workflow, etats, actions } = workflowData;

        let html = `
            <div class="detail-section">
                <h4>📋 Informations générales</h4>
                <div class="detail-info">
                    <span class="detail-label">Titre:</span>
                    <span class="detail-value">${this.escapeHtml(workflow.title)}</span>

                    <span class="detail-label">Description:</span>
                    <span class="detail-value">${this.escapeHtml(workflow.description || 'Non renseigné')}</span>

                    <span class="detail-label">Créé le:</span>
                    <span class="detail-value">${new Date(workflow.metadata.createdAt).toLocaleString('fr-FR')}</span>

                    <span class="detail-label">Durée:</span>
                    <span class="detail-value">${Math.round((workflow.metadata.duration || 0) / 60000)} minutes</span>

                    <span class="detail-label">Actions:</span>
                    <span class="detail-value">${workflow.metadata.actionCount || 0}</span>

                    <span class="detail-label">États:</span>
                    <span class="detail-value">${workflow.metadata.stateCount || 0}</span>
                </div>
        `;

        if (workflow.tags && workflow.tags.length > 0) {
            html += `
                <div style="margin-top: 10px;">
                    <span class="detail-label">Tags:</span>
                    <div class="workflow-tags" style="margin-top: 5px;">
                        ${workflow.tags.map(tag => `<span class="workflow-tag">${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        // Section des actions
        if (actions && actions.length > 0) {
            html += `
                <div class="detail-section">
                    <h4>⚡ Séquence d'actions (${actions.length})</h4>
            `;

            actions.forEach((action, index) => {
                html += `
                    <div class="action-item">
                        <div class="action-header">
                            <span class="action-number">#${action.sequenceNumber || index + 1}</span>
                            <span class="action-type">${this.getActionTypeLabel(action.type)}</span>
                        </div>
                        <div class="action-details">${this.getActionDescription(action)}</div>
                    </div>
                `;
            });

            html += `</div>`;
        }

        // Section des états
        if (etats && etats.length > 0) {
            html += `
                <div class="detail-section">
                    <h4>📄 Pages visitées (${etats.length})</h4>
            `;

            etats.forEach((etat, index) => {
                html += `
                    <div class="action-item">
                        <div class="action-header">
                            <span class="action-number">#${etat.sequenceNumber || index + 1}</span>
                        </div>
                        <div class="action-details">
                            <strong>${this.escapeHtml(etat.title || 'Sans titre')}</strong><br>
                            <small style="color: #718096;">${this.escapeHtml(etat.urlPattern || etat.url || '')}</small>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        }

        return html;
    }

    getActionTypeLabel(type) {
        const labels = {
            'click': '🖱️ Clic',
            'input': '⌨️ Saisie',
            'change': '🔄 Modification',
            'submit': '📤 Soumission',
            'navigation': '🧭 Navigation'
        };
        return labels[type] || type;
    }

    getActionDescription(action) {
        switch (action.type) {
            case 'click':
                return `Clic sur "${action.target?.textContent || action.target?.tagName || 'élément'}"`;

            case 'input':
                return `Saisie dans "${action.target?.label || action.target?.placeholder || 'champ'}" (${action.target?.inputType || 'text'})`;

            case 'change':
                if (action.target?.selectDetails) {
                    return `Sélection: "${action.target.selectDetails.selectedText}"`;
                } else if (action.target?.checkboxDetails) {
                    return `Case ${action.target.checkboxDetails.isChecked ? 'cochée' : 'décochée'}: "${action.target.name}"`;
                }
                return 'Modification de sélection';

            case 'submit':
                return `Formulaire soumis${action.target?.id ? ` (${action.target.id})` : ''}`;

            case 'navigation':
                return `Navigation vers ${action.navigationDetails?.to?.pathname || 'page'}`;

            default:
                return `Action: ${action.type}`;
        }
    }

    showExportModal() {
        this.exportModal.classList.remove('hidden');
    }

    hideExportModal() {
        this.exportModal.classList.add('hidden');
        this.currentExportWorkflowId = null;
    }

    showViewModal() {
        this.viewModal.classList.remove('hidden');
    }

    hideViewModal() {
        this.viewModal.classList.add('hidden');
    }
    
    async deleteWorkflow(workflowId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce workflow ?')) {
            return;
        }
        
        try {
            await chrome.runtime.sendMessage({
                type: 'DELETE_WORKFLOW',
                workflowId
            });
            
            // Refresh the list
            this.loadWorkflowsList();
            this.loadWorkflowStats();
            
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression du workflow');
        }
    }
    
    async exportAllWorkflows() {
        try {
            console.log('📥 Export de tous les workflows...');

            if (!this.exportManager) {
                alert('Export manager non initialisé');
                return;
            }

            // Vérifier qu'il y a des workflows à exporter
            const response = await chrome.runtime.sendMessage({
                type: 'GET_WORKFLOWS'
            });

            if (!response || !response.workflows || response.workflows.length === 0) {
                alert('Aucun workflow à exporter');
                return;
            }

            // Réinitialiser l'ID du workflow courant pour indiquer un export complet
            this.currentExportWorkflowId = null;

            // Afficher la modale de sélection de format
            this.showExportModal();

        } catch (error) {
            console.error('❌ Erreur lors de l\'export complet:', error);
            alert('Erreur lors de l\'export');
        }
    }

    async clearAllWorkflows() {
        if (!confirm('Êtes-vous sûr de vouloir supprimer TOUS les workflows ? Cette action est irréversible.')) {
            return;
        }

        try {
            console.log('🗑️ Suppression de tous les workflows...');

            if (!this.dbManager.db) {
                await this.dbManager.initialize();
            }

            // Supprimer toutes les données
            await this.dbManager.clearAllData();

            console.log('✅ Tous les workflows ont été supprimés');

            // Rafraîchir l'affichage
            this.loadWorkflowsList();
            this.loadWorkflowStats();

            alert('Tous les workflows ont été supprimés');

        } catch (error) {
            console.error('❌ Erreur lors de la suppression complète:', error);
            alert('Erreur lors de la suppression: ' + error.message);
        }
    }
    
    showWorkflowsList() {
        this.switchToListMode();
    }
    
    generateWorkflowPreview() {
        // Generate a preview of the workflow steps
        const steps = [
            { icon: '🔄', description: `${this.recordingState.stateCount} états de page capturés` },
            { icon: '🖱️', description: `${this.recordingState.actionCount} actions utilisateur enregistrées` },
            { icon: '⏱️', description: `Durée d'enregistrement capturée` },
            { icon: '📊', description: 'Données prêtes pour l\'analyse' }
        ];
        
        const stepsHtml = steps.map(step => `
            <div class="workflow-step">
                <span class="step-icon">${step.icon}</span>
                <span class="step-description">${step.description}</span>
            </div>
        `).join('');
        
        this.workflowPreview.innerHTML = stepsHtml;
    }
    
    generateSuggestedTags() {
        // Common workflow tags based on context
        const suggestions = [
            'formation', 'process', 'admin', 'client', 'vente', 'support',
            'onboarding', 'configuration', 'reporting', 'validation'
        ];
        
        const tagsHtml = suggestions.map(tag => 
            `<span class="tag-suggestion" data-tag="${tag}">${tag}</span>`
        ).join('');
        
        this.suggestedTags.innerHTML = tagsHtml;
        
        // Attach click events
        this.suggestedTags.addEventListener('click', (e) => {
            if (e.target.matches('.tag-suggestion')) {
                this.addSuggestedTag(e.target.dataset.tag);
            }
        });
    }
    
    updateTagSuggestions() {
        // Update suggestions based on current input
        this.generateSuggestedTags();
    }
    
    addSuggestedTag(tag) {
        const currentTags = this.workflowTags.value.trim();
        const tagsArray = currentTags ? currentTags.split(',').map(t => t.trim()) : [];
        
        if (!tagsArray.includes(tag)) {
            tagsArray.push(tag);
            this.workflowTags.value = tagsArray.join(', ');
        }
    }
    
    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            return 'Il y a moins d\'une heure';
        } else if (diffHours < 24) {
            return `Il y a ${diffHours}h`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) {
                return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
            } else {
                return date.toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            }
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WorkflowPopup();
});