// Documentation Formatter for Workflow Recorder
// Generates clean, readable Markdown documentation

class DocumentationFormatter {
    constructor() {
        // Reuse RagFormatter utilities
        this.ragFormatter = new RagFormatter();
    }

    async format(workflowData, options = {}) {
        try {
            console.log('📝 Formatting documentation for:', workflowData.workflow.title);

            const workflow = workflowData.workflow;
            const actions = workflowData.actions || [];
            const states = workflowData.etats || [];

            // Calculate statistics
            const stats = {
                complexity: this.ragFormatter.calculateComplexity(actions, states),
                duration: Math.round((workflow.metadata.duration || 0) / 1000),
                uniquePages: this.ragFormatter.countUniquePages(states),
                totalSteps: actions.length
            };

            // Generate markdown sections
            const sections = [
                this.generateHeader(workflow),
                this.generateMetadataSection(workflow, stats),
                '---\n',
                this.generatePrerequisites(workflowData),
                '---\n',
                this.generateSteps(workflowData),
                '---\n',
                this.generateSummary(workflowData)
            ];

            return {
                filename: `workflow-documentation-${workflow.id}-${this.getTimestamp()}.md`,
                content: sections.join('\n'),
                mimeType: 'text/markdown'
            };

        } catch (error) {
            console.error('❌ Error formatting documentation:', error);
            throw error;
        }
    }

    generateHeader(workflow) {
        return `# ${workflow.title}`;
    }

    generateMetadataSection(workflow, stats) {
        let metadata = '\n';

        // Description
        if (workflow.description) {
            metadata += `**Description**: ${workflow.description}\n\n`;
        }

        // Tags
        if (workflow.tags && workflow.tags.length > 0) {
            metadata += `**Tags**: ${workflow.tags.join(', ')}\n\n`;
        }

        // Stats
        metadata += `**Complexity**: ${stats.complexity}\n\n`;
        metadata += `**Duration**: ${stats.duration} seconds\n\n`;
        metadata += `**Total Steps**: ${stats.totalSteps}\n\n`;

        return metadata;
    }

    generatePrerequisites(workflowData) {
        const prerequisites = this.ragFormatter.extractPrerequisites(workflowData);

        if (prerequisites.length === 0) {
            return '## Prerequisites\n\nNo specific prerequisites detected.\n';
        }

        let section = '## Prerequisites\n\n';
        prerequisites.forEach(prereq => {
            section += `- ${prereq}\n`;
        });

        return section;
    }

    generateSteps(workflowData) {
        const actions = workflowData.actions || [];
        const states = workflowData.etats || [];

        let section = '## Step-by-Step Instructions\n\n';

        actions.forEach((action, index) => {
            // Find the page state for this action
            const pageState = this.ragFormatter.getPageForAction(action, states);
            const pageContext = pageState ?
                (pageState.title || pageState.urlPattern || 'Unknown page') :
                'Unknown page';

            // Get action description
            const actionDescription = this.ragFormatter.formatActionForChunk(action);

            // Get selector
            const selector = this.ragFormatter.getElementSelector(action.target);

            // Format timestamp
            const formattedTime = this.formatTimestamp(action.timestamp);

            // Build step
            section += `### Step ${index + 1}: ${action.type.charAt(0).toUpperCase() + action.type.slice(1)} - ${this.getActionTitle(action)}\n\n`;
            section += `**Page**: ${pageContext}\n\n`;
            section += `**Action**: ${actionDescription}\n\n`;

            if (selector) {
                section += `**Element**: \`${selector}\`\n\n`;
            }

            section += `**Timestamp**: ${formattedTime}\n\n`;
        });

        return section;
    }

    getActionTitle(action) {
        // Generate a short title for the action
        switch (action.type) {
            case 'click':
                return (action.target?.textContent?.slice(0, 30) || 'Element').trim();
            case 'input':
                return action.target?.label || action.target?.placeholder || 'Field';
            case 'change':
                return 'Selection';
            case 'submit':
                return 'Form';
            case 'navigation':
                return 'Page';
            default:
                return 'Action';
        }
    }

    generateSummary(workflowData) {
        const workflow = workflowData.workflow;
        const actions = workflowData.actions || [];
        const states = workflowData.etats || [];

        let section = '## Summary\n\n';
        section += `- **Total actions**: ${actions.length}\n`;
        section += `- **Pages visited**: ${this.ragFormatter.countUniquePages(states)}\n`;

        if (workflow.metadata.startUrl) {
            section += `- **Start**: ${workflow.metadata.startUrl}\n`;
        }

        if (workflow.metadata.endUrl) {
            section += `- **End**: ${workflow.metadata.endUrl}\n`;
        }

        return section;
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    getTimestamp() {
        return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentationFormatter;
} else if (typeof window !== 'undefined') {
    window.DocumentationFormatter = DocumentationFormatter;
}
