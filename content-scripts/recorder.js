// Content script pour capturer les événements utilisateur
class EventRecorder {
    constructor() {
        this.isRecording = false;
        this.lastClickTime = 0;

        // Handlers pour tous les événements
        this.clickHandler = null;
        this.inputHandler = null;
        this.changeHandler = null;
        this.submitHandler = null;
        this.beforeUnloadHandler = null;

        // Debouncing pour les saisies
        this.inputDebounceTimers = new Map();
        this.lastInputValues = new Map();

        // Suivi de navigation
        this.currentUrl = window.location.href;

        this.initializeRecorder();
    }

    initializeRecorder() {
        // Listen for messages from service worker
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message);
        });

        console.log('🎬 Workflow Recorder - Content script initialisé');

        // Vérifier si un enregistrement est en cours (pour les navigations)
        this.checkRecordingState();
    }

    async checkRecordingState() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_RECORDING_STATE'
            });

            if (response && response.isRecording) {
                console.log('📼 Enregistrement en cours détecté après navigation');

                // Attendre que la page soit complètement chargée avant de démarrer
                if (document.readyState === 'complete') {
                    this.startRecording();
                } else {
                    window.addEventListener('load', () => {
                        console.log('📄 Page chargée, démarrage de l\'enregistrement');
                        this.startRecording();
                    }, { once: true });
                }
            }
        } catch (error) {
            console.debug('Impossible de vérifier l\'état d\'enregistrement:', error);
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'RECORDING_STARTED':
                this.startRecording();
                break;

            case 'RECORDING_STOPPED':
                this.stopRecording();
                break;

            case 'RECORDING_CANCELLED':
                this.stopRecording();
                break;
        }
    }

    startRecording() {
        if (this.isRecording) return;

        console.log('🎥 Démarrage de la capture d\'événements');
        this.isRecording = true;

        // Attacher les listeners d'événements
        this.attachEventListeners();

        // Capturer l'état initial de la page
        console.log('capture navigation state init');

        this.captureCurrentState();
    }

    stopRecording() {
        if (!this.isRecording) return;

        console.log('⏹ Arrêt de la capture d\'événements');
        this.isRecording = false;

        // Détacher les listeners d'événements
        this.detachEventListeners();
    }

    attachEventListeners() {
        // Phase 3 : Capture complète des événements

        // 1. Clics (Phase 2)
        this.clickHandler = this.handleClick.bind(this);
        document.addEventListener('click', this.clickHandler, true);

        // 2. Saisies de texte (input, textarea)
        this.inputHandler = this.handleInput.bind(this);
        document.addEventListener('input', this.inputHandler, true);

        // 3. Changements de sélection (select, radio, checkbox)
        this.changeHandler = this.handleChange.bind(this);
        document.addEventListener('change', this.changeHandler, true);

        // 4. Soumission de formulaires
        this.submitHandler = this.handleSubmit.bind(this);
        document.addEventListener('submit', this.submitHandler, true);

        // 5. Navigation (beforeunload pour détecter les changements d'URL)
        this.beforeUnloadHandler = this.handleBeforeUnload.bind(this);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

        // 6. Hashchange et popstate pour la navigation interne
        window.addEventListener('hashchange', this.handleNavigation.bind(this));
        window.addEventListener('popstate', this.handleNavigation.bind(this));

        console.log('📋 Event listeners attachés (Phase 3 - capture complète)');
    }

    detachEventListeners() {
        // Retirer tous les listeners
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler, true);
            this.clickHandler = null;
        }

        if (this.inputHandler) {
            document.removeEventListener('input', this.inputHandler, true);
            this.inputHandler = null;
        }

        if (this.changeHandler) {
            document.removeEventListener('change', this.changeHandler, true);
            this.changeHandler = null;
        }

        if (this.submitHandler) {
            document.removeEventListener('submit', this.submitHandler, true);
            this.submitHandler = null;
        }

        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }

        window.removeEventListener('hashchange', this.handleNavigation.bind(this));
        window.removeEventListener('popstate', this.handleNavigation.bind(this));

        // Nettoyer les timers de debouncing
        this.inputDebounceTimers.forEach(timer => clearTimeout(timer));
        this.inputDebounceTimers.clear();
        this.lastInputValues.clear();

        console.log('🔌 Event listeners détachés');
    }

    handleClick(event) {
        if (!this.isRecording) return;

        // Debouncing pour éviter les double-clics
        const now = Date.now();
        if (now - this.lastClickTime < 100) {
            return;
        }
        this.lastClickTime = now;

        // Filtrage rapide des éléments interactifs
        if (!this.isElementInteractive(event.target)) {
            return;
        }

        console.log('🖱️ Clic capturé sur:', event.target);

        // Analyse de l'élément cliqué
        const actionData = this.analyzeClickedElement(event.target, event);

        // Capturer l'URL actuelle pour détecter les navigations
        const urlAtClick = window.location.href;

        // Envoi asynchrone pour ne pas bloquer l'interface
        setTimeout(() => {
            this.sendToServiceWorker('ACTION_CAPTURED', actionData);

            // Phase 4 : Capturer automatiquement l'état après l'action
            // Mais seulement si on est toujours sur la même page (pas de navigation)
            setTimeout(() => {
                if (window.location.href === urlAtClick) {
                    console.log('capture navigation state 1');
                    this.captureCurrentState();
                } else {
                    console.log('⏭️ État non capturé après clic : navigation détectée');
                }
            }, 500); // Attendre que la page se stabilise après un clic
        }, 0);
    }

    isElementInteractive(element) {
        // 1. Tags naturellement cliquables
        const clickableTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
        if (clickableTags.includes(element.tagName)) {
            return true;
        }

        // 2. Input types cliquables
        if (element.tagName === 'INPUT') {
            const clickableTypes = ['button', 'submit', 'reset', 'checkbox', 'radio'];
            return clickableTypes.includes(element.type?.toLowerCase());
        }

        // 3. Attributs indiquant une interaction
        if (element.hasAttribute('onclick') ||
            element.hasAttribute('data-action') ||
            element.getAttribute('role') === 'button' ||
            element.getAttribute('role') === 'link') {
            return true;
        }

        // 4. Styles CSS indiquant cliquabilité
        const computedStyle = window.getComputedStyle(element);
        if (computedStyle.cursor === 'pointer') {
            return true;
        }

        // 5. Éléments avec tabindex (focusables)
        if (element.hasAttribute('tabindex') && element.tabIndex >= 0) {
            return true;
        }

        // 6. Event listeners de frameworks JS
        if (element.hasAttribute('ng-click') ||     // Angular
            element.hasAttribute('@click') ||        // Vue.js
            element.hasAttribute('v-on:click')) {    // Vue.js
            return true;
        }

        return false;
    }

    analyzeClickedElement(element, event) {
        return {
            type: 'click',

            // Informations de base
            target: {
                tagName: element.tagName.toLowerCase(),
                textContent: this.extractText(element),  // Garde pour compatibilité
                textContext: this.extractTextWithContext(element),  // NOUVEAU: Contexte enrichi
                innerHTML: element.innerHTML.slice(0, 200), // Limité pour performance

                // Attributs utiles
                attributes: this.extractRelevantAttributes(element),

                // Sélecteurs multiples
                selectors: this.generateSelectors(element),

                // Position et dimensions
                position: this.getElementPosition(element, event),

                // Contexte parent
                context: this.extractContext(element),

                // Métadonnées
                isVisible: this.isElementVisible(element),
                isEnabled: !element.disabled && !element.hasAttribute('disabled')
            },

            // Détails du clic
            clickDetails: {
                clientX: event.clientX,
                clientY: event.clientY,
                button: event.button,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey
            }
        };
    }

    extractText(element) {
        // Extraire le texte visible en nettoyant
        let text = element.textContent || element.innerText || '';
        text = text.trim().replace(/\s+/g, ' '); // Normaliser les espaces
        return text.slice(0, 100); // Limiter la taille
    }

    /**
     * Extrait tous les attributs de contexte direct de l'élément
     * Capture: text, aria-label, aria-labelledby, title, data-original-title, placeholder, alt, value
     */
    extractDirectContext(element) {
        const context = {};

        // Texte de contenu (nettoyé)
        let text = (element.textContent || element.innerText || '').trim().replace(/\s+/g, ' ');
        context.text = text.slice(0, 100);

        // ARIA label
        context.ariaLabel = element.getAttribute('aria-label') || null;

        // ARIA labelledby (résoudre la référence)
        if (element.hasAttribute('aria-labelledby')) {
            const labelId = element.getAttribute('aria-labelledby');
            const labelElement = document.getElementById(labelId);
            if (labelElement) {
                context.ariaLabelledBy = labelElement.textContent.trim();
            } else {
                context.ariaLabelledBy = null;
            }
        } else {
            context.ariaLabelledBy = null;
        }

        // Title (tooltip HTML natif)
        context.title = element.getAttribute('title') || null;

        // Data-original-title (Bootstrap tooltips)
        context.dataOriginalTitle = element.getAttribute('data-original-title') || null;

        // Input-specific attributes
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            context.placeholder = element.placeholder || null;
            if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
                context.value = element.value || null;
            } else {
                context.value = null;
            }
        } else {
            context.placeholder = null;
            context.value = null;
        }

        // Button-specific
        if (element.tagName === 'BUTTON') {
            context.value = element.value || null;
        }

        // Image-specific
        if (element.tagName === 'IMG') {
            context.alt = element.getAttribute('alt') || null;
        } else {
            context.alt = null;
        }

        return context;
    }

    /**
     * Vérifie si le contexte direct est suffisant (au moins 2 caractères significatifs)
     */
    hasSufficientContext(directContext) {
        // Priorité 1: ARIA label
        if (directContext.ariaLabel && directContext.ariaLabel.length >= 2) {
            return true;
        }

        // Priorité 2: ARIA labelledby résolu
        if (directContext.ariaLabelledBy && directContext.ariaLabelledBy.length >= 2) {
            return true;
        }

        // Priorité 3: Title (tooltip HTML natif)
        if (directContext.title && directContext.title.length >= 2) {
            return true;
        }

        // Priorité 4: Data-original-title (Bootstrap tooltips)
        if (directContext.dataOriginalTitle && directContext.dataOriginalTitle.length >= 2) {
            return true;
        }

        // Priorité 5: Texte de contenu
        if (directContext.text && directContext.text.length >= 2) {
            return true;
        }

        // Priorité 6: Value ou placeholder
        if (directContext.value && directContext.value.length >= 2) {
            return true;
        }
        if (directContext.placeholder && directContext.placeholder.length >= 2) {
            return true;
        }

        // Priorité 7: Alt text (images)
        if (directContext.alt && directContext.alt.length >= 2) {
            return true;
        }

        return false;
    }

    /**
     * Extrait uniquement les noeuds texte directs du parent (pas descendants)
     */
    extractDirectTextNodes(element) {
        const textParts = [];

        for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    textParts.push(text);
                }
            }
        }

        return textParts.join(' ').trim();
    }

    /**
     * Extrait le texte d'un élément enfant (max 50 chars)
     */
    extractChildText(element) {
        const childData = {
            text: '',
            tagName: element.tagName.toLowerCase(),
            ariaLabel: null,
            title: null,
            dataOriginalTitle: null
        };

        // Priorité 1: aria-label
        if (element.hasAttribute('aria-label')) {
            childData.ariaLabel = element.getAttribute('aria-label').trim();
        }

        // Priorité 2: title
        if (element.hasAttribute('title')) {
            childData.title = element.getAttribute('title').trim();
        }

        // Priorité 3: data-original-title (Bootstrap tooltips)
        if (element.hasAttribute('data-original-title')) {
            childData.dataOriginalTitle = element.getAttribute('data-original-title').trim();
        }

        // Texte de contenu (limité à 50 chars pour enfants)
        let text = (element.textContent || '').trim().replace(/\s+/g, ' ');
        childData.text = text.slice(0, 50);

        return childData;
    }

    /**
     * Extrait le contexte du parent et de ses enfants
     * @param {HTMLElement} parentElement - L'élément parent
     * @param {HTMLElement} excludeElement - L'élément à exclure (élément cliqué)
     */
    extractParentContext(parentElement, excludeElement) {
        const context = {
            text: '',
            children: [],
            ariaLabel: null,
            title: null,
            dataOriginalTitle: null,
            role: null
        };

        // Attributs du parent
        context.ariaLabel = parentElement.getAttribute('aria-label') || null;
        context.title = parentElement.getAttribute('title') || null;
        context.dataOriginalTitle = parentElement.getAttribute('data-original-title') || null;
        context.role = parentElement.getAttribute('role') || null;

        // Texte direct du parent (noeuds texte seulement, pas descendants)
        const parentOwnText = this.extractDirectTextNodes(parentElement);

        // Collecter texte des enfants (max 5)
        let childCount = 0;
        const MAX_CHILDREN = 5;

        for (let child of parentElement.children) {
            if (child === excludeElement) continue;  // Ignorer élément cliqué
            if (childCount >= MAX_CHILDREN) break;   // Limiter à 5 enfants

            const childText = this.extractChildText(child);

            if (childText.text || childText.ariaLabel || childText.title || childText.dataOriginalTitle) {
                context.children.push(childText);
                childCount++;
            }
        }

        // Agréger tout le texte (max 200 chars)
        const allTexts = [
            parentOwnText,
            ...context.children.map(c => c.text || c.ariaLabel || c.title || c.dataOriginalTitle)
        ].filter(t => t);

        context.text = allTexts.join(' | ').slice(0, 200);

        return context;
    }

    /**
     * Vérifie si le contexte parent est significatif
     */
    hasMeaningfulParentContext(parentContext) {
        // Parent a aria-label, title ou data-original-title
        if (parentContext.ariaLabel || parentContext.title || parentContext.dataOriginalTitle) {
            return true;
        }

        // Parent ou enfants ont du texte significatif
        if (parentContext.text && parentContext.text.length >= 2) {
            return true;
        }

        // Au moins un enfant avec contexte
        if (parentContext.children.length > 0) {
            return true;
        }

        return false;
    }

    /**
     * Extrait le contexte textuel enrichi en remontant l'arborescence DOM si nécessaire
     * @param {HTMLElement} element - L'élément cliqué
     * @param {number} maxParentLevels - Nombre max de niveaux parents (défaut: 2)
     * @returns {Object} Contexte enrichi
     */
    extractTextWithContext(element, maxParentLevels = 2) {
        const result = {
            direct: {},
            parent: {
                level: 0,
                text: '',
                children: [],
                ariaLabel: null,
                title: null,
                dataOriginalTitle: null,
                role: null
            },
            hasDirectContext: false,
            hasParentContext: false,
            source: ''
        };

        // ÉTAPE 1: Extraire contexte direct
        result.direct = this.extractDirectContext(element);

        // ÉTAPE 2: Vérifier si contexte direct est suffisant
        if (this.hasSufficientContext(result.direct)) {
            result.hasDirectContext = true;
            result.source = 'direct';
            return result;
        }

        // ÉTAPE 3: Traverser parents si nécessaire
        let currentElement = element.parentElement;
        let parentLevel = 1;

        while (currentElement &&
               parentLevel <= maxParentLevels &&
               currentElement !== document.body) {

            const parentContext = this.extractParentContext(currentElement, element);

            if (this.hasMeaningfulParentContext(parentContext)) {
                result.parent = {
                    level: parentLevel,
                    ...parentContext
                };
                result.hasParentContext = true;
                result.source = `parent-${parentLevel}`;
                break;
            }

            currentElement = currentElement.parentElement;
            parentLevel++;
        }

        // ÉTAPE 4: Déterminer source finale
        if (!result.hasDirectContext && !result.hasParentContext) {
            result.source = 'none';
        }

        return result;
    }

    extractRelevantAttributes(element) {
        const relevantAttrs = [
            'id', 'class', 'name', 'type', 'value', 'href',
            'role', 'title', 'placeholder',
            'aria-label', 'aria-labelledby', 'aria-describedby',  // NOUVEAU: ARIA
            'data-original-title'  // NOUVEAU: Bootstrap tooltips
        ];
        const attributes = {};

        for (let attr of relevantAttrs) {
            if (element.hasAttribute(attr)) {
                attributes[attr] = element.getAttribute(attr);
            }
        }

        // Attributs data-*
        for (let attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                attributes[attr.name] = attr.value;
            }
        }

        return attributes;
    }

    generateSelectors(element) {
        const selectors = {};

        // 1. ID (priorité haute)
        if (element.id) {
            selectors.id = `#${element.id}`;
        }

        // 2. Combinaison de classes
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).slice(0, 3); // Max 3 classes
            if (classes.length > 0) {
                selectors.className = `.${classes.join('.')}`;
            }
        }

        // 3. Attributs data-*
        const dataAttrs = {};
        for (let attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                dataAttrs[attr.name] = attr.value;
            }
        }
        if (Object.keys(dataAttrs).length > 0) {
            selectors.dataAttributes = dataAttrs;
        }

        // 4. XPath simple
        selectors.xpath = this.generateXPath(element);

        // 5. Sélecteur CSS par position
        selectors.cssPath = this.generateCSSPath(element);

        // 6. Sélecteur par texte (fallback)
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
            selectors.textContent = text;
        }

        return selectors;
    }

    generateXPath(element) {
        // Génération XPath simple basée sur la position
        const parts = [];
        let current = element;

        while (current && current.nodeType === 1 && current !== document.body) {
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

        return parts.length > 0 ? `//${parts.join('/')}` : '';
    }

    generateCSSPath(element) {
        // Génération CSS path avec nth-child
        const parts = [];
        let current = element;

        while (current && current !== document.body && parts.length < 5) {
            let selector = current.tagName.toLowerCase();

            if (current.id) {
                selector += `#${current.id}`;
                parts.unshift(selector);
                break;
            }

            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/);
                if (classes.length > 0) {
                    selector += `.${classes[0]}`;
                }
            }

            // Ajouter nth-child si nécessaire
            let index = 1;
            let sibling = current.previousSibling;
            while (sibling) {
                if (sibling.nodeType === 1) index++;
                sibling = sibling.previousSibling;
            }

            if (index > 1) {
                selector += `:nth-child(${index})`;
            }

            parts.unshift(selector);
            current = current.parentElement;
        }

        return parts.join(' > ');
    }

    getElementPosition(element, event) {
        const rect = element.getBoundingClientRect();
        return {
            // Position du clic relative à l'élément
            relativeX: event.clientX - rect.left,
            relativeY: event.clientY - rect.top,

            // Position absolue du clic
            clientX: event.clientX,
            clientY: event.clientY,

            // Dimensions de l'élément
            boundingRect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            }
        };
    }

    extractContext(element) {
        const context = {};

        // Contexte de formulaire
        context.form = this.extractFormContext(element);

        // Contexte de section
        context.section = this.extractSectionContext(element);

        return context;
    }

    extractFormContext(element) {
        // Remonter pour trouver le formulaire parent
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            if (parent.tagName === 'FORM') {
                return {
                    formId: parent.id || null,
                    formName: parent.name || null,
                    formAction: parent.action || null,
                    formMethod: parent.method || 'GET',
                    fieldCount: parent.querySelectorAll('input, select, textarea').length
                };
            }
            parent = parent.parentElement;
        }
        return null;
    }

    extractSectionContext(element) {
        const context = {};

        // Section sémantique la plus proche
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            if (['SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'MAIN', 'HEADER', 'FOOTER'].includes(parent.tagName)) {
                context.semanticSection = {
                    tag: parent.tagName.toLowerCase(),
                    id: parent.id || null,
                    className: parent.className || null
                };
                break;
            }
            parent = parent.parentElement;
        }

        // Conteneur avec ID ou classe significative
        parent = element.parentElement;
        while (parent && parent !== document.body) {
            if (parent.id || parent.className) {
                const patterns = ['modal', 'dialog', 'sidebar', 'toolbar', 'menu', 'content', 'container'];
                const identifier = (parent.id + ' ' + parent.className).toLowerCase();

                for (let pattern of patterns) {
                    if (identifier.includes(pattern)) {
                        context.container = {
                            type: pattern,
                            id: parent.id,
                            className: parent.className
                        };
                        break;
                    }
                }
                if (context.container) break;
            }
            parent = parent.parentElement;
        }

        return context;
    }

    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return rect.width > 0 &&
               rect.height > 0 &&
               style.visibility !== 'hidden' &&
               style.display !== 'none';
    }

    handleInput(event) {
        if (!this.isRecording) return;

        const element = event.target;

        // Filtrer uniquement les éléments de saisie de texte
        if (!this.isTextInputElement(element)) {
            return;
        }

        console.log('⌨️ Saisie détectée dans:', element);

        // Debouncing : attendre 1 seconde après la dernière saisie
        const elementKey = this.getElementKey(element);

        // Annuler le timer précédent
        if (this.inputDebounceTimers.has(elementKey)) {
            clearTimeout(this.inputDebounceTimers.get(elementKey));
        }

        // Créer un nouveau timer
        const timer = setTimeout(() => {
            this.captureInputAction(element);
            this.inputDebounceTimers.delete(elementKey);
        }, 1000);

        this.inputDebounceTimers.set(elementKey, timer);
    }

    handleChange(event) {
        if (!this.isRecording) return;

        const element = event.target;

        // Capturer les changements de sélection
        if (this.isSelectionElement(element)) {
            console.log('🔄 Changement de sélection:', element);
            this.captureChangeAction(element);
        }
    }

    handleSubmit(event) {
        if (!this.isRecording) return;

        const form = event.target;

        console.log('📤 Soumission de formulaire:', form);
        this.captureSubmitAction(form, event);
    }

    handleNavigation(event) {
        if (!this.isRecording) return;

        // Détecter les changements d'URL
        const newUrl = window.location.href;
        if (newUrl !== this.currentUrl) {
            console.log('🧭 Navigation détectée:', this.currentUrl, '→', newUrl);
            this.captureNavigationAction(this.currentUrl, newUrl, event.type);
            this.currentUrl = newUrl;
        }
    }

    handleBeforeUnload(event) {
        if (!this.isRecording) return;

        // Capturer la navigation avant le déchargement de la page
        console.log('🚪 Page sur le point d\'être quittée');
        this.captureNavigationAction(window.location.href, null, 'beforeunload');
    }

    isTextInputElement(element) {
        if (element.tagName === 'TEXTAREA') {
            return true;
        }

        if (element.tagName === 'INPUT') {
            const textTypes = ['text', 'email', 'password', 'tel', 'url', 'search', 'number'];
            return textTypes.includes(element.type?.toLowerCase());
        }

        return false;
    }

    isSelectionElement(element) {
        if (element.tagName === 'SELECT') {
            return true;
        }

        if (element.tagName === 'INPUT') {
            const selectionTypes = ['checkbox', 'radio'];
            return selectionTypes.includes(element.type?.toLowerCase());
        }

        return false;
    }

    getElementKey(element) {
        // Générer une clé unique pour l'élément
        return element.id ||
               element.name ||
               element.getAttribute('data-key') ||
               this.generateCSSPath(element);
    }

    captureInputAction(element) {
        const currentValue = element.value;
        const elementKey = this.getElementKey(element);
        const lastValue = this.lastInputValues.get(elementKey);

        // Éviter de capturer si la valeur n'a pas changé
        if (currentValue === lastValue) {
            return;
        }

        this.lastInputValues.set(elementKey, currentValue);

        const actionData = {
            type: 'input',
            target: {
                tagName: element.tagName.toLowerCase(),
                inputType: element.type || 'text',
                name: element.name || '',
                id: element.id || '',
                placeholder: element.placeholder || '',
                label: this.getInputLabel(element),

                // Valeur anonymisée
                valueType: this.detectValueType(currentValue),
                valueLength: currentValue.length,
                hasValue: currentValue.length > 0,

                // Sélecteurs
                selectors: this.generateSelectors(element),

                // Contexte
                context: this.extractContext(element),

                // Métadonnées
                isRequired: element.required,
                maxLength: element.maxLength || null,
                pattern: element.pattern || null
            },

            // Détails de la saisie (anonymisés)
            inputDetails: {
                previousValueLength: lastValue ? lastValue.length : 0,
                valueChanged: currentValue !== lastValue,
                isEmpty: currentValue.length === 0,
                isFilled: currentValue.length > 0
            }
        };

        this.sendToServiceWorker('ACTION_CAPTURED', actionData);

        // Phase 4 : Capturer l'état après l'action
        setTimeout(() => {
            console.log('capture navigation state 3');

            this.captureCurrentState();
        }, 300);
    }

    captureChangeAction(element) {
        let actionData = {
            type: 'change',
            target: {
                tagName: element.tagName.toLowerCase(),
                name: element.name || '',
                id: element.id || '',

                // Sélecteurs
                selectors: this.generateSelectors(element),

                // Contexte
                context: this.extractContext(element)
            }
        };

        if (element.tagName === 'SELECT') {
            const selectedOption = element.options[element.selectedIndex];
            actionData.target.selectDetails = {
                selectedIndex: element.selectedIndex,
                selectedValue: element.value,
                selectedText: selectedOption ? selectedOption.text : '',
                optionsCount: element.options.length,
                isMultiple: element.multiple
            };
        } else if (element.type === 'checkbox') {
            actionData.target.checkboxDetails = {
                isChecked: element.checked,
                value: element.value
            };
        } else if (element.type === 'radio') {
            actionData.target.radioDetails = {
                isSelected: element.checked,
                value: element.value,
                groupName: element.name
            };
        }

        this.sendToServiceWorker('ACTION_CAPTURED', actionData);

        // Phase 4 : Capturer l'état après l'action
        setTimeout(() => {
            console.log('capture navigation state 4');

            this.captureCurrentState();
        }, 300);
    }

    captureSubmitAction(form, event) {
        // Collecter les données du formulaire (anonymisées)
        const formData = new FormData(form);
        const fields = [];

        for (let [name, value] of formData.entries()) {
            fields.push({
                name,
                valueType: this.detectValueType(value.toString()),
                hasValue: value.toString().length > 0,
                valueLength: value.toString().length
            });
        }

        const actionData = {
            type: 'submit',
            target: {
                tagName: 'form',
                id: form.id || '',
                name: form.name || '',
                action: form.action || '',
                method: form.method || 'GET',

                // Sélecteurs
                selectors: this.generateSelectors(form),

                // Contexte
                context: this.extractContext(form)
            },

            submitDetails: {
                fieldsCount: fields.length,
                fields: fields,
                hasRequiredFields: form.querySelectorAll('[required]').length > 0,
                isDefaultPrevented: event.defaultPrevented
            }
        };

        this.sendToServiceWorker('ACTION_CAPTURED', actionData);

        // Phase 4 : Capturer l'état après l'action
        setTimeout(() => {
            console.log('capture navigation state 5');

            this.captureCurrentState();
        }, 300);
    }

    captureNavigationAction(fromUrl, toUrl, navigationType) {
        const actionData = {
            type: 'navigation',

            navigationDetails: {
                from: {
                    url: fromUrl,
                    pathname: new URL(fromUrl).pathname,
                    hash: new URL(fromUrl).hash
                },
                to: toUrl ? {
                    url: toUrl,
                    pathname: new URL(toUrl).pathname,
                    hash: new URL(toUrl).hash
                } : null,
                navigationType: navigationType, // 'hashchange', 'popstate', 'beforeunload'
                timestamp: Date.now()
            }
        };

        this.sendToServiceWorker('ACTION_CAPTURED', actionData);

        // Phase 4 : Capturer l'état après l'action
        setTimeout(() => {
            console.log('capture navigation state 6');

            this.captureCurrentState();
        }, 300);

        // Capturer le nouvel état après navigation
        if (toUrl) {
            setTimeout(() => {
                console.log('capture navigation state 7');

                this.captureCurrentState();
            }, 500);
        }
    }

    getInputLabel(element) {
        // Chercher le label associé
        if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label) return label.textContent.trim();
        }

        // Chercher le label parent
        let parent = element.parentElement;
        while (parent) {
            if (parent.tagName === 'LABEL') {
                return parent.textContent.trim();
            }
            parent = parent.parentElement;
        }

        // Fallback : placeholder ou name
        return element.placeholder || element.name || '';
    }

    detectValueType(value) {
        if (!value || value.length === 0) return 'empty';

        // Patterns de détection
        const patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^[\+]?[\d\s\-\(\)\.]{7,}$/,
            url: /^https?:\/\/.+/,
            number: /^\d+(\.\d+)?$/,
            date: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
            time: /^\d{1,2}:\d{2}(:\d{2})?$/,
            creditCard: /^\d{13,19}$/,
            postalCode: /^\d{5}(-\d{4})?$/
        };

        for (let [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(value)) {
                return type;
            }
        }

        // Types basiques
        if (value.length < 3) return 'short';
        if (value.length > 100) return 'long';
        if (/^[A-Z\s]+$/.test(value)) return 'uppercase';
        if (/^\d+$/.test(value)) return 'numeric';

        return 'text';
    }

    captureCurrentState() {
        if (!this.isRecording) return;

        console.log('📊 Capture de l\'état de la page...');

        try {
            // Phase 4 : Utiliser le page analyzer pour une analyse complète
            const stateData = window.pageAnalyzer ?
                window.pageAnalyzer.analyzeCurrentPage() :
                this.fallbackStateAnalysis();

            this.sendToServiceWorker('STATE_CAPTURED', stateData);
        } catch (error) {
            console.error('Erreur lors de la capture d\'état:', error);

            // Fallback en cas d'erreur
            const fallbackData = this.fallbackStateAnalysis();
            this.sendToServiceWorker('STATE_CAPTURED', fallbackData);
        }
    }

    fallbackStateAnalysis() {
        // Analyse basique si le page analyzer n'est pas disponible
        return {
            url: window.location.href,
            title: document.title,
            timestamp: Date.now(),
            urlPattern: this.extractUrlPattern(window.location.href),

            // Informations basiques
            interactiveCount: document.querySelectorAll('button, input, select, textarea, a').length,
            formsCount: document.querySelectorAll('form').length,

            // Hash simple
            contentHash: this.simplePageHash(),

            // Marqueur de fallback
            isFallback: true
        };
    }

    extractUrlPattern(url) {
        try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;

            // Remplacer les nombres par {id}
            pathname = pathname.replace(/\/\d+/g, '/{id}');

            // Remplacer les UUIDs par {uuid}
            pathname = pathname.replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/{uuid}');

            return urlObj.origin + pathname;
        } catch (error) {
            return url;
        }
    }

    simplePageHash() {
        const content = [
            document.title,
            window.location.pathname,
            document.querySelectorAll('button, input, select').length.toString()
        ].join('|');

        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    sendToServiceWorker(type, data) {
        try {
            chrome.runtime.sendMessage({
                type,
                data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Erreur envoi vers service worker:', error);
        }
    }
}

// Initialiser le recorder
const eventRecorder = new EventRecorder();

// Exposer globalement pour que le service worker puisse l'utiliser
window.workflowRecorder = eventRecorder;
