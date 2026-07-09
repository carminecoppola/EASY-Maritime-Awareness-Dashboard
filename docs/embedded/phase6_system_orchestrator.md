# Phase 6 - System Orchestrator

Data: 2026-07-09

## Obiettivo

Centralizzare il controllo della piattaforma EASY in un unico punto di coordinamento, senza cambiare il modello AI, il replay o la logica di detection già validata.

## Diagramma architetturale

```text
Flask App
  -> System Orchestrator
      -> DeviceManager
      -> SourceManager
      -> UnifiedFrameProvider
      -> InferenceWorker
      -> DetectionManager
      -> SessionManager
      -> EventManager
      -> External runtime components
           -> SystemProbe
           -> RGB source
           -> Thermal source
```

## Componenti registrati

### Manager principali

- `device_manager`
- `source_manager`
- `frame_provider`
- `inference_worker`
- `detection_manager`
- `session_manager`
- `event_manager`

### Componenti esterni registrati dall'app

- `probe`
- `rgb`
- `thermal`

## Responsabilita` dell'orchestratore

- Istanziare i manager principali in ordine corretto.
- Esporre una vista unica dello stato del sistema.
- Coordinare `start()`, `stop()` e `restart()`.
- Aggregare uptime, errori e stato dei componenti.
- Lasciare invariato il comportamento del replay e della pipeline AI.

## Metodi esposti

### `start()`

Avvia o riallinea i componenti runtime disponibili:

- refresh di `DeviceManager` e `SourceManager`
- `rgb.ensure_running()`
- `thermal.start()` quando applicabile

### `stop()`

Ferma i componenti safe-to-stop:

- `InferenceWorker.stop()`
- `RgbMasterSource.stop()`

La parte termica reale non viene forzata a una sequenza di stop/restart distruttiva.

### `restart()`

Esegue un ciclo di stop/start non distruttivo sui componenti supportati e aggiorna la health view.

### `health()`

Restituisce:

- stato orchestratore
- uptime
- componenti registrati
- errori correnti

### `components()`

Restituisce l'elenco dettagliato dei componenti con:

- id
- label
- kind
- status
- health
- uptime
- error
- details

## Nuove API

### `GET /api/system/status`

Vista sintetica dello stato del sistema orchestrato.

### `GET /api/system/components`

Elenco dettagliato dei componenti registrati.

### `POST /api/system/restart`

Richiede un restart logico dei componenti gestiti dall'orchestratore.

## Integrazione con Source Manager

`SourceManager` continua a operare sulla sorgente replay e sulle sorgenti placeholder, ma ora legge lo stato hardware astratto dal `DeviceManager`.

Questo mantiene separata la logica di selezione sorgente dal dettaglio dei device fisici.

## Integrazione con la dashboard

La pagina `system-diagnostics` ora mostra:

- stato orchestratore
- componenti attivi
- uptime
- errori recenti
- stato device

## Test eseguiti

- `python3 -m py_compile`
- test frame provider replay
- test pipeline phase 2
- controllo API `/api/devices`
- controllo API `/api/sources`
- controllo API `/api/system/status`
- controllo API `/api/system/components`

## Limitazioni attuali

- Nessuna acquisizione live.
- Nessun tracking.
- Nessuna stereo fusion.
- Nessuna thermal fusion.
- Nessun overlay AI.
- Il replay resta la modalità validata per l'inference.

