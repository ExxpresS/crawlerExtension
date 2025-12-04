// Content script pour analyser la structure des pages
class PageAnalyzer {
    constructor() {
        this.turndownService = null;
        this.initializeTurndown();
        console.log('🔍 Page Analyzer Phase 4 initialisé');
    }

    initializeTurndown() {
        try {
            if (typeof TurndownService !== 'undefined') {
                this.turndownService = new TurndownService({
                    headingStyle: 'atx',
                    codeBlockStyle: 'fenced',
                    emDelimiter: '_',
                    strongDelimiter: '**'
                });
                
                // Règles personnalisées pour filtrer le contenu
                this.turndownService.addRule('ignoreScripts', {
                    filter: ['script', 'style', 'noscript', 'svg', 'iframe'],
                    replacement: () => ''
                });
                
                this.turndownService.addRule('simplifyImages', {
                    filter: 'img',
                    replacement: (content, node) => {
                        const alt = node.getAttribute('alt') || 'Image';
                        return `![${alt}]`;
                    }
                });
                
                console.log('✅ Turndown Service initialisé');
            } else {
                console.warn('⚠️ TurndownService non disponible, fallback sur méthode basique');
            }
        } catch (error) {
            console.error('❌ Erreur initialisation Turndown:', error);
        }
    }

    analyzeCurrentPage() {
        console.log('📊 Analyse complète de la page...');
        
        const pageData = {
            url: window.location.href,
            title: document.title,
            urlPattern: this.extractUrlPattern(window.location.href),
            timestamp: Date.now(),
            
            // Phase 4 : Analyse complète
            markdownContent: this.convertToMarkdown(),
            interactiveElements: this.findInteractiveElements(),
            forms: this.findForms(),
            pageContext: this.extractPageContext(),
            contentHash: this.generateContentHash()
        };

        console.log('📋 État de page analysé:', {
            url: pageData.url,
            interactiveCount: pageData.interactiveElements.length,
            formsCount: pageData.forms.length,
            markdownLength: pageData.markdownContent.length,
            hash: pageData.contentHash.slice(0, 8) + '...'
        });

        return pageData;
    }

    extractUrlPattern(url) {
        // Remplacer les IDs numériques par des patterns
        // Ex: /clients/123/dossier → /clients/{id}/dossier
        
        try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;
            
            // Remplacer les nombres par {id}
            pathname = pathname.replace(/\/\d+/g, '/{id}');
            
            // Remplacer les UUIDs par {uuid}
            pathname = pathname.replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/{uuid}');
            
            return urlObj.origin + pathname;
        } catch (error) {
            console.error('Erreur lors de l\'extraction du pattern URL:', error);
            return url;
        }
    }

    convertToMarkdown() {
        try {
            // Cloner le body pour ne pas modifier l'original
            const bodyClone = document.body.cloneNode(true);
            
            // Nettoyer les éléments indésirables
            this.cleanHtmlForMarkdown(bodyClone);
            
            // Anonymiser les données sensibles
            this.anonymizeContent(bodyClone);
            
            let markdown;
            if (this.turndownService) {
                markdown = this.turndownService.turndown(bodyClone.innerHTML);
            } else {
                // Fallback basique si Turndown non disponible
                markdown = this.basicHtmlToMarkdown(bodyClone);
            }
            
            // Nettoyer et limiter le markdown
            return this.cleanMarkdown(markdown);
            
        } catch (error) {
            console.error('Erreur conversion Markdown:', error);
            return `# ${document.title}\n\nErreur lors de la conversion Markdown`;
        }
    }

    cleanHtmlForMarkdown(element) {
        // Supprimer les éléments inutiles
        const unwantedSelectors = [
            'script', 'style', 'noscript', 'meta', 'link',
            '.ad', '.advertisement', '.popup', '.modal',
            '[style*="display: none"]', '[hidden]'
        ];
        
        unwantedSelectors.forEach(selector => {
            try {
                element.querySelectorAll(selector).forEach(el => el.remove());
            } catch (e) {
                console.debug('Selector failed:', selector);
            }
        });
        
        // Supprimer les attributs inutiles
        element.querySelectorAll('*').forEach(el => {
            ['style', 'class', 'id', 'onclick', 'onload'].forEach(attr => {
                el.removeAttribute(attr);
            });
        });
    }

    anonymizeContent(element) {
        // Anonymiser les textes et valeurs sensibles
        element.querySelectorAll('input, textarea').forEach(input => {
            if (input.value) {
                input.value = this.anonymizeValue(input.value, input.type);
            }
            if (input.placeholder) {
                input.placeholder = this.anonymizeValue(input.placeholder, input.type);
            }
        });
        
        // Anonymiser le texte visible
        element.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();
                if (this.looksLikeSensitiveData(text)) {
                    el.textContent = this.anonymizeValue(text);
                }
            }
        });
    }

    anonymizeValue(value, inputType = '') {
        const patterns = {
            email: { regex: /[^\s@]+@[^\s@]+\.[^\s@]+/g, replacement: 'user@example.com' },
            phone: { regex: /[\+]?[\d\s\-\(\)\.]{7,}/g, replacement: '+33 1 23 45 67 89' },
            url: { regex: /https?:\/\/[^\s]+/g, replacement: 'https://example.com' },
            creditCard: { regex: /\d{13,19}/g, replacement: '1234 5678 9012 3456' }
        };
        
        let result = value;
        Object.entries(patterns).forEach(([type, pattern]) => {
            result = result.replace(pattern.regex, pattern.replacement);
        });
        
        return result;
    }

    looksLikeSensitiveData(text) {
        const sensitivePatterns = [
            /@.*\.com/, // emails
            /\+?\d{7,}/, // phones
            /\d{13,19}/, // credit cards
            /^[A-Z]{2,}\s+\d+$/ // reference numbers
        ];
        
        return sensitivePatterns.some(pattern => pattern.test(text));
    }

    basicHtmlToMarkdown(element) {
        // Conversion basique HTML → Markdown
        let markdown = '';
        
        element.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            const level = '#'.repeat(parseInt(h.tagName.slice(1)));
            markdown += `\n${level} ${h.textContent.trim()}\n\n`;
        });
        
        element.querySelectorAll('p').forEach(p => {
            markdown += `${p.textContent.trim()}\n\n`;
        });
        
        element.querySelectorAll('ul li, ol li').forEach(li => {
            markdown += `- ${li.textContent.trim()}\n`;
        });
        
        element.querySelectorAll('a').forEach(a => {
            markdown += `[${a.textContent.trim()}](${a.href || '#'})\n`;
        });
        
        return markdown;
    }

    cleanMarkdown(markdown) {
        // Nettoyer et normaliser le markdown
        return markdown
            .replace(/\n{3,}/g, '\n\n') // Max 2 sauts de ligne
            .replace(/\s+/g, ' ') // Normaliser les espaces
            .trim()
            .slice(0, 10000); // Limiter à 10KB
    }

    findInteractiveElements() {
        const elements = [];
        const selectors = [
            'button', 'input', 'select', 'textarea', 'a',
            '[role="button"]', '[role="link"]', '[onclick]',
            '[tabindex]', '[data-action]'
        ];
        
        selectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    if (this.isElementVisible(el)) {
                        elements.push(this.analyzeInteractiveElement(el));
                    }
                });
            } catch (e) {
                console.debug('Selector failed:', selector);
            }
        });
        
        // Dédupliquer par sélecteur CSS unique
        const unique = new Map();
        elements.forEach(el => {
            const key = el.selectors.cssPath || el.selectors.xpath || el.textContent;
            if (!unique.has(key)) {
                unique.set(key, el);
            }
        });
        
        return Array.from(unique.values());
    }

    analyzeInteractiveElement(element) {
        return {
            tagName: element.tagName.toLowerCase(),
            type: element.type || null,
            textContent: element.textContent?.trim().slice(0, 50) || '',
            placeholder: element.placeholder || '',
            name: element.name || '',
            id: element.id || '',
            href: element.href || null,
            role: element.getAttribute('role') || null,
            
            selectors: this.generateElementSelectors(element),
            
            position: {
                top: element.offsetTop,
                left: element.offsetLeft,
                width: element.offsetWidth,
                height: element.offsetHeight
            },
            
            state: {
                visible: this.isElementVisible(element),
                enabled: !element.disabled,
                required: element.required || false,
                checked: element.checked || false,
                selected: element.selected || false
            },
            
            accessibility: {
                hasLabel: this.hasLabel(element),
                ariaLabel: element.getAttribute('aria-label') || null,
                title: element.title || null
            }
        };
    }

    generateElementSelectors(element) {
        // Réutiliser la méthode du recorder (extraction commune recommandée)
        const selectors = {};
        
        if (element.id) {
            selectors.id = `#${element.id}`;
        }
        
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).slice(0, 3);
            if (classes.length > 0) {
                selectors.className = `.${classes.join('.')}`;
            }
        }
        
        // CSS Path simplifié
        selectors.cssPath = this.generateSimpleCSSPath(element);
        
        // XPath simplifié
        selectors.xpath = this.generateSimpleXPath(element);
        
        return selectors;
    }

    generateSimpleCSSPath(element) {
        const parts = [];
        let current = element;
        
        while (current && current !== document.body && parts.length < 4) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector += `#${current.id}`;
                parts.unshift(selector);
                break;
            }
            
            if (current.className && typeof current.className === 'string') {
                const firstClass = current.className.trim().split(/\s+/)[0];
                if (firstClass) {
                    selector += `.${firstClass}`;
                }
            }
            
            parts.unshift(selector);
            current = current.parentElement;
        }
        
        return parts.join(' > ');
    }

    generateSimpleXPath(element) {
        const parts = [];
        let current = element;
        
        while (current && current !== document.body && parts.length < 5) {
            let index = 1;
            let sibling = current.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            
            parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
            current = current.parentElement;
        }
        
        return '//' + parts.join('/');
    }

    findForms() {
        const forms = [];
        
        document.querySelectorAll('form').forEach(form => {
            const fields = [];
            
            form.querySelectorAll('input, select, textarea').forEach(field => {
                fields.push({
                    name: field.name || '',
                    type: field.type || field.tagName.toLowerCase(),
                    required: field.required || false,
                    label: this.getFieldLabel(field)
                });
            });
            
            forms.push({
                id: form.id || null,
                name: form.name || null,
                action: form.action || '',
                method: form.method || 'GET',
                fieldCount: fields.length,
                fields: fields,
                
                selectors: this.generateElementSelectors(form),
                
                hasRequiredFields: fields.some(f => f.required),
                hasValidation: form.hasAttribute('novalidate') === false
            });
        });
        
        return forms;
    }

    getFieldLabel(field) {
        // Chercher label associé par for/id
        if (field.id) {
            const label = document.querySelector(`label[for="${field.id}"]`);
            if (label) return label.textContent.trim();
        }
        
        // Chercher label parent
        let parent = field.parentElement;
        while (parent) {
            if (parent.tagName === 'LABEL') {
                return parent.textContent.trim();
            }
            parent = parent.parentElement;
        }
        
        return field.placeholder || field.name || '';
    }

    hasLabel(element) {
        return this.getFieldLabel(element).length > 0;
    }

    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return rect.width > 0 && 
               rect.height > 0 && 
               style.visibility !== 'hidden' && 
               style.display !== 'none' &&
               rect.top < window.innerHeight &&
               rect.bottom > 0;
    }

    extractPageContext() {
        return {
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            
            breadcrumb: this.extractBreadcrumb(),
            
            navigation: this.extractNavigation(),
            
            userRole: this.detectUserRole(),
            
            pageType: this.detectPageType(),
            
            language: document.documentElement.lang || 'unknown',
            
            meta: {
                description: document.querySelector('meta[name="description"]')?.content || '',
                keywords: document.querySelector('meta[name="keywords"]')?.content || ''
            }
        };
    }

    extractBreadcrumb() {
        const breadcrumbSelectors = [
            '[aria-label*="breadcrumb"]',
            '.breadcrumb',
            '.breadcrumbs', 
            'nav ol',
            'nav ul',
            '.page-path',
            '.navigation-path'
        ];
        
        for (const selector of breadcrumbSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const items = [];
                element.querySelectorAll('a, span, li').forEach(item => {
                    const text = item.textContent.trim();
                    if (text && text.length < 100) {
                        items.push({
                            text: text,
                            href: item.href || null
                        });
                    }
                });
                if (items.length > 0) return items;
            }
        }
        
        return [];
    }

    extractNavigation() {
        const navElements = [];
        
        document.querySelectorAll('nav, .navigation, .menu').forEach(nav => {
            const links = [];
            nav.querySelectorAll('a').forEach(link => {
                const text = link.textContent.trim();
                if (text && text.length < 50) {
                    links.push({
                        text: text,
                        href: link.href || null,
                        active: link.classList.contains('active') || 
                               link.getAttribute('aria-current') === 'page'
                    });
                }
            });
            
            if (links.length > 0) {
                navElements.push({
                    type: nav.tagName.toLowerCase(),
                    className: nav.className || null,
                    links: links.slice(0, 10) // Limiter à 10 liens
                });
            }
        });
        
        return navElements;
    }

    detectUserRole() {
        // Essayer de détecter le rôle utilisateur à partir du contenu
        const roleIndicators = {
            admin: ['admin', 'administrator', 'dashboard', 'settings'],
            user: ['profile', 'account', 'my account'],
            guest: ['login', 'sign in', 'register', 'sign up']
        };
        
        const bodyText = document.body.textContent.toLowerCase();
        
        for (const [role, indicators] of Object.entries(roleIndicators)) {
            if (indicators.some(indicator => bodyText.includes(indicator))) {
                return role;
            }
        }
        
        return 'unknown';
    }

    detectPageType() {
        // Détecter le type de page
        const pageTypes = {
            form: () => document.querySelectorAll('form').length > 0,
            list: () => document.querySelectorAll('ul li, ol li, table tr').length > 5,
            detail: () => document.querySelectorAll('dl, .detail, .profile').length > 0,
            dashboard: () => document.querySelectorAll('.widget, .card, .tile').length > 2,
            login: () => document.querySelector('input[type="password"]') !== null
        };
        
        for (const [type, detector] of Object.entries(pageTypes)) {
            if (detector()) {
                return type;
            }
        }
        
        return 'content';
    }

    generateContentHash() {
        try {
            // Créer un hash basé sur le contenu principal de la page
            const contentElements = [
                document.title,
                document.querySelector('h1')?.textContent || '',
                document.querySelectorAll('button, input, select').length.toString(),
                document.querySelectorAll('form').length.toString(),
                window.location.pathname
            ];
            
            const content = contentElements.join('|');
            
            // Utiliser la fonction hash des utils si disponible
            if (window.WorkflowUtils && window.WorkflowUtils.simpleHash) {
                return window.WorkflowUtils.simpleHash(content);
            }
            
            // Fallback hash simple
            let hash = 0;
            for (let i = 0; i < content.length; i++) {
                const char = content.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
            
        } catch (error) {
            console.error('Erreur génération hash:', error);
            return Date.now().toString(16);
        }
    }
}

// Initialiser l'analyzer
const pageAnalyzer = new PageAnalyzer();

// Exposer globalement
window.pageAnalyzer = pageAnalyzer;