// Gestionnaire d'export multi-formats pour Workflow Recorder Phase 6
class WorkflowExportManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.formatters = {
            json: new JsonFormatter(),
            csv: new CsvFormatter(),
            pdf: new PdfFormatter(),
            selenium: new SeleniumFormatter(),
            raghtml: new RagHtmlFormatter()
        };
    }

    async exportWorkflow(workflowId, format, options = {}) {
        try {
            console.log(`📥 Export workflow ${workflowId} en format ${format}...`);

            // Récupérer les données complètes du workflow
            const workflowData = await this.dbManager.getWorkflowComplete(workflowId);

            if (!workflowData) {
                throw new Error(`Workflow ${workflowId} non trouvé`);
            }

            // Formater selon le format demandé
            const formatter = this.formatters[format];
            if (!formatter) {
                throw new Error(`Format ${format} non supporté`);
            }

            const exportedData = await formatter.format(workflowData, options);

            // Déclencher le téléchargement
            await this.downloadFile(exportedData, workflowId, format);

            console.log(`✅ Export ${format} terminé pour workflow ${workflowId}`);
            return exportedData;

        } catch (error) {
            console.error(`❌ Erreur export workflow:`, error);
            throw error;
        }
    }

    async exportAllWorkflows(format, options = {}) {
        try {
            console.log(`📥 Export de tous les workflows en format ${format}...`);

            // Récupérer tous les workflows
            const workflows = await this.dbManager.getAllWorkflows();

            if (workflows.length === 0) {
                throw new Error('Aucun workflow à exporter');
            }

            // Exporter selon le format
            if (format === 'bulk-json') {
                return await this.exportBulkJson(workflows, options);
            } else if (format === 'analytics') {
                return await this.exportAnalytics(workflows, options);
            } else {
                // Export individuel de chaque workflow
                const exports = [];
                for (const workflow of workflows) {
                    const workflowData = await this.dbManager.getWorkflowComplete(workflow.id);
                    const exportedData = await this.formatters[format].format(workflowData, options);
                    exports.push({
                        workflowId: workflow.id,
                        title: workflow.title,
                        data: exportedData
                    });
                }

                await this.downloadBulkFile(exports, format);
                return exports;
            }

        } catch (error) {
            console.error(`❌ Erreur export bulk:`, error);
            throw error;
        }
    }

    async exportBulkJson(workflows, options) {
        const bulkData = {
            exportInfo: {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                totalWorkflows: workflows.length,
                exportType: 'bulk'
            },
            workflows: [],
            statistics: await this.dbManager.getStatistiques()
        };

        // Récupérer les données complètes de chaque workflow
        for (const workflow of workflows) {
            try {
                const completeWorkflow = await this.dbManager.getWorkflowComplete(workflow.id);
                bulkData.workflows.push(completeWorkflow);
            } catch (error) {
                console.warn(`Erreur lors de l'export du workflow ${workflow.id}:`, error);
            }
        }

        const exportedData = {
            filename: `workflows-bulk-${this.getTimestamp()}.json`,
            content: JSON.stringify(bulkData, null, 2),
            mimeType: 'application/json'
        };

        await this.downloadFile(exportedData, 'bulk', 'json');
        return exportedData;
    }

    async exportAnalytics(workflows, options) {
        const analytics = {
            exportInfo: {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                type: 'analytics'
            },
            summary: await this.dbManager.getStatistiques(),
            workflows: workflows.map(w => ({
                id: w.id,
                title: w.title,
                createdAt: w.metadata.createdAt,
                duration: w.metadata.duration,
                actionCount: w.metadata.actionCount,
                stateCount: w.metadata.stateCount,
                tags: w.tags
            })),
            insights: await this.generateInsights(workflows)
        };

        const exportedData = {
            filename: `workflows-analytics-${this.getTimestamp()}.json`,
            content: JSON.stringify(analytics, null, 2),
            mimeType: 'application/json'
        };

        await this.downloadFile(exportedData, 'analytics', 'json');
        return exportedData;
    }

    async generateInsights(workflows) {
        const insights = {
            averageDuration: 0,
            averageActions: 0,
            popularTags: {},
            commonPatterns: [],
            efficiency: {
                quickest: null,
                longest: null,
                mostActions: null
            }
        };

        if (workflows.length === 0) return insights;

        // Calculs de base
        let totalDuration = 0;
        let totalActions = 0;

        workflows.forEach(w => {
            totalDuration += w.metadata.duration || 0;
            totalActions += w.metadata.actionCount || 0;

            // Tags populaires
            if (w.tags) {
                w.tags.forEach(tag => {
                    insights.popularTags[tag] = (insights.popularTags[tag] || 0) + 1;
                });
            }

            // Records d'efficacité
            if (!insights.efficiency.quickest || (w.metadata.duration || 0) < (insights.efficiency.quickest.metadata.duration || 0)) {
                insights.efficiency.quickest = w;
            }
            if (!insights.efficiency.longest || (w.metadata.duration || 0) > (insights.efficiency.longest.metadata.duration || 0)) {
                insights.efficiency.longest = w;
            }
            if (!insights.efficiency.mostActions || (w.metadata.actionCount || 0) > (insights.efficiency.mostActions.metadata.actionCount || 0)) {
                insights.efficiency.mostActions = w;
            }
        });

        insights.averageDuration = Math.round(totalDuration / workflows.length);
        insights.averageActions = Math.round(totalActions / workflows.length);

        return insights;
    }

    async downloadFile(exportedData, workflowId, format) {
        try {
            // Créer un blob avec le contenu
            const blob = new Blob([exportedData.content], {
                type: exportedData.mimeType || 'text/plain'
            });

            // Créer une URL temporaire
            const url = URL.createObjectURL(blob);

            // Déclencher le téléchargement
            const link = document.createElement('a');
            link.href = url;
            link.download = exportedData.filename || `workflow-${workflowId}.${format}`;
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Nettoyer l'URL temporaire
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            throw error;
        }
    }

    async downloadBulkFile(exports, format) {
        const timestamp = this.getTimestamp();
        const zipContent = await this.createZipContent(exports, format);

        const exportedData = {
            filename: `workflows-${format}-${timestamp}.zip`,
            content: zipContent,
            mimeType: 'application/zip'
        };

        await this.downloadFile(exportedData, 'bulk', format);
    }

    async createZipContent(exports, format) {
        // Simulation de création ZIP - en production, utiliser JSZip
        let zipContent = '';

        exports.forEach(exp => {
            zipContent += `\n--- ${exp.title} (${exp.workflowId}) ---\n`;
            zipContent += typeof exp.data === 'string' ? exp.data : JSON.stringify(exp.data, null, 2);
            zipContent += '\n\n';
        });

        return zipContent;
    }

    getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    }

    // Méthodes utilitaires
    getSupportedFormats() {
        return Object.keys(this.formatters);
    }

    async validateExportData(workflowData) {
        if (!workflowData.workflow) {
            throw new Error('Données de workflow manquantes');
        }

        if (!workflowData.actions || workflowData.actions.length === 0) {
            throw new Error('Aucune action à exporter');
        }

        return true;
    }
}

// === FORMATTERS DE BASE ===
// Note: JsonFormatter est maintenant dans json-formatter.js

class CsvFormatter {
    async format(workflowData, options) {
        const actions = workflowData.actions || [];

        // Headers CSV
        const headers = [
            'sequence_number', 'timestamp', 'type', 'element_tag',
            'element_id', 'element_class', 'text_content', 'url'
        ];

        // Convertir les actions en lignes CSV
        const rows = actions.map(action => [
            action.sequenceNumber || '',
            new Date(action.timestamp).toISOString(),
            action.type || '',
            action.target?.tagName || '',
            action.target?.id || '',
            action.target?.className || '',
            (action.target?.textContent || '').replace(/"/g, '""'),
            action.url || ''
        ]);

        // Construire le CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return {
            filename: `workflow-${workflowData.workflow.id}-actions.csv`,
            content: csvContent,
            mimeType: 'text/csv'
        };
    }
}

class PdfFormatter {
    async format(workflowData, options) {
        // Génération basique de contenu PDF (HTML->PDF simulation)
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Workflow: ${workflowData.workflow.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background: #f0f0f0; padding: 15px; margin-bottom: 20px; }
                    .action { border: 1px solid #ddd; margin: 10px 0; padding: 10px; }
                    .sequence { background: #007bff; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${workflowData.workflow.title}</h1>
                    <p><strong>Créé le:</strong> ${new Date(workflowData.workflow.metadata.createdAt).toLocaleString()}</p>
                    <p><strong>Actions:</strong> ${workflowData.actions.length} | <strong>États:</strong> ${workflowData.etats.length}</p>
                    ${workflowData.workflow.description ? `<p><strong>Description:</strong> ${workflowData.workflow.description}</p>` : ''}
                </div>
                
                <h2>Séquence d'actions</h2>
                ${workflowData.actions.map(action => `
                    <div class="action">
                        <span class="sequence">${action.sequenceNumber}</span>
                        <strong>${this.getActionDescription(action)}</strong>
                        <br><small>${new Date(action.timestamp).toLocaleString()}</small>
                    </div>
                `).join('')}
            </body>
            </html>
        `;

        return {
            filename: `workflow-${workflowData.workflow.id}-guide.html`,
            content: htmlContent,
            mimeType: 'text/html'
        };
    }

    getActionDescription(action) {
        switch(action.type) {
            case 'click':
                return `Cliquer sur: "${action.target?.textContent || action.target?.tagName}"`;
            case 'input':
                return `Saisir dans le champ: "${action.target?.label || action.target?.placeholder}"`;
            case 'change':
                return `Modifier la sélection: "${action.target?.tagName}"`;
            case 'submit':
                return `Soumettre le formulaire`;
            case 'navigation':
                return `Navigation vers: ${action.navigationDetails?.to?.pathname}`;
            default:
                return `Action: ${action.type}`;
        }
    }
}

class SeleniumFormatter {
    async format(workflowData, options) {
        const actions = workflowData.actions || [];
        const workflow = workflowData.workflow;

        // Générer le script Selenium Python
        const seleniumScript = this.generatePythonScript(workflow, actions);

        return {
            filename: `workflow-selenium-${workflowData.workflow.id}.py`,
            content: seleniumScript,
            mimeType: 'text/x-python'
        };
    }

    generatePythonScript(workflow, actions) {
        let script = `# Selenium Test Script - ${workflow.title}\n`;
        script += `# Généré automatiquement par Workflow Recorder\n`;
        script += `# ${new Date().toISOString()}\n\n`;

        script += `from selenium import webdriver\n`;
        script += `from selenium.webdriver.common.by import By\n`;
        script += `from selenium.webdriver.common.keys import Keys\n`;
        script += `from selenium.webdriver.support.ui import WebDriverWait\n`;
        script += `from selenium.webdriver.support import expected_conditions as EC\n`;
        script += `from selenium.webdriver.support.ui import Select\n`;
        script += `import time\n\n`;

        script += `class Test${this.toPascalCase(workflow.title)}:\n`;
        script += `    def __init__(self):\n`;
        script += `        self.driver = webdriver.Chrome()\n`;
        script += `        self.driver.implicitly_wait(10)\n`;
        script += `        self.wait = WebDriverWait(self.driver, 10)\n\n`;

        script += `    def test_${this.toSnakeCase(workflow.title)}(self):\n`;
        script += `        """${workflow.description || workflow.title}"""\n`;
        script += `        driver = self.driver\n\n`;

        // Générer les actions
        actions.forEach((action, index) => {
            script += this.generateActionCode(action, index);
        });

        script += `\n    def tearDown(self):\n`;
        script += `        self.driver.quit()\n\n`;

        script += `if __name__ == "__main__":\n`;
        script += `    test = Test${this.toPascalCase(workflow.title)}()\n`;
        script += `    try:\n`;
        script += `        test.test_${this.toSnakeCase(workflow.title)}()\n`;
        script += `        print("Test passed successfully!")\n`;
        script += `    except Exception as e:\n`;
        script += `        print(f"Test failed: {e}")\n`;
        script += `    finally:\n`;
        script += `        test.tearDown()\n`;

        return script;
    }

    generateActionCode(action, index) {
        let code = `        # Step ${index + 1}: ${action.type}\n`;

        switch(action.type) {
            case 'navigation':
                const url = action.url || action.navigationDetails?.to?.href;
                if (url) {
                    code += `        driver.get("${url}")\n`;
                    code += `        time.sleep(1)\n`;
                }
                break;

            case 'click':
                const selector = this.getSelector(action.target);
                if (selector) {
                    code += `        element = self.wait.until(\n`;
                    code += `            EC.element_to_be_clickable((${selector}))\n`;
                    code += `        )\n`;
                    code += `        element.click()\n`;
                    code += `        time.sleep(0.5)\n`;
                }
                break;

            case 'input':
                const inputSelector = this.getSelector(action.target);
                if (inputSelector) {
                    code += `        element = driver.find_element(${inputSelector})\n`;
                    code += `        element.clear()\n`;
                    code += `        element.send_keys("YOUR_VALUE_HERE")  # ${action.target?.label || 'Input value'}\n`;
                    code += `        time.sleep(0.3)\n`;
                }
                break;

            case 'change':
                if (action.target?.selectDetails) {
                    const selectSelector = this.getSelector(action.target);
                    code += `        select = Select(driver.find_element(${selectSelector}))\n`;
                    code += `        select.select_by_visible_text("${action.target.selectDetails.selectedText}")\n`;
                } else if (action.target?.checkboxDetails) {
                    const checkboxSelector = this.getSelector(action.target);
                    code += `        checkbox = driver.find_element(${checkboxSelector})\n`;
                    if (action.target.checkboxDetails.isChecked) {
                        code += `        if not checkbox.is_selected():\n`;
                        code += `            checkbox.click()\n`;
                    } else {
                        code += `        if checkbox.is_selected():\n`;
                        code += `            checkbox.click()\n`;
                    }
                }
                break;

            case 'submit':
                const submitSelector = this.getSelector(action.target);
                if (submitSelector) {
                    code += `        form = driver.find_element(${submitSelector})\n`;
                    code += `        form.submit()\n`;
                    code += `        time.sleep(1)\n`;
                }
                break;
        }

        code += '\n';
        return code;
    }

    getSelector(target) {
        if (!target) return null;

        // Priorité : ID > Name > CSS Selector
        if (target.id) {
            return `By.ID, "${target.id}"`;
        }
        if (target.name) {
            return `By.NAME, "${target.name}"`;
        }
        if (target.className) {
            const className = target.className.split(' ')[0];
            return `By.CLASS_NAME, "${className}"`;
        }
        if (target.xpath) {
            return `By.XPATH, "${target.xpath}"`;
        }
        if (target.selector) {
            return `By.CSS_SELECTOR, "${target.selector}"`;
        }

        return null;
    }

    toPascalCase(str) {
        return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => {
            return letter.toUpperCase();
        }).replace(/\s+/g, '');
    }

    toSnakeCase(str) {
        return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
}

class RagHtmlFormatter {
    constructor() {
        this.jsonFormatter = new JsonFormatter();
    }

    async format(workflowData, options = {}) {
        // 1. Extraire layout et diffs via JsonFormatter
        const { layoutElements } = this.jsonFormatter.extractLayoutElements(workflowData.etats || []);
        const { statesWithDiff } = this.jsonFormatter.extractMarkdownLayout(workflowData.etats || []);

        // 2. Construire la timeline chronologique entrelacée
        const timeline = this.buildChronologicalTimeline(statesWithDiff, workflowData.actions || []);

        // 3. Générer le HTML
        const htmlContent = this.generateHtml(
            workflowData.workflow,
            timeline,
            layoutElements,
            options.includeLayout || false
        );

        return {
            filename: `workflow-${workflowData.workflow.id}-rag.html`,
            content: htmlContent,
            mimeType: 'text/html'
        };
    }

    buildChronologicalTimeline(states, actions) {
        const timeline = [];

        // Trier les états par sequenceNumber
        const sortedStates = [...states].sort((a, b) =>
            (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
        );

        sortedStates.forEach((state, index) => {
            // Ajouter l'état
            timeline.push({
                type: 'state',
                data: state,
                isFirst: state.isFirstOfUrl || index === 0
            });

            // Trouver et ajouter les actions qui se sont produites après cet état
            const actionsAfterState = actions
                .filter(a => a.etatAvantId === state.id)
                .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

            actionsAfterState.forEach(action => {
                timeline.push({ type: 'action', data: action });
            });
        });

        // Gérer les actions sans etatAvantId (placer en fin par timestamp)
        const orphanActions = actions
            .filter(a => !a.etatAvantId)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        orphanActions.forEach(action => {
            timeline.push({ type: 'action', data: action });
        });

        return timeline;
    }

    generateHtml(workflow, timeline, layoutElements, includeLayout) {
        const metadata = workflow.metadata || {};

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow: ${this.escapeHtml(workflow.title)}</title>
    <meta name="export-format" content="rag-html">
    <meta name="include-layout" content="${includeLayout}">
    <style>
        body {
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            color: #1a202c;
            background: #f7fafc;
        }

        .workflow-metadata {
            background: white;
            border-left: 4px solid #3182ce;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .workflow-metadata h1 {
            margin: 0 0 15px 0;
            color: #2d3748;
        }

        .metadata {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            color: #4a5568;
            font-size: 0.9em;
        }

        .metadata span {
            background: #edf2f7;
            padding: 4px 12px;
            border-radius: 4px;
        }

        .description {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            color: #4a5568;
        }

        #layout-elements {
            background: white;
            padding: 20px;
            margin-bottom: 30px;
            border-left: 4px solid #805ad5;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        #layout-elements h2 {
            margin-top: 0;
            color: #553c9a;
        }

        .layout-element {
            background: #faf5ff;
            padding: 10px;
            margin: 8px 0;
            border-radius: 4px;
            font-size: 0.9em;
        }

        .layout-element .tag {
            font-weight: bold;
            color: #6b46c1;
        }

        #workflow-timeline h2 {
            color: #2d3748;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
            margin-bottom: 25px;
        }

        .state {
            border-left: 4px solid #4a5568;
            padding: 15px 20px;
            margin: 30px 0;
            background: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .state-full {
            border-color: #3182ce;
        }

        .state-diff {
            border-color: #38a169;
        }

        .state h3 {
            margin: 0 0 10px 0;
            color: #2d3748;
            font-size: 1.1em;
        }

        .page-title {
            color: #4a5568;
            font-size: 0.95em;
            margin-bottom: 15px;
        }

        .url-info {
            background: #edf2f7;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 0.85em;
            margin-bottom: 15px;
            font-family: 'Courier New', monospace;
            color: #2d3748;
        }

        .markdown-content {
            padding: 15px;
            background: #f7fafc;
            border-radius: 4px;
            white-space: pre-wrap;
            font-size: 0.9em;
            max-height: 500px;
            overflow-y: auto;
        }

        .markdown-diff {
            padding: 15px;
            background: #f0fff4;
            border-radius: 4px;
            font-size: 0.9em;
        }

        .no-changes {
            color: #718096;
            font-style: italic;
        }

        .no-content {
            color: #718096;
            font-style: italic;
        }

        ins {
            background: #c6f6d5;
            color: #22543d;
            text-decoration: none;
            padding: 2px 4px;
            border-radius: 2px;
        }

        del {
            background: #fed7d7;
            color: #742a2a;
            text-decoration: line-through;
            padding: 2px 4px;
            border-radius: 2px;
        }

        mark {
            background: #feebc8;
            color: #7c2d12;
            padding: 2px 4px;
            border-radius: 2px;
        }

        .action {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-left: 3px solid #ed8936;
            padding: 15px;
            margin: 15px 0 15px 40px;
            border-radius: 4px;
        }

        .action-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .sequence {
            background: #ed8936;
            color: white;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: bold;
        }

        .type {
            background: #e2e8f0;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            color: #2d3748;
        }

        .description {
            color: #2d3748;
            font-weight: 500;
            margin-bottom: 8px;
        }

        .action-context {
            background: #edf2f7;
            padding: 8px 12px;
            margin: 8px 0;
            border-radius: 4px;
            font-size: 0.9em;
            color: #4a5568;
        }

        .context-label {
            font-weight: 600;
            color: #2d3748;
        }

        .target {
            font-size: 0.85em;
            color: #718096;
            margin-top: 8px;
            padding: 8px;
            background: white;
            border-radius: 4px;
        }

        @media print {
            body {
                background: white;
            }
            .state, .action, .workflow-metadata, #layout-elements {
                box-shadow: none;
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <header class="workflow-metadata">
        <h1>${this.escapeHtml(workflow.title)}</h1>
        <div class="metadata">
            <span>Actions: ${metadata.actionCount || 0}</span>
            <span>États: ${metadata.stateCount || 0}</span>
            <span>Créé: ${metadata.createdAt ? new Date(metadata.createdAt).toLocaleString('fr-FR') : 'N/A'}</span>
            ${metadata.duration ? `<span>Durée: ${Math.round(metadata.duration / 1000)}s</span>` : ''}
        </div>
        ${workflow.description ? `<div class="description">${this.escapeHtml(workflow.description)}</div>` : ''}
    </header>

    ${includeLayout && layoutElements.length > 0 ? this.renderLayoutElements(layoutElements) : ''}

    <main id="workflow-timeline">
        <h2>Déroulement chronologique</h2>
        ${timeline.map(item => {
            if (item.type === 'state') {
                return this.renderState(item.data, item.isFirst);
            } else {
                return this.renderAction(item.data);
            }
        }).join('')}
    </main>
</body>
</html>`;
    }

    renderLayoutElements(layoutElements) {
        return `
    <section id="layout-elements">
        <h2>Éléments de layout communs</h2>
        <p style="color: #718096; font-size: 0.9em; margin-bottom: 15px;">
            Ces éléments sont présents sur toutes les pages du workflow (navigation, header, footer, etc.)
        </p>
        ${layoutElements.map(el => `
        <div class="layout-element">
            <span class="tag">&lt;${el.tagName}&gt;</span>
            ${el.textContent ? ` "${this.escapeHtml(el.textContent)}"` : ''}
            ${el.id ? ` <code>#${this.escapeHtml(el.id)}</code>` : ''}
            ${el.role ? ` [${this.escapeHtml(el.role)}]` : ''}
        </div>
        `).join('')}
    </section>`;
    }

    renderState(state, isFirst) {
        const stateClass = (isFirst || !state.markdownDiff) ? 'state-full' : 'state-diff';
        const seq = state.sequenceNumber || '?';
        const url = state.url || 'N/A';
        const title = state.title || 'Sans titre';

        let contentHtml = '';

        if (isFirst || !state.markdownDiff) {
            // État complet
            const content = state.markdownContent || '';
            contentHtml = content
                ? `<div class="markdown-content">${this.escapeHtml(content)}</div>`
                : '<p class="no-content">Pas de contenu capturé</p>';
        } else {
            // État avec diff
            if (state.hasContentChange && state.markdownDiffContent) {
                contentHtml = `<div class="markdown-diff">${this.convertDiffToHtml(state.markdownDiffContent)}</div>`;
            } else {
                contentHtml = '<p class="no-changes">Aucun changement de contenu</p>';
            }
        }

        return `
    <section class="state ${stateClass}" data-sequence="${seq}">
        <h3>État #${seq}</h3>
        <div class="page-title">${this.escapeHtml(title)}</div>
        <div class="url-info">${this.escapeHtml(url)}</div>
        ${contentHtml}
    </section>`;
    }

    renderAction(action) {
        const seq = action.sequenceNumber || '?';
        const type = action.type || 'unknown';
        const description = this.getActionDescription(action);
        const parentContext = this.extractParentContext(action);
        const target = action.target || {};
        const textContext = target.textContext;
        const parent = textContext?.parent;

        // Construire les détails de l'élément
        let targetDetails = `Élément: <strong>${this.escapeHtml(target.tagName || 'N/A')}</strong>`;

        if (target.label) {
            targetDetails += ` - Label: "${this.escapeHtml(target.label)}"`;
        } else if (target.textContent && target.textContent.trim()) {
            targetDetails += ` - Texte: "${this.escapeHtml(target.textContent.substring(0, 100))}"`;
        } else if (parent) {
            const parentText = parent.text?.trim() || parent.dataOriginalTitle?.trim() || parent.title?.trim() || parent.ariaLabel?.trim();
            if (parentText) {
                targetDetails += ` - Texte parent: "${this.escapeHtml(parentText)}"`;
            }
        }

        // Ajouter le niveau du parent si disponible
        if (parent?.level !== undefined) {
            targetDetails += ` <span style="color: #718096; font-size: 0.85em;">(niveau ${parent.level})</span>`;
        }

        return `
    <div class="action" data-sequence="${seq}" data-type="${type}">
        <div class="action-header">
            <span class="sequence">#${seq}</span>
            <span class="type">${this.escapeHtml(type)}</span>
        </div>
        <div class="description">
            ${this.escapeHtml(description)}${parentContext ? this.escapeHtml(parentContext) : ''}
        </div>
        ${parentContext ? `
        <div class="action-context">
            <span class="context-label">Contexte:</span>
            ${this.escapeHtml(parentContext.substring(4))}
        </div>` : ''}
        <div class="target">
            ${targetDetails}
        </div>
    </div>`;
    }

    getActionDescription(action) {
        const target = action.target || {};
        const textContext = target.textContext;
        const direct = textContext?.direct;
        const parent = textContext?.parent;

        switch(action.type) {
            case 'click':
                // Ordre de priorité: textContent > direct context > parent context > tagName
                let clickText = target.textContent || target.label;

                if (!clickText || clickText.trim() === '' || clickText === target.tagName) {
                    clickText = direct?.ariaLabel || direct?.title || direct?.dataOriginalTitle;
                }

                if (!clickText || clickText.trim() === '') {
                    clickText = parent?.text?.trim() || parent?.dataOriginalTitle?.trim() || parent?.title?.trim() || parent?.ariaLabel?.trim();
                }

                if (!clickText || clickText.trim() === '') {
                    clickText = target.tagName || 'élément';
                }

                return `Cliquer sur "${clickText}"`;
            case 'input':
                return `Saisir dans le champ "${target.label || target.placeholder || target.name || 'input'}"`;
            case 'change':
                if (target.selectDetails) {
                    return `Sélectionner "${target.selectDetails.selectedText || 'option'}"`;
                } else if (target.checkboxDetails) {
                    return target.checkboxDetails.isChecked ? 'Cocher la case' : 'Décocher la case';
                }
                return `Modifier "${target.label || 'sélection'}"`;
            case 'submit':
                return 'Soumettre le formulaire';
            case 'navigation':
                const to = action.navigationDetails?.to?.pathname || action.url;
                return `Navigation vers ${to || 'nouvelle page'}`;
            default:
                return `Action: ${action.type}`;
        }
    }

    extractParentContext(action) {
        const contexts = [];
        const ctx = action.target?.context;
        const textContext = action.target?.textContext;
        const parent = textContext?.parent;

        // Ajouter l'information du parent direct si disponible
        const parentText = parent?.text?.trim() || parent?.dataOriginalTitle?.trim() || parent?.title?.trim() || parent?.ariaLabel?.trim();
        if (parentText) {
            contexts.push(`"${parentText}"`);
        }

        if (!ctx && contexts.length === 0) return '';

        // Contexte de formulaire
        if (ctx?.form) {
            const formLabel = ctx.form.formName || ctx.form.formId || 'formulaire';
            contexts.push(`form "${formLabel}"`);
        }

        // Section sémantique
        if (ctx?.section?.semanticSection) {
            const s = ctx.section.semanticSection;
            const sectionLabel = s.tag + (s.id ? `#${s.id}` : s.className ? `.${s.className.split(' ')[0]}` : '');
            contexts.push(sectionLabel);
        }

        // Container
        if (ctx?.section?.container) {
            const c = ctx.section.container;
            contexts.push(c.type || 'container');
        }

        return contexts.length > 0 ? ` in ${contexts.join(' > ')}` : '';
    }

    convertDiffToHtml(diffContent) {
        if (!diffContent) {
            return '<p class="no-changes">Aucun changement</p>';
        }

        // Le diff du MarkdownDiffService est formaté comme: "- block | + block | ~ block"
        const lines = diffContent.split(' | ');

        return lines.map(line => {
            line = line.trim();
            if (line.startsWith('- ')) {
                return `<del>${this.escapeHtml(line.substring(2))}</del>`;
            } else if (line.startsWith('+ ')) {
                return `<ins>${this.escapeHtml(line.substring(2))}</ins>`;
            } else if (line.startsWith('~ ')) {
                return `<mark>${this.escapeHtml(line.substring(2))}</mark>`;
            }
            return this.escapeHtml(line);
        }).join('<br>');
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkflowExportManager;
} else if (typeof window !== 'undefined') {
    window.WorkflowExportManager = WorkflowExportManager;
}
