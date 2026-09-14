# UI toolkit per Codex

Verificato il 14 settembre 2026. Eseguire i comandi frontend da `frontend/`.

| Strumento | Stato effettivo |
| --- | --- |
| OriginKit | Server predisposto in `~/.codex/config.toml`, disabilitato; manca una chiave verificata. |
| 21st.dev | Connessione preesistente migrata da `frontend/.mcp.json` a Codex; initialize risponde 401. Disabilitata in attesa di credenziale valida. |
| Beautiful UI | Registry `@beautifului` configurato; Shimmer importato e adattato al tema EASY, usato nel caricamento della galleria. |
| Thinking Orbs | Già installato (`thinking-orbs` 0.3.1) e usato in Live/diagnostica. |
| Aceternity UI | Registry `@aceternity` configurato; LoaderOne importato, ridotto alla variante compatta con animazione CSS e reduced motion. |
| transitions.dev | Le due skill erano nel frontend; ora installate anche in `.agents/skills/` alla radice, disponibili nei prossimi turni. |
| Component Gallery | Consultato per pattern di alert; non richiede installazione. |
| Agentation | Pacchetto 3.0.2 e MCP 1.2.0 installati, server Codex configurato; toolbar presente solo nell'anteprima di sviluppo. |

## Anteprima e annotazioni

Con il tunnel Raspberry già attivo su 5500:

```bash
cd /Users/carminecoppola/development/EASY-Maritime-Awareness-Dashboard/frontend
EASY_BACKEND_ORIGIN=http://127.0.0.1:5500 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Aprire `http://127.0.0.1:5173/snapshots`. La toolbar Agentation è in basso a destra: attivarla, selezionare un elemento e aggiungere la nota. L'anteprima usa dati e API del Raspberry: le azioni di acquisizione sono reali. Le annotazioni vanno al server locale su 4747.

Codex è configurato per avviare `npx -y agentation-mcp@1.2.0 server`. Durante la verifica la porta 4747 risultava già occupata da un server Agentation funzionante (`/health`: `status=ok`, `mode=local`). L'istanza manuale aggiuntiva è stata interrotta; il server già presente è stato lasciato attivo. Non avviare una seconda istanza sulla stessa porta. I nuovi strumenti MCP richiedono che Codex ricarichi la configurazione; la loro presenza nel file non significa che siano già disponibili nel catalogo di questo turno.

```bash
# Solo se non è già attivo tramite Codex:
npx agentation-mcp server
```

Il sito su 5500 continua a essere la build del Raspberry; non include automaticamente gli strumenti aggiunti al Mac. Agentation viene escluso dalla build di produzione. Riferimento: [installazione Agentation](https://www.agentation.com/install).

## OriginKit: passaggio ancora necessario

Ottenere la chiave dal proprio account [OriginKit](https://www.originkit.dev/). Configurazione predisposta:

```toml
[mcp_servers.originkit]
url = "https://mcp.originkit.dev/mcp"
bearer_token_env_var = "ORIGINKIT_API_KEY"
enabled = false
```

Rendere `ORIGINKIT_API_KEY` disponibile al processo Codex, poi impostare `enabled = true` e ricaricare Codex. Una variabile esportata in un terminale non viene automaticamente ereditata dall'app già aperta. Non incollare la chiave in chat o in file versionati. L'endpoint è quello fornito nella richiesta; la connessione autenticata non è ancora verificata. [Configurazione MCP ufficiale Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## 21st.dev: aggiornare la credenziale

La CLI corrente è cambiata: `install claude` non è il comando di configurazione Codex documentato dal suo help. Questi comandi correnti mostrano la configurazione e avviano il login:

```bash
npx @21st-dev/cli@latest init --client codex
npx @21st-dev/cli@latest login
```

Il login CLI e l'autenticazione MCP sono da verificare separatamente. L'output ufficiale per MCP indica:

```toml
[mcp_servers.21st]
url = "https://21st.dev/api/mcp"
bearer_token_env_var = "API_KEY_21ST"
```

La vecchia configurazione migrata usa `http_headers` con `x-api-key`. Quando si adotta la nuova credenziale tramite variabile, rimuovere il vecchio header dalla sezione, impostare `enabled = true` e verificare initialize dopo il reload. Non mantenere contemporaneamente credenziali discordanti. [21st MCP e quote correnti](https://21st.dev/mcp).

## Beautiful UI e Aceternity

`frontend/components.json` contiene entrambi i registry, Tailwind 4 e l'alias `@/`. Per aggiungere altri componenti:

```bash
npx shadcn@latest view @beautifului/records-table
npx shadcn@latest add @beautifului/records-table --dry-run
npx shadcn@latest add @aceternity/bento-grid --dry-run
```

Ispezionare il risultato, quindi eseguire senza `--dry-run`. L'URL `https://www.beautifului.dev/r/registry.json` è l'indice del catalogo, non un singolo componente installabile. Usare un item specifico. Molti item Beautiful UI portano una foundation globale: adattare i token e controllare le dipendenze prima di importarne il CSS. In questa sessione il piccolo Shimmer è stato adattato direttamente, senza adottare quel reset globale.

Aceternity oggi supporta anche il CLI, oltre al copia-incolla: [documentazione ufficiale](https://ui.aceternity.com/docs/cli). Il registry loader non ha installato automaticamente Motion: la dipendenza è stata aggiunta e rimane disponibile per componenti futuri; il loader usato è stato convertito in CSS.

## Restanti strumenti

[Thinking Orbs](https://libraries.dev/orbs) non richiede reinstallazione. [transitions.dev](https://transitions.dev/) è una raccolta di skill, non una dipendenza runtime. [Component Gallery](https://component.gallery/components/alert/) serve a confrontare pattern e comportamento prima di scegliere il componente.

Per riprodurre le dipendenze versionate: `npm ci`. Per verificare: `npm run build`, `npm run lint`, `npm test`. Le skill e i server MCP sono configurazioni locali e non vengono installati da `npm ci` sul Raspberry.
