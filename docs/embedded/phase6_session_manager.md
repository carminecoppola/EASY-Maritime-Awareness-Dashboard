# Phase 6 - Session Manager

## Obiettivo

Il Session Manager rende EASY una piattaforma di acquisizione organizzata per sessioni.
Ogni detection prodotta dalla pipeline AI viene collegata a una sessione e archiviata
con metadati, metriche e struttura dati pronta per le fasi successive.

Pipeline:

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
        +-- Dashboard
        +-- Session Archive
        +-- Detection Archive
        +-- Metrics
        +-- Future Event Engine
```

## Responsabilita'

Il Session Manager gestisce:

- ciclo di vita delle sessioni
- creazione automatica delle cartelle runtime
- `metadata.json`
- `detections.json`
- `metrics.json`
- `events.json`
- indice persistente delle sessioni
- caricamento automatico dell'ultima sessione ancora `RUNNING`
- collegamento con Detection Manager

## Struttura Cartelle

Ogni sessione viene creata sotto:

```text
runtime/sessions/session_<timestamp>/
```

Contenuto:

```text
metadata.json
detections.json
metrics.json
events.json
snapshots/
replay/
rgb_left/
rgb_right/
thermal/
```

L'indice globale si trova in:

```text
runtime/sessions/index.json
```

## Metadata

`metadata.json` contiene:

- `session_id`
- `start_time`
- `end_time`
- `duration`
- `status`
- `mode`
- `operator`
- `hostname`
- `model_name`
- `model_type`
- `project_version`
- campi modificabili futuri come campagna, posizione, meteo e note

Status supportati:

- `CREATED`
- `RUNNING`
- `STOPPED`

In questa fase le sessioni vengono create direttamente in stato `RUNNING`.

## Metriche

`metrics.json` contiene:

- `total_detections`
- `boat_count`
- `ship_count`
- `buoy_count`
- `session_duration`
- `inference_calls`
- `average_inference_time`

Le metriche vengono aggiornate automaticamente quando il Detection Manager registra
un risultato di inference.

## API

Endpoint disponibili:

```text
POST /api/session/start
POST /api/session/stop
GET  /api/session/status
GET  /api/session/current
GET  /api/session/list
```

Payload tipico per start:

```json
{
  "mode": "replay",
  "operator": "dashboard",
  "notes": ""
}
```

## Integrazione Detection Manager

Il Detection Manager riceve un riferimento al Session Manager.

Quando arrivano nuove detection:

- viene garantita una sessione attiva
- ogni detection riceve `session_id`
- `runtime/sessions/current_detections.json` resta aggiornato
- `runtime/sessions/detection_history.json` resta aggiornato
- la detection viene aggiunta anche a `runtime/sessions/session_<timestamp>/detections.json`
- le metriche della sessione vengono aggiornate

Se l'utente non ha avviato manualmente una sessione, il sistema crea una sessione
automatica in modalita' `replay` per non perdere dati e mantenere la pipeline compatibile.

## Dashboard

La pagina Rilevazioni mostra il pannello `Current Session` con:

- Session ID
- Status
- Start Time
- Duration
- Model
- Mode
- Total detections
- Boat
- Ship
- Buoy

Sono disponibili i controlli:

- `Start Session`
- `Stop Session`

## Estensioni Future

La struttura e' pronta per:

- Event Engine
- Tracking
- Stereo Vision
- Thermal Fusion
- Dataset EASY-v2
- esportazione sessioni
- campagne sperimentali reali
