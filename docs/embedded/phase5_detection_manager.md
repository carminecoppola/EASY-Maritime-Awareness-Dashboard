# Phase 5 - Detection Manager

## Obiettivo

Il Detection Manager introduce un livello centrale tra l'Inference Worker e la dashboard.
Da questo step le detection non vengono piu' considerate un semplice output isolato
dell'inferenza, ma oggetti strutturati di sessione.

Pipeline attuale:

```text
Frame Provider
        |
        v
Inference Worker
        |
        v
Detection Manager
        |
        +-- REST API
        +-- Dashboard
        +-- Current Detections
        +-- Detection History
```

## Responsabilita'

Il Detection Manager:

- riceve le detection prodotte dall'Inference Worker
- normalizza ogni detection in un modello dati stabile
- mantiene le detection correnti in memoria
- mantiene lo storico della sessione in memoria
- persiste i risultati in `runtime/sessions/`
- genera log strutturati per ogni nuova detection
- diventa la sorgente ufficiale delle detection per backend e dashboard

L'Inference Worker resta responsabile solo di:

- caricare il modello ONNX
- eseguire preprocess, inference e NMS
- salvare la preview annotata
- consegnare il risultato al Detection Manager

## Persistenza Runtime

File aggiornati automaticamente:

```text
runtime/sessions/current_detections.json
runtime/sessions/detection_history.json
runtime/sessions/current_detections.jpg
```

`current_detections.json` contiene solo l'ultimo batch corrente.
`detection_history.json` contiene tutte le detection della sessione.
`current_detections.jpg` resta la preview annotata prodotta dal worker.

## Modello Detection

Ogni detection contiene:

```text
id
timestamp
session_id
source
source_label
image_name
image_path
class_id
class_name
confidence
bbox.x1
bbox.y1
bbox.x2
bbox.y2
status
created_at
updated_at
track_id
thermal_confirmation
depth
distance
velocity
```

Campi come `track_id`, `thermal_confirmation`, `depth`, `distance` e `velocity`
sono presenti ma non hanno ancora logica applicativa. Servono a preparare tracking,
stereo vision e fusione RGB-termica.

## Stati

Stati implementati in questa fase:

- `NEW`: detection appena prodotta dall'ultima inferenza
- `ACTIVE`: detection precedente conservata nello storico

La logica completa di tracking e archiviazione verra' introdotta nelle fasi successive.

## API

Endpoint ufficiali:

```text
GET    /api/detection/current
GET    /api/detection/history
GET    /api/detection/<id>
DELETE /api/detection/clear
```

Compatibilita':

```text
GET /api/detections/current
```

L'endpoint compatibile restituisce lo stesso payload di `/api/detection/current`.

## Dashboard

La dashboard ora legge le detection correnti dal Detection Manager tramite:

```text
GET /api/detection/current
```

La pagina Rilevazioni continua a mostrare:

- tabella detection
- badge AI LIVE / AI DEMO
- preview annotata
- metriche della sessione

Il frontend non legge piu' direttamente l'output grezzo dell'Inference Worker.

## Logging

Ogni nuova detection genera un evento:

```text
source: DETECTION_MANAGER
type: DETECTION_NEW
```

Il log contiene id, classe, confidence, sorgente, bbox e metadata necessari per debug.

## Estensioni Previste

Il manager e' pensato per supportare senza ristrutturazioni profonde:

- Tracking
- Stereo Vision
- RGB + Thermal Fusion
- Event Engine
- Session Manager
- Environmental Awareness

In particolare i campi gia' predisposti permetteranno di collegare in seguito
track persistenti, conferme termiche, profondita', distanza e velocita'.
