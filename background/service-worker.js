// Importer le gestionnaire de DB
importScripts('db-manager.js');

class WorkflowRecorder {
    constructor() {
        this.isRecording = false;
        this.currentWorkflow = null;
        this.recordingState = {
            workflowId: null,
            startTime: null,
            actions: [],
            states: [],
            actionCount: 0,
            stateCount: 0
        };

        this.dbManager = new WorkflowDBManager();

        // Variables de tracking pour lier actions et states
        this.lastCapturedStateId = null;  // ID du dernier state capturé
        this.pendingAction = null;         // Action en attente de lien avec state suivant

        this.initializeServiceWorker();
    }

    initializeServiceWorker() {
        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            // Return true to indicate async response
            return true;
        });

        // Handle extension startup
        chrome.runtime.onStartup.addListener(() => {
            this.initializeState();
        });

        // Handle extension install
        chrome.runtime.onInstalled.addListener(() => {
            this.initializeState();
        });

        // Initialize database
        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            await this.dbManager.initialize();
            console.log('✅ Base de données initialisée');
        } catch (error) {
            console.error('❌ Erreur initialisation base de données:', error);
        }
    }

    async initializeState() {
        // Reset any ongoing recording on extension restart
        this.isRecording = false;
        this.currentWorkflow = null;
        this.resetRecordingState();

        // Clear any recording badge
        await this.updateBadge(false);
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_RECORDING_STATE':
                    sendResponse({
                        isRecording: this.isRecording,
                        startTime: this.recordingState.startTime,
                        actionCount: this.recordingState.actionCount,
                        stateCount: this.recordingState.stateCount
                    });
                    break;

                case 'START_RECORDING':
                    await this.startRecording();
                    sendResponse({ success: true });
                    break;

                case 'STOP_RECORDING':
                    await this.stopRecording();
                    sendResponse({ success: true });
                    break;

                case 'CANCEL_RECORDING':
                    await this.cancelRecording();
                    sendResponse({ success: true });
                    break;

                case 'SAVE_WORKFLOW':
                    await this.saveWorkflow(message.data);
                    sendResponse({ success: true });
                    break;

                case 'DISCARD_WORKFLOW':
                    await this.discardWorkflow();
                    sendResponse({ success: true });
                    break;

                case 'GET_WORKFLOW_STATS':
                    const stats = await this.getWorkflowStats();
                    sendResponse(stats);
                    break;

                case 'GET_WORKFLOWS':
                    const workflows = await this.getWorkflows();
                    sendResponse({ workflows });
                    break;

                case 'DELETE_WORKFLOW':
                    await this.deleteWorkflow(message.workflowId);
                    sendResponse({ success: true });
                    break;

                // Messages from content scripts
                case 'ACTION_CAPTURED':
                    if (this.isRecording) {
                        this.handleActionCaptured(message.data);
                        sendResponse({ success: true });
                    }
                    break;

                case 'STATE_CAPTURED':
                    if (this.isRecording) {
                        this.handleStateCaptured(message.data);
                        sendResponse({ success: true });
                    }
                    break;

                default:
                    console.warn('Message type non reconnu:', message.type);
                    sendResponse({ error: 'Type de message non reconnu' });
            }
        } catch (error) {
            console.error('Erreur dans handleMessage:', error);
            sendResponse({ error: error.message });
        }
    }

    async startRecording() {
        if (this.isRecording) {
            throw new Error('Un enregistrement est déjà en cours');
        }

        console.log('Démarrage de l\'enregistrement...');

        // Initialize recording state
        this.isRecording = true;
        this.recordingState = {
            workflowId: this.generateUUID(),
            startTime: Date.now(),
            actions: [],
            states: [],
            actionCount: 0,
            stateCount: 0
        };

        // Update badge
        await this.updateBadge(true);

        // Capture initial state of current tab
        await this.captureInitialState();

        // Notify popup
        await this.notifyPopup('RECORDING_STARTED');

        // Notify content scripts in all tabs
        await this.notifyContentScripts('RECORDING_STARTED');
    }

    async stopRecording() {
        if (!this.isRecording) {
            throw new Error('Aucun enregistrement en cours');
        }

        console.log('Arrêt de l\'enregistrement...');

        this.isRecording = false;

        // Nettoyer les variables de tracking
        if (this.pendingAction) {
            // Si action pendante sans state suivant, l'ajouter quand même
            this.recordingState.actions.push(this.pendingAction);
            console.log('⚠️ Action pendante ajoutée sans etatApresId:', this.pendingAction.type);
        }
        this.pendingAction = null;
        this.lastCapturedStateId = null;

        // Update badge
        await this.updateBadge(false);

        // Prepare data for review
        const reviewData = {
            actionCount: this.recordingState.actionCount,
            stateCount: this.recordingState.stateCount,
            duration: Date.now() - this.recordingState.startTime
        };

        // Notify popup to switch to review mode
        await this.notifyPopup('RECORDING_STOPPED', reviewData);

        // Notify content scripts
        await this.notifyContentScripts('RECORDING_STOPPED');
    }

    async cancelRecording() {
        if (!this.isRecording) {
            throw new Error('Aucun enregistrement en cours');
        }

        console.log('Annulation de l\'enregistrement...');

        this.isRecording = false;

        // Nettoyer les variables de tracking
        this.pendingAction = null;
        this.lastCapturedStateId = null;

        this.resetRecordingState();

        // Update badge
        await this.updateBadge(false);

        // Notify popup
        await this.notifyPopup('RECORDING_CANCELLED');

        // Notify content scripts
        await this.notifyContentScripts('RECORDING_CANCELLED');
    }

    async saveWorkflow(metadata) {
        if (!this.dbManager.db) {
            throw new Error('Base de données non initialisée');
        }

        if (this.recordingState.actions.length === 0) {
            throw new Error('Aucune action enregistrée dans ce workflow');
        }

        console.log('💾 Sauvegarde du workflow...', metadata);

        try {
            // Créer l'objet workflow complet
            const workflow = {
                id: this.recordingState.workflowId,
                title: metadata.title,
                description: metadata.description || '',
                tags: Array.isArray(metadata.tags) ? metadata.tags :
                      (metadata.tags ? metadata.tags.split(',').map(t => t.trim()).filter(t => t) : []),
                metadata: {
                    createdAt: new Date(this.recordingState.startTime).toISOString(),
                    duration: Date.now() - this.recordingState.startTime,
                    actionCount: this.recordingState.actionCount,
                    stateCount: this.recordingState.stateCount,
                    startUrl: this.recordingState.states[0]?.url || '',
                    endUrl: this.recordingState.states[this.recordingState.states.length - 1]?.url || ''
                },
                status: 'completed'
            };

            // Sauvegarder dans IndexedDB
            await Promise.all([
                this.dbManager.saveWorkflow(workflow),
                this.dbManager.saveEtats(this.recordingState.states),
                this.dbManager.saveActions(this.recordingState.actions)
            ]);

            console.log('✅ Workflow sauvegardé avec succès:', workflow.id);

            // Reset state
            this.resetRecordingState();
            this.currentWorkflow = null;

            return workflow;

        } catch (error) {
            console.error('❌ Erreur sauvegarde workflow:', error);
            throw error;
        }
    }

    async discardWorkflow() {
        console.log('Rejet du workflow...');

        // Simply reset state without saving
        this.resetRecordingState();
        this.currentWorkflow = null;
    }

    async getWorkflowStats() {
        try {
            if (!this.dbManager.db) {
                await this.dbManager.initialize();
            }

            const stats = await this.dbManager.getStatistiques();
            return stats;
        } catch (error) {
            console.error('❌ Erreur récupération statistiques:', error);
            return {
                totalWorkflows: 0,
                totalActions: 0,
                totalEtats: 0,
                recentWorkflows: 0
            };
        }
    }

    async getWorkflows() {
        try {
            if (!this.dbManager.db) {
                await this.dbManager.initialize();
            }

            const workflows = await this.dbManager.getAllWorkflows('createdAt', 'desc');
            return workflows;
        } catch (error) {
            console.error('❌ Erreur récupération workflows:', error);
            return [];
        }
    }

    async deleteWorkflow(workflowId) {
        try {
            if (!this.dbManager.db) {
                await this.dbManager.initialize();
            }

            await this.dbManager.deleteWorkflow(workflowId);
            console.log('✅ Workflow supprimé:', workflowId);
        } catch (error) {
            console.error('❌ Erreur suppression workflow:', error);
            throw error;
        }
    }

    handleActionCaptured(actionData) {
        if (!this.isRecording) return;

        // Enrichir les données d'action
        const enrichedAction = {
            ...actionData,
            id: this.generateUUID(),
            workflowId: this.recordingState.workflowId,
            timestamp: Date.now(),
            sequenceNumber: this.recordingState.actionCount + 1,

            // Lier au state actuel (avant l'action)
            etatAvantId: this.lastCapturedStateId || null
        };

        // Logs spécialisés selon le type d'action
        this.logAction(enrichedAction);

        // Stocker l'action en attente au lieu de l'ajouter immédiatement
        // Elle sera ajoutée quand le state suivant sera capturé
        this.pendingAction = enrichedAction;
        this.recordingState.actionCount++;

        // Notify popup to update counter
        this.notifyPopup('ACTION_CAPTURED', {
            actionCount: this.recordingState.actionCount,
            lastAction: {
                type: enrichedAction.type,
                element: enrichedAction.target?.tagName,
                text: enrichedAction.target?.textContent?.slice(0, 20)
            }
        });
    }

    handleStateCaptured(stateData) {
        if (!this.isRecording) return;

        // Vérifier si cet état est différent du précédent (éviter doublons)
        const lastState = this.recordingState.states[this.recordingState.states.length - 1];
        if (lastState && lastState.contentHash === stateData.contentHash) {
            console.log('📋 État identique ignoré (hash:', stateData.contentHash?.slice(0, 8) + ')');

            // Si state identique, ajouter quand même l'action pendante
            // (cas où action ne change pas le contenu visible)
            if (this.pendingAction) {
                this.pendingAction.etatApresId = lastState.id; // Référence au state existant
                this.recordingState.actions.push(this.pendingAction);
                console.log('⚡ Action ajoutée (state inchangé):', this.pendingAction.type);
                this.pendingAction = null;
            }
            return;
        }

        const enrichedState = {
            ...stateData,
            id: this.generateUUID(),
            workflowId: this.recordingState.workflowId,
            timestamp: Date.now(),
            sequenceNumber: this.recordingState.stateCount + 1
        };

        console.log('📊 État capturé:', {
            url: enrichedState.urlPattern || enrichedState.url,
            title: enrichedState.title?.slice(0, 30) + '...',
            interactiveCount: enrichedState.interactiveElements?.length || 'N/A',
            markdownLength: enrichedState.markdownContent?.length || 0,
            hash: enrichedState.contentHash?.slice(0, 8) + '...',
            sequenceNumber: enrichedState.sequenceNumber
        });

        // Si action pendante, la lier au nouveau state
        if (this.pendingAction) {
            this.pendingAction.etatApresId = enrichedState.id;
            this.recordingState.actions.push(this.pendingAction);
            console.log('⚡ Action liée:', {
                actionType: this.pendingAction.type,
                etatAvant: this.pendingAction.etatAvantId?.slice(0, 8),
                etatApres: this.pendingAction.etatApresId?.slice(0, 8)
            });
            this.pendingAction = null;
        }

        this.recordingState.states.push(enrichedState);
        this.recordingState.stateCount++;

        // Mettre à jour le dernier state capturé
        this.lastCapturedStateId = enrichedState.id;

        // Notify popup to update counter
        this.notifyPopup('STATE_CAPTURED', {
            stateCount: this.recordingState.stateCount,
            lastState: {
                title: enrichedState.title?.slice(0, 20),
                url: enrichedState.urlPattern || enrichedState.url
            }
        });
    }

    async captureInitialState() {
        try {
            // Get current active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return;

            const tab = tabs[0];

            // Inject content script if needed and capture initial state
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // This will trigger the content script to capture initial state
                    if (window.workflowRecorder) {
                        console.log('capture navigation state 2');

                        window.workflowRecorder.captureCurrentState();
                    }
                }
            });
        } catch (error) {
            console.error('Erreur lors de la capture d\'état initial:', error);
        }
    }

    async updateBadge(isRecording) {
        try {
            if (isRecording) {
                await chrome.action.setBadgeText({ text: 'REC' });
                await chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
            } else {
                await chrome.action.setBadgeText({ text: '' });
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour du badge:', error);
        }
    }

    async notifyPopup(type, data = null) {
        try {
            await chrome.runtime.sendMessage({
                type,
                data,
                timestamp: Date.now()
            });
        } catch (error) {
            // Popup might not be open, ignore error
            console.debug('Popup non disponible:', error.message);
        }
    }

    async notifyContentScripts(type, data = null) {
        try {
            const tabs = await chrome.tabs.query({});

            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type,
                        data,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    // Content script might not be loaded, ignore error
                    console.debug(`Content script non disponible pour l'onglet ${tab.id}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Erreur lors de la notification des content scripts:', error);
        }
    }

    async saveToStorage(workflow) {
        try {
            // Save workflow metadata to chrome.storage
            const key = `workflow_${workflow.id}`;
            await chrome.storage.local.set({ [key]: workflow });

            // Update workflow list
            const result = await chrome.storage.local.get(['workflow_list']);
            const workflowList = result.workflow_list || [];

            if (!workflowList.includes(workflow.id)) {
                workflowList.push(workflow.id);
                await chrome.storage.local.set({ workflow_list: workflowList });
            }

            console.log('Workflow sauvegardé:', workflow.id);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            throw error;
        }
    }

    resetRecordingState() {
        this.recordingState = {
            workflowId: null,
            startTime: null,
            actions: [],
            states: [],
            actionCount: 0,
            stateCount: 0
        };
    }

    logAction(action) {
        const icons = {
            click: '🖱️',
            input: '⌨️',
            change: '🔄',
            submit: '📤',
            navigation: '🧭'
        };

        const icon = icons[action.type] || '❓';

        switch (action.type) {
            case 'click':
                console.log(`${icon} Clic sur ${action.target?.tagName}: "${action.target?.textContent?.slice(0, 30)}" [#${action.sequenceNumber}]`);
                break;

            case 'input':
                console.log(`${icon} Saisie dans ${action.target?.inputType}: "${action.target?.label}" (${action.target?.valueType}, ${action.target?.valueLength} caractères) [#${action.sequenceNumber}]`);
                break;

            case 'change':
                if (action.target?.selectDetails) {
                    console.log(`${icon} Sélection: "${action.target.selectDetails.selectedText}" dans ${action.target.tagName} [#${action.sequenceNumber}]`);
                } else if (action.target?.checkboxDetails) {
                    console.log(`${icon} Checkbox ${action.target.checkboxDetails.isChecked ? 'cochée' : 'décochée'}: "${action.target.name}" [#${action.sequenceNumber}]`);
                } else if (action.target?.radioDetails) {
                    console.log(`${icon} Radio sélectionné: "${action.target.radioDetails.value}" (${action.target.radioDetails.groupName}) [#${action.sequenceNumber}]`);
                }
                break;

            case 'submit':
                console.log(`${icon} Formulaire soumis: ${action.target?.id || 'sans ID'} (${action.submitDetails?.fieldsCount} champs) [#${action.sequenceNumber}]`);
                break;

            case 'navigation':
                const from = action.navigationDetails?.from?.pathname || '';
                const to = action.navigationDetails?.to?.pathname || 'externe';
                console.log(`${icon} Navigation: ${from} → ${to} (${action.navigationDetails?.navigationType}) [#${action.sequenceNumber}]`);
                break;

            default:
                console.log(`${icon} Action ${action.type}: ${JSON.stringify(action.target)} [#${action.sequenceNumber}]`);
        }
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// Initialize the service worker
const workflowRecorder = new WorkflowRecorder();
