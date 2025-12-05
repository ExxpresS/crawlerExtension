# 🎬 Workflow Recorder

https://github.com/Bessouat40/RAGLight?tab=readme-ov-file#%E2%9A%A0%EF%B8%8F-requirements

Extension Chrome pour capturer et enregistrer automatiquement les workflows utilisateur sur les applications SaaS métier.

## 🚀 Fonctionnalités

- **Enregistrement automatique** des interactions utilisateur (clics, saisies, formulaires, navigation)
- **Capture d'état de page** avec conversion HTML vers Markdown
- **Stockage local** dans IndexedDB
- **Export multi-formats** : JSON, CSV, HTML, Selenium, RAG (optimisé pour IA/LLM)
- **Interface de gestion** : recherche, visualisation, suppression de workflows
- **Anonymisation automatique** des données sensibles

## 📦 Installation

### Chargement en développement

1. Cloner le repository :
   ```bash
   git clone https://github.com/VOTRE_USERNAME/crawlerExtension.git
   cd crawlerExtension
   ```

2. Ouvrir Chrome et naviguer vers `chrome://extensions/`

3. Activer le **Mode développeur** (toggle en haut à droite)

4. Cliquer sur **"Charger l'extension non empaquetée"**

5. Sélectionner le dossier du projet

6. L'extension devrait apparaître dans la barre d'outils Chrome

## 🎯 Utilisation

1. **Démarrer un enregistrement** :
   - Cliquer sur l'icône de l'extension
   - Cliquer sur "🔴 Démarrer l'enregistrement"
   - Effectuer vos actions sur la page web
   - Cliquer sur "⏹ Arrêter l'enregistrement"

2. **Sauvegarder le workflow** :
   - Donner un titre au workflow
   - Ajouter une description et des tags (optionnel)
   - Cliquer sur "💾 Sauvegarder"

3. **Gérer les workflows** :
   - Accéder à la liste des workflows sauvegardés
   - Rechercher, visualiser, exporter ou supprimer

4. **Exporter** :
   - Choisir un workflow
   - Sélectionner le format d'export (JSON, CSV, HTML, Selenium, RAG)
   - Le fichier se télécharge automatiquement

## 📁 Structure du projet

```
crawlerExtension/
├── background/
│   ├── service-worker.js    # Orchestrateur principal
│   └── db-manager.js         # Gestionnaire IndexedDB
├── content-scripts/
│   ├── recorder.js           # Capture d'événements
│   └── page-analyzer.js      # Analyse de page
├── popup/
│   ├── popup.html            # Interface utilisateur
│   ├── popup.js              # Logique UI
│   └── popup.css             # Styles
├── export/
│   ├── export-manager.js     # Gestion des exports
│   └── rag-formatter.js      # Format RAG pour IA
├── libs/
│   ├── utils.js              # Utilitaires
│   └── turndown.min.js       # HTML to Markdown
├── icons/                    # Icônes de l'extension
├── manifest.json             # Configuration Chrome Extension
├── CLAUDE.md                 # Documentation pour Claude Code
└── README.md                 # Ce fichier
```

## 🛠️ Technologies

- **Chrome Extension API** (Manifest V3)
- **IndexedDB** pour le stockage persistant
- **Turndown** pour conversion HTML → Markdown
- Vanilla JavaScript (pas de framework)

## 📊 Formats d'export

### JSON
Données structurées complètes (workflow, actions, états)

### CSV
Tableau des actions pour analyse dans Excel/Google Sheets

### HTML
Documentation visuelle lisible (prête pour conversion PDF)

### Selenium
Scripts Python de test automatisés générés automatiquement

### RAG (Retrieval-Augmented Generation)
Format optimisé pour systèmes IA/LLM :
- Chunks optimisés pour embedding (~512 tokens)
- Paires Question/Réponse automatiques
- Métadonnées enrichies
- Instructions procédurales structurées

## 🔒 Confidentialité

- **100% local** : toutes les données sont stockées localement dans votre navigateur
- **Anonymisation automatique** : emails, téléphones, URLs et cartes bancaires sont anonymisés
- **Pas de télémétrie** : aucune donnée n'est envoyée à des serveurs externes
- **Aucun tracking** : pas de collecte de données analytiques

## 🧪 Tests

Pages de test incluses :
- `test-page.html` : Tests de base (clics, formulaires)
- `test-page-complex.html` : Dashboard entreprise complexe

## 📝 License

[À définir]

## 👤 Auteur

Pierre Nolot

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 🗺️ Roadmap

- [x] Phase 1-6 : Fonctionnalités de base
- [ ] Phase 7 : Intelligence Artificielle avancée (RAG complet)
- [ ] Phase 8 : Replay & Automatisation
- [ ] Phase 9 : Collaboration & Cloud
- [ ] Phase 10 : Analytics & Insights

---

Made with ❤️ for automating workflow documentation
