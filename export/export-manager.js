// Gestionnaire d'export multi-formats pour Workflow Recorder Phase 6
class WorkflowExportManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.formatters = {
            json: new JsonFormatter(),
            csv: new CsvFormatter(), 
            pdf: new PdfFormatter(),
            rag: new RagFormatter(),
            selenium: new SeleniumFormatter()
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

class JsonFormatter {
    async format(workflowData, options) {
        const formatted = {
            workflow: workflowData.workflow,
            states: workflowData.etats || [],
            actions: workflowData.actions || [],
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };

        return {
            filename: `workflow-${workflowData.workflow.id}-${this.getTimestamp()}.json`,
            content: JSON.stringify(formatted, null, options.pretty ? 2 : 0),
            mimeType: 'application/json'
        };
    }

    getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    }
}

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

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkflowExportManager;
} else if (typeof window !== 'undefined') {
    window.WorkflowExportManager = WorkflowExportManager;
}