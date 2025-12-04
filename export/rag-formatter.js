// Formatage spécifique RAG pour systèmes d'IA et LLM - Workflow Recorder Phase 6
class RagFormatter {
    constructor() {
        this.chunkMaxLength = 512; // Taille optimale pour embedding
        this.overlapLength = 50; // Chevauchement entre chunks
        this.contextWindow = 3; // Nombre d'actions pour le contexte
    }

    async format(workflowData, options = {}) {
        try {
            console.log('🤖 Formatage RAG pour workflow:', workflowData.workflow.title);

            const ragData = {
                metadata: this.generateMetadata(workflowData),
                instructions: this.generateInstructions(workflowData),
                chunks: this.generateChunks(workflowData, options),
                embeddings: this.prepareEmbeddings(workflowData),
                knowledge_base: this.generateKnowledgeBase(workflowData),
                training_data: this.generateTrainingData(workflowData)
            };

            return {
                filename: `workflow-rag-${workflowData.workflow.id}-${this.getTimestamp()}.json`,
                content: JSON.stringify(ragData, null, 2),
                mimeType: 'application/json'
            };

        } catch (error) {
            console.error('❌ Erreur formatage RAG:', error);
            throw error;
        }
    }

    generateMetadata(workflowData) {
        const workflow = workflowData.workflow;
        const actions = workflowData.actions || [];
        const states = workflowData.etats || [];

        return {
            workflow_id: workflow.id,
            title: workflow.title,
            description: workflow.description || '',
            tags: workflow.tags || [],
            created_at: workflow.metadata.createdAt,
            domain: this.extractDomain(states),
            complexity: this.calculateComplexity(actions, states),
            duration_seconds: Math.round((workflow.metadata.duration || 0) / 1000),
            total_steps: actions.length,
            unique_pages: this.countUniquePages(states),
            interaction_types: this.getInteractionTypes(actions),
            rag_version: '1.0.0',
            optimized_for: ['training', 'embedding', 'retrieval', 'generation']
        };
    }

    generateInstructions(workflowData) {
        const workflow = workflowData.workflow;
        const actions = workflowData.actions || [];

        return {
            title: `Comment ${workflow.title}`,
            objective: workflow.description || `Procédure pour ${workflow.title}`,
            prerequisites: this.extractPrerequisites(workflowData),
            steps: actions.map((action, index) => this.formatActionInstruction(action, index)),
            success_criteria: this.generateSuccessCriteria(workflowData),
            troubleshooting: this.generateTroubleshooting(actions)
        };
    }

    generateChunks(workflowData, options) {
        const actions = workflowData.actions || [];
        const states = workflowData.etats || [];
        const chunks = [];

        // Chunk 1: Introduction et contexte
        chunks.push({
            chunk_id: 1,
            type: 'introduction',
            title: `Introduction: ${workflowData.workflow.title}`,
            content: this.generateIntroductionChunk(workflowData),
            keywords: ['introduction', 'objectif', 'contexte'],
            embedding_ready: true,
            relevance_score: 1.0
        });

        // Chunks des étapes (groupées par contexte)
        const actionGroups = this.groupActionsByContext(actions, states);
        actionGroups.forEach((group, index) => {
            chunks.push({
                chunk_id: index + 2,
                type: 'procedure_step',
                title: group.title,
                content: this.generateStepChunk(group),
                keywords: group.keywords,
                actions_ids: group.actions.map(a => a.id),
                state_context: group.stateContext,
                embedding_ready: true,
                relevance_score: this.calculateRelevanceScore(group)
            });
        });

        // Chunk de conclusion
        chunks.push({
            chunk_id: chunks.length + 1,
            type: 'conclusion',
            title: `Validation: ${workflowData.workflow.title}`,
            content: this.generateConclusionChunk(workflowData),
            keywords: ['validation', 'vérification', 'résultat'],
            embedding_ready: true,
            relevance_score: 0.9
        });

        return chunks;
    }

    prepareEmbeddings(workflowData) {
        return {
            texts_for_embedding: this.extractTextsForEmbedding(workflowData),
            semantic_search_data: this.prepareSemanticSearchData(workflowData),
            vector_store_ready: true,
            embedding_model_suggestions: ['text-embedding-3-small', 'all-MiniLM-L6-v2'],
            chunk_strategy: 'semantic_with_overlap'
        };
    }

    generateKnowledgeBase(workflowData) {
        return {
            domain_knowledge: this.extractDomainKnowledge(workflowData),
            ui_elements: this.catalogUIElements(workflowData),
            interaction_patterns: this.identifyInteractionPatterns(workflowData),
            user_paths: this.mapUserPaths(workflowData),
            error_handling: this.extractErrorHandling(workflowData)
        };
    }

    generateTrainingData(workflowData) {
        const actions = workflowData.actions || [];
        
        return {
            question_answer_pairs: this.generateQAPairs(workflowData),
            intent_classification: this.generateIntentData(actions),
            entity_extraction: this.generateEntityData(workflowData),
            conversation_flows: this.generateConversationFlows(workflowData)
        };
    }

    // === MÉTHODES UTILITAIRES ===

    generateIntroductionChunk(workflowData) {
        const workflow = workflowData.workflow;
        return `
## ${workflow.title}

**Objectif:** ${workflow.description || 'Procédure utilisateur documentée automatiquement'}

**Contexte:** Cette procédure a été capturée automatiquement et comprend ${workflowData.actions.length} étapes d'interaction utilisateur sur ${this.countUniquePages(workflowData.etats)} page(s) différente(s).

**Prérequis:** ${this.extractPrerequisites(workflowData).join(', ') || 'Aucun prérequis spécifique'}

**Durée estimée:** ${Math.round((workflow.metadata.duration || 0) / 60000)} minutes

**Tags:** ${workflow.tags ? workflow.tags.join(', ') : 'Non spécifié'}
        `.trim();
    }

    groupActionsByContext(actions, states) {
        const groups = [];
        let currentGroup = null;
        let currentPage = null;

        actions.forEach((action, index) => {
            const actionPage = this.getPageForAction(action, states);
            
            // Nouveau groupe si changement de page ou tous les 5 actions
            if (!currentGroup || actionPage !== currentPage || currentGroup.actions.length >= 5) {
                if (currentGroup) {
                    groups.push(this.finalizeGroup(currentGroup));
                }
                
                currentGroup = {
                    actions: [],
                    page: actionPage,
                    startIndex: index
                };
                currentPage = actionPage;
            }
            
            currentGroup.actions.push(action);
        });

        if (currentGroup) {
            groups.push(this.finalizeGroup(currentGroup));
        }

        return groups;
    }

    finalizeGroup(group) {
        return {
            title: this.generateGroupTitle(group),
            actions: group.actions,
            keywords: this.extractGroupKeywords(group),
            stateContext: group.page,
            actionTypes: [...new Set(group.actions.map(a => a.type))]
        };
    }

    generateStepChunk(group) {
        let content = `## ${group.title}\n\n`;
        
        if (group.stateContext) {
            content += `**Page:** ${group.stateContext.title || group.stateContext.urlPattern}\n\n`;
        }

        content += '**Étapes:**\n';
        group.actions.forEach((action, index) => {
            content += `${index + 1}. ${this.formatActionForChunk(action)}\n`;
        });

        return content.trim();
    }

    formatActionInstruction(action, index) {
        return {
            sequence: index + 1,
            type: action.type,
            description: this.formatActionForChunk(action),
            target: {
                element: action.target?.tagName || 'unknown',
                selector: this.getElementSelector(action.target),
                text: action.target?.textContent?.slice(0, 50) || '',
                id: action.target?.id || null,
                name: action.target?.name || null
            },
            timestamp: action.timestamp
        };
    }

    formatActionForChunk(action) {
        switch (action.type) {
            case 'click':
                return `Cliquer sur "${action.target?.textContent || action.target?.tagName}" ${this.getElementSelector(action.target)}`;

            case 'input':
                return `Saisir dans le champ "${action.target?.label || action.target?.placeholder}" (${action.target?.inputType})`;

            case 'change':
                if (action.target?.selectDetails) {
                    return `Sélectionner "${action.target.selectDetails.selectedText}" dans la liste déroulante`;
                } else if (action.target?.checkboxDetails) {
                    return `${action.target.checkboxDetails.isChecked ? 'Cocher' : 'Décocher'} la case "${action.target.name}"`;
                }
                return `Modifier la sélection dans ${action.target?.tagName}`;

            case 'submit':
                return `Valider le formulaire ${action.target?.id ? `"${action.target.id}"` : ''}`;

            case 'navigation':
                return `Naviguer vers ${action.navigationDetails?.to?.pathname || 'une nouvelle page'}`;

            default:
                return `Effectuer l'action: ${action.type}`;
        }
    }

    generateQAPairs(workflowData) {
        const workflow = workflowData.workflow;
        const actions = workflowData.actions || [];
        
        const pairs = [];
        
        // Question générale
        pairs.push({
            question: `Comment ${workflow.title.toLowerCase()} ?`,
            answer: this.generateIntroductionChunk(workflowData),
            context: 'general_procedure'
        });

        // Questions spécifiques par étape
        actions.forEach((action, index) => {
            const question = this.generateQuestionForAction(action, index);
            const answer = this.formatActionForChunk(action);
            
            pairs.push({
                question,
                answer,
                context: `step_${index + 1}`,
                action_type: action.type
            });
        });

        return pairs;
    }

    generateQuestionForAction(action, index) {
        switch (action.type) {
            case 'click':
                return `Étape ${index + 1}: Où dois-je cliquer ?`;
            case 'input':
                return `Étape ${index + 1}: Que dois-je saisir ?`;
            case 'change':
                return `Étape ${index + 1}: Que dois-je sélectionner ?`;
            case 'submit':
                return `Étape ${index + 1}: Comment valider ?`;
            case 'navigation':
                return `Étape ${index + 1}: Vers quelle page naviguer ?`;
            default:
                return `Étape ${index + 1}: Quelle action effectuer ?`;
        }
    }

    extractTextsForEmbedding(workflowData) {
        const texts = [];
        
        // Titre et description
        texts.push(workflowData.workflow.title);
        if (workflowData.workflow.description) {
            texts.push(workflowData.workflow.description);
        }

        // Contenu des pages
        workflowData.etats.forEach(state => {
            if (state.markdownContent) {
                texts.push(state.markdownContent.slice(0, 1000)); // Limiter pour l'embedding
            }
            if (state.title) {
                texts.push(state.title);
            }
        });

        // Instructions des actions
        workflowData.actions.forEach(action => {
            texts.push(this.formatActionForChunk(action));
        });

        return texts.filter(text => text && text.length > 10);
    }

    // === MÉTHODES D'ANALYSE ===

    extractDomain(states) {
        if (!states || states.length === 0) return 'unknown';
        
        try {
            const url = new URL(states[0].url);
            return url.hostname;
        } catch {
            return 'local';
        }
    }

    calculateComplexity(actions, states) {
        const factors = {
            action_count: actions.length,
            unique_pages: this.countUniquePages(states),
            interaction_types: new Set(actions.map(a => a.type)).size,
            form_interactions: actions.filter(a => ['input', 'submit', 'change'].includes(a.type)).length
        };

        let score = 0;
        if (factors.action_count > 20) score += 2;
        else if (factors.action_count > 10) score += 1;
        
        if (factors.unique_pages > 3) score += 2;
        else if (factors.unique_pages > 1) score += 1;
        
        score += factors.interaction_types;
        
        if (factors.form_interactions > 5) score += 2;

        if (score <= 3) return 'simple';
        if (score <= 7) return 'medium';
        return 'complex';
    }

    countUniquePages(states) {
        if (!states) return 0;
        const uniqueUrls = new Set(states.map(s => s.urlPattern || s.url));
        return uniqueUrls.size;
    }

    getInteractionTypes(actions) {
        return [...new Set(actions.map(a => a.type))];
    }

    extractPrerequisites(workflowData) {
        const prereqs = [];
        
        // Analyser les premiers états pour détecter des prérequis
        const firstState = workflowData.etats?.[0];
        if (firstState) {
            if (firstState.title?.includes('login') || firstState.title?.includes('connexion')) {
                prereqs.push('Être connecté au système');
            }
            if (firstState.url?.includes('admin')) {
                prereqs.push('Avoir des droits administrateur');
            }
        }

        // Analyser les actions pour d'autres prérequis
        const hasFormInputs = workflowData.actions.some(a => a.type === 'input');
        if (hasFormInputs) {
            prereqs.push('Avoir les informations nécessaires à saisir');
        }

        return prereqs;
    }

    getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    }

    generateGroupTitle(group) {
        const page = group.page?.title || group.page?.urlPattern || 'Page';
        const actionTypes = [...new Set(group.actions.map(a => a.type))];
        
        if (actionTypes.includes('navigation')) return `Navigation vers ${page}`;
        if (actionTypes.includes('submit')) return `Validation sur ${page}`;
        if (actionTypes.includes('input')) return `Saisie sur ${page}`;
        if (actionTypes.includes('click')) return `Interactions sur ${page}`;
        
        return `Actions sur ${page}`;
    }

    extractGroupKeywords(group) {
        const keywords = new Set();
        
        group.actions.forEach(action => {
            keywords.add(action.type);
            if (action.target?.tagName) keywords.add(action.target.tagName.toLowerCase());
            if (action.target?.textContent) {
                // Extraire des mots-clés du contenu textuel
                const words = action.target.textContent.toLowerCase().match(/\b\w{3,}\b/g) || [];
                words.forEach(word => keywords.add(word));
            }
        });

        return Array.from(keywords).slice(0, 10); // Limiter le nombre de mots-clés
    }

    getPageForAction(action, states) {
        // Trouver l'état de page correspondant à cette action
        const actionTime = action.timestamp;
        let closestState = null;
        let minDiff = Infinity;

        states.forEach(state => {
            const stateDiff = Math.abs(state.timestamp - actionTime);
            if (stateDiff < minDiff) {
                minDiff = stateDiff;
                closestState = state;
            }
        });

        return closestState;
    }

    getElementSelector(target) {
        if (!target) return '';
        
        const selectors = [];
        if (target.id) selectors.push(`#${target.id}`);
        if (target.className) selectors.push(`.${target.className.split(' ')[0]}`);
        if (target.tagName) selectors.push(target.tagName.toLowerCase());
        
        return selectors.length > 0 ? `(${selectors.join(', ')})` : '';
    }

    // Méthodes simplifiées pour les fonctionnalités avancées
    generateSuccessCriteria(workflowData) {
        return ['Toutes les étapes sont complétées', 'Aucun message d\'erreur affiché'];
    }

    generateTroubleshooting(actions) {
        return ['Vérifier que tous les champs requis sont remplis', 'S\'assurer d\'avoir les permissions nécessaires'];
    }

    generateConclusionChunk(workflowData) {
        return `## Validation de la procédure\n\nLa procédure "${workflowData.workflow.title}" est maintenant terminée. Vérifiez que le résultat attendu est atteint.`;
    }

    calculateRelevanceScore(group) {
        // Score basé sur le nombre d'actions et la diversité
        let score = Math.min(group.actions.length / 10, 1.0);
        score += Math.min(group.actionTypes.length / 5, 0.3);
        return Math.min(score, 1.0);
    }

    // Méthodes de base pour les fonctionnalités avancées (à développer)
    extractDomainKnowledge() { return {}; }
    catalogUIElements() { return {}; }
    identifyInteractionPatterns() { return {}; }
    mapUserPaths() { return {}; }
    extractErrorHandling() { return {}; }
    generateIntentData() { return {}; }
    generateEntityData() { return {}; }
    generateConversationFlows() { return {}; }
    prepareSemanticSearchData() { return {}; }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RagFormatter;
} else if (typeof window !== 'undefined') {
    window.RagFormatter = RagFormatter;
}