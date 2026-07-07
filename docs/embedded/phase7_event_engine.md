# Phase 7 - Event Engine

## Obiettivo

Lo Step 7 introduce un livello logico superiore alle detection.

- La detection descrive cosa il modello AI ha trovato.
- L'evento descrive cosa il sistema ritiene rilevante per il monitoraggio.

La dashboard continua a poter mostrare le detection, ma la vista principale della pagina `Rilevazioni` ora è basata sugli eventi.

## Architettura

La pipeline aggiornata è:

```text
Frame Provider
        |
        v
Inference Worker
        |
        v
Detection Manager
        |
        v
Session Manager
        |
        v
Event Engine
        |
        +-- REST API
        +-- Dashboard
        +-- Current Events
        +-- Event History
        +-- Future Awareness Engine
```

## Flusso Dati

1. `InferenceWorker` produce detection strutturate.
2. `DetectionManager` salva current/history detection come prima.
3. Ogni detection passa anche a `EventManager`.
4. `EventManager` applica:
   - classificazione evento
   - severità iniziale
   - deduplicazione
   - aggiornamento stato evento
   - persistenza runtime e di sessione
5. La dashboard consuma solo le API eventi per la vista principale.

## Modello Evento

Il modulo principale è `event_manager.py`.

Ogni evento contiene i campi richiesti:

```text
event_id
session_id
type
severity
status
source
related_detection_ids
created_at
updated_at
```

Sono già predisposti anche:

```text
track_id
thermal_confirmation
distance
priority
resolved_at
notes
```

Per la deduplicazione e il monitoraggio reale sono presenti inoltre:

```text
update_count
last_timestamp
last_confidence
event_key
source_label
meta
```

## Generazione Eventi

La mappatura iniziale è volutamente semplice:

```text
Boat -> BoatDetected -> LOW
Ship -> ShipDetected -> LOW
Buoy -> BuoyDetected -> INFO
```

Ogni detection genera un nuovo evento solo se non esiste gia' un evento equivalente attivo per:

- sessione
- tipo evento
- sorgente
- track id (se presente)

## Deduplicazione

La deduplicazione e' il comportamento centrale dello Step 7.

Quando arrivano detection equivalenti:

- non viene creato un nuovo evento
- viene aggiornato l'evento esistente
- aumenta `update_count`
- viene aggiornato `updated_at`
- viene aggiornato `last_timestamp`
- viene aggiornato `last_confidence`
- il nuovo `detection_id` viene aggiunto a `related_detection_ids`

Il primo match crea un evento con stato `NEW`.
Gli aggiornamenti successivi portano lo stato a `ACTIVE`.

La struttura `RESOLVED` e' gia' disponibile e viene usata alla chiusura sessione.

## Gestione Severita'

Le severita' supportate dal modello dati sono:

- `INFO`
- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

In questo step la logica effettiva usa solo:

- `BoatDetected -> LOW`
- `ShipDetected -> LOW`
- `BuoyDetected -> INFO`

La struttura e' pronta per regole future basate su:

- tracking
- distanza
- conferma termica
- frequenza di aggiornamento
- fusione di sensori

## Persistenza

Il runtime mantiene:

- `runtime/sessions/current_events.json`
- `runtime/sessions/event_history.json`

Ogni sessione mantiene anche:

- `runtime/sessions/session_xxx/events.json`

Il file di sessione ora contiene:

- `events`: storico eventi della sessione
- `current_events`: eventi ancora attivi
- `activity_log`: log tecnico della sessione gia' esistente

Questo approccio evita di perdere compatibilita' con il `SessionManager`.

## API

Nuovi endpoint introdotti:

```text
GET    /api/events/current
GET    /api/events/history
GET    /api/events/<id>
DELETE /api/events/clear
POST   /api/events/clear
```

Le API restituiscono JSON strutturati con:

- `ok`
- `count`
- `events`
- path runtime utili alla diagnostica
- `updated_at`

## Integrazione Dashboard

La pagina `Rilevazioni` ora mostra in alto:

- `Current Events`
- `Timeline`

La sezione detection resta disponibile in `Advanced Debug` con:

- filtri detection
- tabella detection
- preview AI
- metriche detection

Questo consente di:

- parlare in termini di monitoraggio per l'utente operativo
- mantenere la diagnostica tecnica per sviluppo e debug

## Compatibilita' Futura

L'Event Engine e' stato progettato per estensioni senza refactor sostanziali verso:

- Tracking
- Stereo Vision
- Thermal Fusion
- Environmental Awareness
- Notification System
- Dataset Generation

Gli hook principali gia' predisposti sono:

- `track_id`
- `thermal_confirmation`
- `distance`
- `priority`
- `resolved_at`
- `meta`

## Note di Compatibilita'

- `InferenceWorker` non e' stato modificato nel suo contratto principale.
- `DetectionManager` continua a persistere detection come prima.
- `SessionManager` continua a gestire sessioni e metriche, aggiungendo supporto a conteggio eventi.
- Replay, Snapshot e API detection restano disponibili.
