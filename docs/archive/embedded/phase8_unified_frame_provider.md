# Phase 8 - Unified Frame Provider

## Perche' Serve

Fino a questo step la pipeline AI dipendeva implicitamente dal replay immagini.

Questo rendeva piu' difficile estendere il sistema a:

- replay cartelle immagini
- replay video
- RGB LEFT / RGB RIGHT
- THERMAL / FLIR
- webcam
- dataset folder
- acquisizione reale in postazione

Il `Unified Frame Provider` risolve questo vincolo introducendo un livello unico tra sorgente e `InferenceWorker`.

## Nuova Pipeline

```text
Unified Frame Provider
        |
        v
Frame Object
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
        v
Dashboard
```

## Source Types Supportati

I source type standardizzati usati dal backend sono:

```text
REPLAY_IMAGE
REPLAY_FOLDER
REPLAY_VIDEO
RGB_LEFT
RGB_RIGHT
THERMAL
WEBCAM
DATASET
UNKNOWN
```

## Frame Object

Il modulo `frame_provider.py` definisce `FrameObject`.

Campi principali:

```text
frame_id
timestamp
source_type
source_name
image_path
image
width
height
metadata
session_id
```

Campi futuri gia' predisposti:

```text
camera_id
sequence_id
frame_index
thermal_metadata
stereo_metadata
calibration_id
```

Questo oggetto e' il contratto unico consegnato all'`InferenceWorker`.

## Provider Implementati

### ImageFrameProvider

- legge una singola immagine
- restituisce un `FrameObject`

### FolderFrameProvider

- legge immagini da una cartella
- supporta `next frame`
- supporta `reset`
- supporta `loop`

### VideoFrameProvider

- usa OpenCV se disponibile
- legge frame da video
- supporta `next frame`
- puo' salvare frame temporanei se richiesto

### CameraFrameProvider placeholder

- copre `RGB_LEFT`, `RGB_RIGHT`, `THERMAL`, `WEBCAM`
- se la camera non e' disponibile restituisce errore chiaro
- non fa crashare inference o dashboard

## Factory / Registry

La creazione dei provider avviene tramite `FrameProviderFactory`.

Esempio:

```python
provider = FrameProviderFactory.create(
    source_type="REPLAY_FOLDER",
    source_path="runtime/replay/test_inference",
    loop=True,
)
```

`UnifiedFrameProvider` usa questa factory e mantiene lo stato runtime del provider attivo.

## Integrazione con Inference Worker

`InferenceWorker` ora supporta due ingressi:

- `run_on_image(image_path)` per retrocompatibilita'
- `run_on_frame(frame)` come percorso consigliato

Inoltre espone:

- `configure_frame_provider(...)`
- `frame_provider_status()`
- `next_frame()`
- `run_on_next_frame()`
- `reset_frame_provider()`

Il worker non assume piu' che il frame arrivi da `replay_dir`.
Quando il frame non ha ancora un file associato, il worker puo' salvarlo in cache locale per mantenere compatibilita' con preview e archivi.

## Compatibilita' con Detection Manager

Le detection ora possono conservare anche:

```text
frame_id
source_type
source_name
image_name
session_id
```

Il `DetectionManager` non cambia responsabilita', ma persiste il contesto frame necessario per gli step successivi.

## Compatibilita' con Session Manager ed Event Engine

- `SessionManager` continua a creare sessioni automatiche replay quando necessario
- le detection generate da un frame mantengono il `session_id`
- `EventEngine` continua a deduplicare e archiviare eventi senza conoscere la sorgente reale del frame

In questo modo i layer superiori restano stabili mentre cambia la sorgente dati.

## API Nuove

Endpoint introdotti per il Frame Provider:

```text
GET  /api/frame-provider/status
POST /api/frame-provider/configure
POST /api/frame-provider/reset
POST /api/frame-provider/next-frame
POST /api/inference/run-on-next-frame
```

Le risposte JSON includono:

- stato provider
- source type
- source path / source name
- frame corrente
- indice frame
- totale frame quando disponibile
- errori chiari in caso di provider non pronto

## Configurazione Runtime

File introdotto:

```text
runtime/config/frame_provider_config.yaml
```

Campi principali:

```yaml
default_source_type: REPLAY_FOLDER
default_source_path: runtime/replay/test_inference
loop: true
save_temp_frames: false
```

## Dashboard

La pagina `Rilevazioni` include ora un pannello `Frame Source` con:

- source type
- source path
- current frame id
- current frame index
- total frames
- stato provider

Controlli disponibili:

- configure replay folder
- next frame
- run inference on next frame
- reset provider

Le detection restano nella sezione debug e la vista eventi rimane il focus primario per l'operatore.

## Limiti Attuali

- il provider camera e' ancora placeholder
- non e' ancora presente overlay live per frame provider
- tracking non e' implementato
- stereo non e' implementato
- thermal fusion non e' implementata
- il provider video richiede OpenCV disponibile nell'ambiente

## Prossimi Step

Questa astrazione prepara il sistema a:

- provider camera reali RGB LEFT / RGB RIGHT
- provider termico reale
- frame synchronization multi-source
- tracking
- stereo vision
- thermal fusion
- awareness engine completo
