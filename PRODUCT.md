# Folio

A MarginNote 4 literature management plugin for macOS and iPad. It reads documents under a selected MarginNote folder and its descendants, opens them in MarginNote, and manages bibliographic metadata, abstracts, favorites, journal rankings, references and citations. Crossref, OpenAlex and easyScholar requests and credentials are handled by the native JSCore layer. The local React/Vite WebView only renders UI and sends MNBridge commands. Existing addon identity and JSON data paths remain compatible.

The refactor must preserve native version features and validate opaque rendering while scrolling, resizing and using immersive mode. Local bundled assets only; no remote page, font or application dependency.
