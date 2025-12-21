// JsonFormatter - Classe dédiée au formatage et optimisation des exports JSON
// Extrait tous les traitements post-génération JSON

class JsonFormatter {
    constructor() {
        this.diffService = new MarkdownDiffService();
    }

    async format(workflowData, options = {}) {
        const formatted = {
            workflow: workflowData.workflow,
            states: workflowData.etats || [],
            actions: workflowData.actions || [],
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };

        // 1. Extraire les éléments de layout communs à tous les states
        const { layoutElements, cleanedStates } = this.extractLayoutElements(formatted.states);

        // 2. Extraire le markdown layout commun
        const { commonLayout, statesWithDiff } = this.extractMarkdownLayout(cleanedStates);

        // Ajouter les éléments de layout au workflow
        if (layoutElements.length > 0) {
            formatted.workflow.layoutElements = layoutElements;
        }

        // Ajouter le markdown layout commun au workflow
        if (commonLayout) {
            formatted.workflow.markdownLayout = commonLayout;
        }

        // Remplacer les states avec les versions optimisées
        formatted.states = statesWithDiff;

        return {
            filename: `workflow-${workflowData.workflow.id}-${this.getTimestamp()}.json`,
            content: JSON.stringify(formatted, null, options.pretty ? 2 : 0),
            mimeType: 'application/json'
        };
    }

    /**
     * Extrait les éléments interactifs communs à tous les states (navigation, header, footer, etc.)
     */
    extractLayoutElements(states) {
        if (!states || states.length === 0) {
            return { layoutElements: [], cleanedStates: states };
        }

        // Si un seul state, pas de layout à extraire
        if (states.length === 1) {
            return { layoutElements: [], cleanedStates: states };
        }

        // Créer une map des éléments par fingerprint pour chaque state
        const stateElementMaps = states.map(state => {
            const elementMap = new Map();
            const interactiveElements = state.interactiveElements || [];

            interactiveElements.forEach(element => {
                const fingerprint = this.getElementFingerprint(element);
                elementMap.set(fingerprint, element);
            });

            return elementMap;
        });

        // Trouver les fingerprints présents dans TOUS les states
        const firstStateMap = stateElementMaps[0];
        const commonFingerprints = new Set();

        firstStateMap.forEach((element, fingerprint) => {
            // Vérifier si ce fingerprint existe dans tous les autres states
            const isInAllStates = stateElementMaps.slice(1).every(stateMap =>
                stateMap.has(fingerprint)
            );

            if (isInAllStates) {
                commonFingerprints.add(fingerprint);
            }
        });

        // Extraire les éléments de layout (utiliser ceux du premier state comme référence)
        const layoutElements = [];
        commonFingerprints.forEach(fingerprint => {
            const element = firstStateMap.get(fingerprint);
            if (element) {
                layoutElements.push(element);
            }
        });

        // Nettoyer les states en retirant les éléments de layout
        const cleanedStates = states.map(state => {
            if (!state.interactiveElements) return state;

            const cleanedInteractiveElements = state.interactiveElements.filter(element => {
                const fingerprint = this.getElementFingerprint(element);
                return !commonFingerprints.has(fingerprint);
            });

            return {
                ...state,
                interactiveElements: cleanedInteractiveElements
            };
        });

        console.log(`🧹 Layout extraction: ${layoutElements.length} éléments communs trouvés sur ${states.length} states`);

        return { layoutElements, cleanedStates };
    }

    /**
     * Extrait le markdown layout commun et génère des diffs pour les states
     */
    extractMarkdownLayout(states) {
        if (!states || states.length === 0) {
            return { commonLayout: null, statesWithDiff: states };
        }

        // Grouper les states par URL pattern
        const statesByUrl = new Map();
        states.forEach(state => {
            const urlPattern = state.urlPattern || state.url;
            if (!statesByUrl.has(urlPattern)) {
                statesByUrl.set(urlPattern, []);
            }
            statesByUrl.get(urlPattern).push(state);
        });

        // Traiter chaque groupe d'URL
        const processedStates = [];

        statesByUrl.forEach((urlStates, urlPattern) => {
            if (urlStates.length === 1) {
                // Un seul state pour cette URL, pas de diff à faire
                processedStates.push(urlStates[0]);
            } else {
                // Plusieurs states avec la même URL
                // Le premier state conserve son contenu complet
                const firstState = urlStates[0];

                // Extraire le layout commun (sections qui apparaissent dans tous les states de cette URL)
                const commonLayout = this.extractCommonMarkdownSections(
                    urlStates.map(s => s.markdownContent || '')
                );

                // Ajouter le premier state avec le layout complet
                processedStates.push({
                    ...firstState,
                    hasCommonLayout: true,
                    isFirstOfUrl: true
                });

                // Pour les states suivants, calculer le diff par rapport à l'état précédent
                for (let i = 1; i < urlStates.length; i++) {
                    const currentState = urlStates[i];
                    const currentMarkdown = currentState.markdownContent || '';

                    // État précédent (N-1) au lieu du premier état
                    const previousState = urlStates[i - 1];
                    const previousMarkdown = previousState.markdownContent || '';

                    // Calculer le diff par rapport à l'état précédent
                    const diffResult = this.diffService.computeDiff(previousMarkdown, currentMarkdown);
                    const hasChange = diffResult.diff.trim().length > 0;

                    processedStates.push({
                        ...currentState,
                        // Garder le contenu original complet
                        markdownContent: currentMarkdown,
                        // Ajouter le diff dans un champ séparé (vide si pas de changement)
                        markdownDiffContent: hasChange ? diffResult.diff : '',
                        markdownDiff: true,
                        diffFromStateId: previousState.id, // Référence à l'état précédent
                        hasContentChange: hasChange,
                        // Ajouter les métriques de comparaison pour debug
                        diffMetrics: diffResult.metrics
                    });
                }
            }
        });

        // Trouver le layout commun global (présent dans TOUS les states)
        const allMarkdowns = states.map(s => s.markdownContent || '');
        const globalCommonLayout = this.extractCommonMarkdownSections(allMarkdowns);

        console.log(`📝 Markdown layout extraction: ${globalCommonLayout.length} caractères de layout commun`);
        console.log(`🔄 ${processedStates.filter(s => s.markdownDiff).length} states avec diff calculé`);

        return {
            commonLayout: globalCommonLayout,
            statesWithDiff: processedStates
        };
    }

    /**
     * Extrait les sections markdown communes à tous les contenus
     * Utilise le parsing par blocs pour markdown "collapsed" (sans \n)
     */
    extractCommonMarkdownSections(markdownContents) {
        if (markdownContents.length === 0) return '';
        if (markdownContents.length === 1) return '';

        // Parser tous les contenus en blocs
        const parser = new MarkdownBlockParser();
        const allBlocks = markdownContents.map(md => parser.parseMarkdownBlocks(md));

        // Trouver les blocs communs à tous les contenus
        const commonBlocks = this.findCommonBlocks(allBlocks);

        // Reconstruire le markdown à partir des blocs communs
        if (commonBlocks.length === 0) {
            return '';
        }

        // Retourner une représentation textuelle des blocs communs
        return commonBlocks.map(block => {
            const prefix = this.getBlockTypePrefix(block);
            return `${prefix}${block.content.substring(0, 50)}${block.content.length > 50 ? '...' : ''}`;
        }).join(' | ');
    }

    /**
     * Trouve les blocs communs à tous les ensembles de blocs
     */
    findCommonBlocks(allBlocks) {
        if (allBlocks.length === 0) return [];
        if (allBlocks.length === 1) return [];

        // Prendre le premier ensemble comme référence
        const firstBlocks = allBlocks[0];
        const commonBlocks = [];

        // Pour chaque bloc du premier ensemble
        for (const block of firstBlocks) {
            const blockHash = this.getBlockHash(block);

            // Vérifier si ce bloc existe dans TOUS les autres ensembles
            const isPresentInAll = allBlocks.slice(1).every(blocks => {
                return blocks.some(b => this.getBlockHash(b) === blockHash);
            });

            if (isPresentInAll) {
                commonBlocks.push(block);
            }
        }

        return commonBlocks;
    }

    /**
     * Génère un hash pour identifier un bloc de manière unique
     */
    getBlockHash(block) {
        return `${block.type}:${block.level || ''}:${block.content.substring(0, 100)}`;
    }

    /**
     * Obtient le préfixe visuel pour un type de bloc
     */
    getBlockTypePrefix(block) {
        switch (block.type) {
            case 'heading':
                return '#'.repeat(block.level) + ' ';
            case 'listItem':
                return '• ';
            case 'separator':
                return '--- ';
            case 'codeBlock':
                return '``` ';
            default:
                return '';
        }
    }

    /**
     * Génère un fingerprint unique pour un élément interactif
     * Utilisé pour identifier les éléments de layout communs
     */
    getElementFingerprint(element) {
        // Stratégie 1 : ID unique (le plus fiable)
        if (element.id) {
            return `id:${element.id}`;
        }

        // Stratégie 2 : Name (pour les inputs/forms)
        if (element.name) {
            return `name:${element.tagName}:${element.name}`;
        }

        // Stratégie 3 : Combinaison de propriétés stables
        const parts = [
            element.tagName || '',
            element.type || '',
            element.role || '',
            element.placeholder || '',
            (element.textContent || '').trim().slice(0, 50),
            element.selectors?.className || ''
        ].filter(p => p);

        return `combo:${parts.join('|')}`;
    }

    getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    }
}

/**
 * Service de diff pour comparer et optimiser les contenus markdown
 */
class MarkdownDiffService {
    constructor() {
        this.diffThreshold = 0.01; // 10% de différence minimum pour considérer un changement
        this.parser = new MarkdownBlockParser();
    }

    /**
     * Calcule le diff entre deux contenus markdown
     * Retourne un objet avec le diff formaté et les métriques de comparaison
     * Utilise le parsing par blocs pour markdown "collapsed" (sans \n)
     */
    computeDiff(baseContent, newContent) {
        // Si les contenus sont identiques, retourner un résultat vide
        if (baseContent === newContent) {
            return {
                diff: '',
                metrics: {
                    baseBlocksCount: 0,
                    newBlocksCount: 0,
                    addedCount: 0,
                    removedCount: 0,
                    modifiedCount: 0,
                    unchangedCount: 0
                }
            };
        }

        // Parser en blocs structurels au lieu de lignes
        const baseBlocks = this.parser.parseMarkdownBlocks(baseContent);
        const newBlocks = this.parser.parseMarkdownBlocks(newContent);

        // Comparer bloc par bloc
        const { added, removed, modified } = this.compareBlocks(baseBlocks, newBlocks);

        // Calculer les blocs inchangés
        const unchangedCount = Math.max(0,
            Math.min(baseBlocks.length, newBlocks.length) - modified.length
        );

        // Formater le diff
        const diff = this.formatBlockDiff(added, removed, modified);

        // Retourner le diff avec les métriques
        return {
            diff: diff,
            metrics: {
                baseBlocksCount: baseBlocks.length,
                newBlocksCount: newBlocks.length,
                addedCount: added.length,
                removedCount: removed.length,
                modifiedCount: modified.length,
                unchangedCount: unchangedCount
            }
        };
    }

    /**
     * Compare deux ensembles de blocs markdown
     * Retourne les blocs ajoutés, supprimés et modifiés
     */
    compareBlocks(baseBlocks, newBlocks) {
        const added = [];
        const removed = [];
        const modified = [];

        // Créer des maps pour comparaison rapide
        const baseMap = new Map();
        baseBlocks.forEach((block, index) => {
            const hash = this.parser.getBlockHash(block);
            baseMap.set(hash, { block, index });
        });

        const newMap = new Map();
        newBlocks.forEach((block, index) => {
            const hash = this.parser.getBlockHash(block);
            newMap.set(hash, { block, index });
        });

        // Trouver les blocs supprimés (dans base mais pas dans new)
        baseMap.forEach((value, hash) => {
            if (!newMap.has(hash)) {
                // Vérifier s'il y a une version modifiée
                const similarBlock = this.findSimilarBlock(value.block, newBlocks);
                if (similarBlock) {
                    modified.push({
                        before: value.block,
                        after: similarBlock,
                        similarity: this.calculateBlockSimilarity(value.block, similarBlock)
                    });
                } else {
                    removed.push(value.block);
                }
            }
        });

        // Trouver les blocs ajoutés (dans new mais pas dans base)
        newMap.forEach((value, hash) => {
            if (!baseMap.has(hash)) {
                // Vérifier si pas déjà dans modified
                const isModified = modified.some(m => m.after === value.block);
                if (!isModified) {
                    added.push(value.block);
                }
            }
        });

        return { added, removed, modified };
    }

    /**
     * Trouve un bloc similaire (même type, contenu proche)
     */
    findSimilarBlock(targetBlock, blocks) {
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const block of blocks) {
            // Même type de bloc
            if (block.type !== targetBlock.type) continue;

            // Pour les titres, vérifier aussi le niveau
            if (block.type === 'heading' && block.level !== targetBlock.level) continue;

            const similarity = this.calculateBlockSimilarity(targetBlock, block);

            if (similarity > this.diffThreshold && similarity > bestSimilarity) {
                bestMatch = block;
                bestSimilarity = similarity;
            }
        }

        return bestMatch;
    }

    /**
     * Calcule la similarité entre deux blocs
     */
    calculateBlockSimilarity(block1, block2) {
        if (block1.type !== block2.type) return 0;

        const content1 = block1.content || '';
        const content2 = block2.content || '';

        return this.calculateSimilarity(content1, content2);
    }

    /**
     * Formate le diff en texte lisible
     */
    formatBlockDiff(added, removed, modified) {
        const diff = [];

        // Blocs supprimés
        removed.forEach(block => {
            const prefix = this.getBlockPrefix(block);
            diff.push(`- ${prefix}${block.content}`);
        });

        // Blocs ajoutés
        added.forEach(block => {
            const prefix = this.getBlockPrefix(block);
            diff.push(`+ ${prefix}${block.content}`);
        });

        // Blocs modifiés
        modified.forEach(mod => {
            const prefix = this.getBlockPrefix(mod.before);
            const similarity = Math.round(mod.similarity * 100);
            diff.push(`~ ${prefix}[${similarity}% similar]`);
            diff.push(`  - ${mod.before.content}`);
            diff.push(`  + ${mod.after.content}`);
        });

        return diff.join(' | ');
    }

    /**
     * Obtient le préfixe d'affichage pour un type de bloc
     */
    getBlockPrefix(block) {
        switch (block.type) {
            case 'heading':
                return '#'.repeat(block.level) + ' ';
            case 'listItem':
                return block.marker + ' ';
            case 'separator':
                return '--- ';
            case 'codeBlock':
                return '``` ';
            default:
                return '';
        }
    }

    /**
     * Calcule le pourcentage de similarité entre deux contenus
     */
    calculateSimilarity(content1, content2) {
        if (content1 === content2) return 1.0;

        const len1 = content1.length;
        const len2 = content2.length;
        const maxLen = Math.max(len1, len2);

        if (maxLen === 0) return 1.0;

        const distance = this.levenshteinDistance(content1, content2);
        return 1 - (distance / maxLen);
    }

    /**
     * Calcule la distance de Levenshtein entre deux chaînes
     */
    levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = [];

        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[len1][len2];
    }
}

/**
 * Parser de markdown structurel
 * Découpe le markdown "collapsed" (sans \n) en blocs sémantiques
 */
class MarkdownBlockParser {
    constructor() {
        // Patterns pour détecter les différents types de blocs markdown
        this.patterns = {
            // Titres: # Titre, ## Titre, etc.
            heading: /#{1,6}\s+[^#]+?(?=\s+#{1,6}\s+|$)/g,

            // Listes: - item, * item, + item, 1. item, etc.
            listItem: /(?:^|\s)([-*+]|\d+\.)\s+[^-*+\d][^]*?(?=\s+[-*+]|\s+\d+\.|$)/g,

            // Séparateurs: ---, ***, ___
            separator: /(?:---|___|\*\*\*)/g,

            // Blocs de code: ```code```
            codeBlock: /```[^`]*```/g,

            // Liens: [text](url)
            link: /\[([^\]]+)\]\(([^)]+)\)/g,

            // Images: ![alt](url)
            image: /!\[([^\]]*)\]\(([^)]+)\)/g,

            // Gras: **text** ou __text__
            bold: /(?:\*\*|__)([^*_]+)(?:\*\*|__)/g,

            // Italique: *text* ou _text_
            italic: /(?:\*|_)([^*_]+)(?:\*|_)/g
        };
    }

    /**
     * Parse le markdown en blocs structurels
     * @param {string} markdown - Contenu markdown (peut être sans \n)
     * @returns {Array} Array de blocs { type, content, start, end, level }
     */
    parseMarkdownBlocks(markdown) {
        if (!markdown || markdown.trim().length === 0) {
            return [];
        }

        const blocks = [];
        const processed = new Set(); // Éviter les chevauchements

        // 1. Extraire les blocs de code en premier (priorité haute)
        this.extractBlocks(markdown, 'codeBlock', blocks, processed);

        // 2. Extraire les titres
        this.extractHeadings(markdown, blocks, processed);

        // 3. Extraire les séparateurs
        this.extractBlocks(markdown, 'separator', blocks, processed);

        // 4. Extraire les items de liste
        this.extractListItems(markdown, blocks, processed);

        // 5. Extraire les images et liens
        this.extractBlocks(markdown, 'image', blocks, processed);
        this.extractBlocks(markdown, 'link', blocks, processed);

        // 6. Le reste est du texte/paragraphe
        this.extractParagraphs(markdown, blocks, processed);

        // Trier par position dans le texte
        blocks.sort((a, b) => a.start - b.start);

        return blocks;
    }

    /**
     * Extrait les blocs selon un pattern donné
     */
    extractBlocks(markdown, type, blocks, processed) {
        const pattern = this.patterns[type];
        if (!pattern) return;

        let match;
        const regex = new RegExp(pattern.source, pattern.flags);

        while ((match = regex.exec(markdown)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            // Vérifier qu'on n'a pas déjà traité cette zone
            if (this.isRangeProcessed(start, end, processed)) {
                continue;
            }

            blocks.push({
                type: type,
                content: match[0].trim(),
                start: start,
                end: end,
                raw: match[0]
            });

            this.markRangeProcessed(start, end, processed);
        }
    }

    /**
     * Extrait les titres avec leur niveau
     */
    extractHeadings(markdown, blocks, processed) {
        const headingRegex = /(#{1,6})\s+([^#]+?)(?=\s+#{1,6}\s+|$)/g;
        let match;

        while ((match = headingRegex.exec(markdown)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            if (this.isRangeProcessed(start, end, processed)) {
                continue;
            }

            const level = match[1].length; // Nombre de #
            const content = match[2].trim();

            blocks.push({
                type: 'heading',
                level: level,
                content: content,
                start: start,
                end: end,
                raw: match[0]
            });

            this.markRangeProcessed(start, end, processed);
        }
    }

    /**
     * Extrait les items de liste avec leur marqueur
     */
    extractListItems(markdown, blocks, processed) {
        const listRegex = /([-*+]|\d+\.)\s+([^]*?)(?=\s+(?:[-*+]|\d+\.)\s+|$)/g;
        let match;

        while ((match = listRegex.exec(markdown)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            if (this.isRangeProcessed(start, end, processed)) {
                continue;
            }

            const marker = match[1];
            const content = match[2].trim();

            blocks.push({
                type: 'listItem',
                marker: marker,
                content: content,
                ordered: /^\d+\.$/.test(marker),
                start: start,
                end: end,
                raw: match[0]
            });

            this.markRangeProcessed(start, end, processed);
        }
    }

    /**
     * Extrait les paragraphes (texte non structuré)
     */
    extractParagraphs(markdown, blocks, processed) {
        let currentPos = 0;
        const sortedBlocks = [...blocks].sort((a, b) => a.start - b.start);

        for (const block of sortedBlocks) {
            if (currentPos < block.start) {
                const paragraphText = markdown.substring(currentPos, block.start).trim();

                if (paragraphText.length > 0) {
                    blocks.push({
                        type: 'paragraph',
                        content: paragraphText,
                        start: currentPos,
                        end: block.start,
                        raw: paragraphText
                    });
                }
            }
            currentPos = block.end;
        }

        // Dernier paragraphe après tous les blocs
        if (currentPos < markdown.length) {
            const paragraphText = markdown.substring(currentPos).trim();

            if (paragraphText.length > 0) {
                blocks.push({
                    type: 'paragraph',
                    content: paragraphText,
                    start: currentPos,
                    end: markdown.length,
                    raw: paragraphText
                });
            }
        }
    }

    /**
     * Vérifie si une plage a déjà été traitée
     */
    isRangeProcessed(start, end, processed) {
        for (let i = start; i < end; i++) {
            if (processed.has(i)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Marque une plage comme traitée
     */
    markRangeProcessed(start, end, processed) {
        for (let i = start; i < end; i++) {
            processed.add(i);
        }
    }

    /**
     * Reconstruit du markdown à partir de blocs
     */
    blocksToMarkdown(blocks) {
        return blocks.map(block => {
            switch (block.type) {
                case 'heading':
                    return '#'.repeat(block.level) + ' ' + block.content;
                case 'listItem':
                    return block.marker + ' ' + block.content;
                case 'separator':
                    return block.content;
                case 'codeBlock':
                    return block.content;
                case 'paragraph':
                    return block.content;
                default:
                    return block.content;
            }
        }).join(' ');
    }

    /**
     * Calcule un hash de bloc pour comparaison
     */
    getBlockHash(block) {
        return `${block.type}:${block.level || ''}:${block.content.substring(0, 50)}`;
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JsonFormatter, MarkdownDiffService, MarkdownBlockParser };
} else if (typeof window !== 'undefined') {
    window.JsonFormatter = JsonFormatter;
    window.MarkdownDiffService = MarkdownDiffService;
    window.MarkdownBlockParser = MarkdownBlockParser;
}
