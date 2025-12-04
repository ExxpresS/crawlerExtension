// Gestionnaire de base de données IndexedDB pour Workflow Recorder
class WorkflowDBManager {
    constructor() {
        this.dbName = 'WorkflowRecorderDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            console.log('🗄️ Initialisation IndexedDB...');
            
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('❌ Erreur ouverture IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialisée avec succès');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('⬆️ Mise à jour schema IndexedDB...');
                const db = event.target.result;
                this.createSchema(db);
            };
        });
    }

    createSchema(db) {
        // Table WORKFLOW
        if (!db.objectStoreNames.contains('workflows')) {
            const workflowStore = db.createObjectStore('workflows', { keyPath: 'id' });
            
            // Index sur titre pour recherche
            workflowStore.createIndex('title', 'title', { unique: false });
            
            // Index sur date de création pour tri
            workflowStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });
            
            // Index sur tags pour filtrage
            workflowStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            
            // Index sur statut
            workflowStore.createIndex('status', 'status', { unique: false });
            
            console.log('📊 Table workflows créée');
        }

        // Table ETAT
        if (!db.objectStoreNames.contains('etats')) {
            const etatStore = db.createObjectStore('etats', { keyPath: 'id' });
            
            // Index sur workflow_id pour récupération par workflow
            etatStore.createIndex('workflowId', 'workflowId', { unique: false });
            
            // Index sur URL pattern pour trouver des états similaires
            etatStore.createIndex('urlPattern', 'urlPattern', { unique: false });
            
            // Index sur timestamp pour tri chronologique
            etatStore.createIndex('timestamp', 'timestamp', { unique: false });
            
            // Index sur hash pour déduplication
            etatStore.createIndex('contentHash', 'contentHash', { unique: false });
            
            console.log('📄 Table etats créée');
        }

        // Table ACTION
        if (!db.objectStoreNames.contains('actions')) {
            const actionStore = db.createObjectStore('actions', { keyPath: 'id' });
            
            // Index sur workflow_id pour récupération par workflow
            actionStore.createIndex('workflowId', 'workflowId', { unique: false });
            
            // Index sur type d'action pour filtrage
            actionStore.createIndex('type', 'type', { unique: false });
            
            // Index sur timestamp pour tri chronologique
            actionStore.createIndex('timestamp', 'timestamp', { unique: false });
            
            // Index sur etat_avant_id pour navigation
            actionStore.createIndex('etatAvantId', 'etatAvantId', { unique: false });
            
            // Index sur sequence pour ordre
            actionStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: false });
            
            console.log('⚡ Table actions créée');
        }
    }

    // === OPERATIONS SUR LES WORKFLOWS ===

    async saveWorkflow(workflowData) {
        try {
            console.log('💾 Sauvegarde workflow:', workflowData.title);
            
            const transaction = this.db.transaction(['workflows'], 'readwrite');
            const store = transaction.objectStore('workflows');
            
            // Enrichir avec métadonnées de sauvegarde
            const enrichedWorkflow = {
                ...workflowData,
                savedAt: new Date().toISOString(),
                version: 1
            };
            
            await this.promisifyRequest(store.put(enrichedWorkflow));
            
            console.log('✅ Workflow sauvegardé:', enrichedWorkflow.id);
            return enrichedWorkflow;
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde workflow:', error);
            throw error;
        }
    }

    async getWorkflowById(id) {
        try {
            const transaction = this.db.transaction(['workflows'], 'readonly');
            const store = transaction.objectStore('workflows');
            const workflow = await this.promisifyRequest(store.get(id));
            
            return workflow;
        } catch (error) {
            console.error('❌ Erreur récupération workflow:', error);
            throw error;
        }
    }

    async getAllWorkflows(sortBy = 'createdAt', order = 'desc') {
        try {
            const transaction = this.db.transaction(['workflows'], 'readonly');
            const store = transaction.objectStore('workflows');
            
            let cursor;
            if (sortBy === 'title') {
                cursor = store.index('title').openCursor();
            } else if (sortBy === 'createdAt') {
                cursor = store.index('createdAt').openCursor(null, order === 'desc' ? 'prev' : 'next');
            } else {
                cursor = store.openCursor();
            }
            
            const workflows = [];
            
            return new Promise((resolve, reject) => {
                cursor.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        workflows.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(workflows);
                    }
                };
                
                cursor.onerror = () => reject(cursor.error);
            });
            
        } catch (error) {
            console.error('❌ Erreur récupération workflows:', error);
            throw error;
        }
    }

    async searchWorkflows(query, options = {}) {
        try {
            const allWorkflows = await this.getAllWorkflows();
            const lowercaseQuery = query.toLowerCase();
            
            const filtered = allWorkflows.filter(workflow => {
                // Recherche dans le titre
                if (workflow.title && workflow.title.toLowerCase().includes(lowercaseQuery)) {
                    return true;
                }
                
                // Recherche dans la description
                if (workflow.description && workflow.description.toLowerCase().includes(lowercaseQuery)) {
                    return true;
                }
                
                // Recherche dans les tags
                if (workflow.tags && workflow.tags.some(tag => 
                    tag.toLowerCase().includes(lowercaseQuery)
                )) {
                    return true;
                }
                
                return false;
            });
            
            return filtered;
        } catch (error) {
            console.error('❌ Erreur recherche workflows:', error);
            throw error;
        }
    }

    async deleteWorkflow(id) {
        try {
            console.log('🗑️ Suppression workflow:', id);
            
            const transaction = this.db.transaction(['workflows', 'etats', 'actions'], 'readwrite');
            
            // Supprimer le workflow
            const workflowStore = transaction.objectStore('workflows');
            await this.promisifyRequest(workflowStore.delete(id));
            
            // Supprimer tous les états liés
            const etatStore = transaction.objectStore('etats');
            const etatIndex = etatStore.index('workflowId');
            const etatCursor = etatIndex.openCursor(IDBKeyRange.only(id));
            
            const etatDeletePromises = [];
            etatCursor.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    etatDeletePromises.push(this.promisifyRequest(cursor.delete()));
                    cursor.continue();
                }
            };
            
            // Supprimer toutes les actions liées
            const actionStore = transaction.objectStore('actions');
            const actionIndex = actionStore.index('workflowId');
            const actionCursor = actionIndex.openCursor(IDBKeyRange.only(id));
            
            const actionDeletePromises = [];
            actionCursor.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    actionDeletePromises.push(this.promisifyRequest(cursor.delete()));
                    cursor.continue();
                }
            };
            
            // Attendre toutes les suppressions
            await Promise.all([...etatDeletePromises, ...actionDeletePromises]);
            
            console.log('✅ Workflow et données liées supprimés:', id);
            
        } catch (error) {
            console.error('❌ Erreur suppression workflow:', error);
            throw error;
        }
    }

    // === OPERATIONS SUR LES ETATS ===

    async saveEtats(etats) {
        try {
            console.log(`💾 Sauvegarde ${etats.length} états...`);
            
            const transaction = this.db.transaction(['etats'], 'readwrite');
            const store = transaction.objectStore('etats');
            
            const promises = etats.map(etat => 
                this.promisifyRequest(store.put(etat))
            );
            
            await Promise.all(promises);
            console.log('✅ États sauvegardés');
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde états:', error);
            throw error;
        }
    }

    async getEtatsByWorkflow(workflowId) {
        try {
            const transaction = this.db.transaction(['etats'], 'readonly');
            const store = transaction.objectStore('etats');
            const index = store.index('workflowId');
            
            const etats = [];
            
            return new Promise((resolve, reject) => {
                const cursor = index.openCursor(IDBKeyRange.only(workflowId));
                
                cursor.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        etats.push(cursor.value);
                        cursor.continue();
                    } else {
                        // Trier par sequence number
                        etats.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                        resolve(etats);
                    }
                };
                
                cursor.onerror = () => reject(cursor.error);
            });
            
        } catch (error) {
            console.error('❌ Erreur récupération états:', error);
            throw error;
        }
    }

    // === OPERATIONS SUR LES ACTIONS ===

    async saveActions(actions) {
        try {
            console.log(`💾 Sauvegarde ${actions.length} actions...`);
            
            const transaction = this.db.transaction(['actions'], 'readwrite');
            const store = transaction.objectStore('actions');
            
            const promises = actions.map(action => 
                this.promisifyRequest(store.put(action))
            );
            
            await Promise.all(promises);
            console.log('✅ Actions sauvegardées');
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde actions:', error);
            throw error;
        }
    }

    async getActionsByWorkflow(workflowId) {
        try {
            const transaction = this.db.transaction(['actions'], 'readonly');
            const store = transaction.objectStore('actions');
            const index = store.index('workflowId');
            
            const actions = [];
            
            return new Promise((resolve, reject) => {
                const cursor = index.openCursor(IDBKeyRange.only(workflowId));
                
                cursor.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        actions.push(cursor.value);
                        cursor.continue();
                    } else {
                        // Trier par sequence number
                        actions.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                        resolve(actions);
                    }
                };
                
                cursor.onerror = () => reject(cursor.error);
            });
            
        } catch (error) {
            console.error('❌ Erreur récupération actions:', error);
            throw error;
        }
    }

    // === OPERATIONS AVANCEES ===

    async getWorkflowComplete(workflowId) {
        try {
            const [workflow, etats, actions] = await Promise.all([
                this.getWorkflowById(workflowId),
                this.getEtatsByWorkflow(workflowId),
                this.getActionsByWorkflow(workflowId)
            ]);
            
            if (!workflow) {
                throw new Error(`Workflow ${workflowId} non trouvé`);
            }
            
            return {
                workflow,
                etats,
                actions
            };
            
        } catch (error) {
            console.error('❌ Erreur récupération workflow complet:', error);
            throw error;
        }
    }

    async getStatistiques() {
        try {
            const [workflows, etats, actions] = await Promise.all([
                this.getAllWorkflows(),
                this.getAllFromStore('etats'),
                this.getAllFromStore('actions')
            ]);
            
            const stats = {
                totalWorkflows: workflows.length,
                totalEtats: etats.length,
                totalActions: actions.length,
                
                // Statistiques par type d'action
                actionsByType: {},
                
                // Workflows récents (derniers 7 jours)
                recentWorkflows: 0,
                
                // Workflow le plus long
                longestWorkflow: null,
                
                // Tags les plus populaires
                popularTags: {}
            };
            
            // Analyser les types d'actions
            actions.forEach(action => {
                stats.actionsByType[action.type] = (stats.actionsByType[action.type] || 0) + 1;
            });
            
            // Analyser les workflows récents
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            workflows.forEach(workflow => {
                const createdAt = new Date(workflow.metadata?.createdAt);
                if (createdAt >= weekAgo) {
                    stats.recentWorkflows++;
                }
                
                // Trouver le workflow le plus long
                if (!stats.longestWorkflow || 
                    (workflow.metadata?.actionCount || 0) > (stats.longestWorkflow.metadata?.actionCount || 0)) {
                    stats.longestWorkflow = workflow;
                }
                
                // Compter les tags populaires
                if (workflow.tags) {
                    workflow.tags.forEach(tag => {
                        stats.popularTags[tag] = (stats.popularTags[tag] || 0) + 1;
                    });
                }
            });
            
            return stats;
            
        } catch (error) {
            console.error('❌ Erreur calcul statistiques:', error);
            throw error;
        }
    }

    async exportAllData() {
        try {
            console.log('📤 Export de toutes les données...');
            
            const [workflows, etats, actions] = await Promise.all([
                this.getAllFromStore('workflows'),
                this.getAllFromStore('etats'),
                this.getAllFromStore('actions')
            ]);
            
            const exportData = {
                version: this.dbVersion,
                exportedAt: new Date().toISOString(),
                data: {
                    workflows,
                    etats,
                    actions
                },
                statistics: await this.getStatistiques()
            };
            
            console.log('✅ Export terminé:', exportData.data.workflows.length, 'workflows');
            return exportData;
            
        } catch (error) {
            console.error('❌ Erreur export données:', error);
            throw error;
        }
    }

    // === UTILITAIRES ===

    async getAllFromStore(storeName) {
        try {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            return await this.promisifyRequest(store.getAll());
        } catch (error) {
            console.error(`❌ Erreur récupération ${storeName}:`, error);
            throw error;
        }
    }

    promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllData() {
        try {
            console.log('🗑️ Suppression de toutes les données...');
            
            const transaction = this.db.transaction(['workflows', 'etats', 'actions'], 'readwrite');
            
            await Promise.all([
                this.promisifyRequest(transaction.objectStore('workflows').clear()),
                this.promisifyRequest(transaction.objectStore('etats').clear()),
                this.promisifyRequest(transaction.objectStore('actions').clear())
            ]);
            
            console.log('✅ Toutes les données supprimées');
            
        } catch (error) {
            console.error('❌ Erreur suppression données:', error);
            throw error;
        }
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('🔒 IndexedDB fermée');
        }
    }
}

// Export pour utilisation dans le service worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkflowDBManager;
} else if (typeof window !== 'undefined') {
    window.WorkflowDBManager = WorkflowDBManager;
}