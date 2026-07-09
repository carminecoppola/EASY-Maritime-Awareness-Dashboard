# Phase 5 - Device Manager

Data: 2026-07-08

## Obiettivo

Introduire un livello `DeviceManager` sotto `SourceManager` per rappresentare i dispositivi fisici del sistema senza avviare ancora acquisizione live, tracking, stereo, thermal fusion o overlay.

## Architettura

```text
App Flask
  -> DeviceManager
      -> Replay Device
      -> RGB LEFT Device placeholder
      -> RGB RIGHT Device placeholder
      -> THERMAL Device placeholder
  -> SourceManager
      -> interroga DeviceManager per lo stato dei device
      -> mantiene la logica di selezione sorgente
  -> Unified Frame Provider
  -> Inference Worker ONNX
  -> Detection Manager
  -> Session Manager
  -> Event Engine
```

### Flusso logico

1. `DeviceManager` normalizza lo stato dei dispositivi.
2. `SourceManager` legge lo stato astratto del device.
3. `FrameProvider` continua a lavorare sul replay.
4. `InferenceWorker` resta invariato e usa il replay o i frame unificati.
5. Ogni transizione di stato genera un evento.

## Classi

### `DeviceRecord`

Rappresenta un device registrato con i campi:

- `device_id`
- `device_type`
- `device_name`
- `serial_number`
- `driver`
- `status`
- `health`
- `fps`
- `temperature`
- `last_seen`
- `configuration`

### `DeviceStatus`

Stati supportati:

- `CONNECTED`
- `DISCONNECTED`
- `INITIALIZING`
- `STREAMING`
- `ERROR`
- `NOT_PRESENT`
- `UNKNOWN`

### `ManagedDevice`

Interfaccia base per i device:

- `connect()`
- `disconnect()`
- `check_health()`
- `refresh()`
- `get_status()`

### `ReplayDevice`

- Sempre disponibile.
- Legge la cartella replay.
- Può risultare `CONNECTED` o `STREAMING`.

### `PlaceholderDevice`

- Usato per RGB LEFT, RGB RIGHT e THERMAL.
- Non forza alcuna cattura reale.
- Può restare `NOT_PRESENT` senza errori.

### `DeviceManager`

- Registra i device.
- Espone stato aggregato.
- Gestisce refresh e lookup per ID.
- Emissione eventi su cambio stato.

## API

### `GET /api/devices`

Restituisce la lista completa dei device.

### `GET /api/devices/status`

Restituisce stato aggregato e device registrati.

### `GET /api/devices/<id>`

Restituisce il dettaglio del device richiesto.

### `POST /api/devices/refresh`

Aggiorna tutti i device.

Payload opzionale:

```json
{ "device_id": "rgb_left" }
```

## Stati

### Stati device

- `CONNECTED`
- `DISCONNECTED`
- `INITIALIZING`
- `STREAMING`
- `ERROR`
- `NOT_PRESENT`
- `UNKNOWN`

### Health derivato

- `GOOD` per `CONNECTED` e `STREAMING`
- `DEGRADED` per `INITIALIZING`
- `OFFLINE` per `DISCONNECTED`, `NOT_PRESENT`, `ERROR`
- `UNKNOWN` per gli altri casi

## Integrazione con Source Manager

`SourceManager` non decide piu` lo stato hardware direttamente. Interroga `DeviceManager` e mappa i device sui suoi stati interni:

- `CONNECTED` -> `ONLINE`
- `STREAMING` -> `STREAMING`
- `DISCONNECTED` -> `OFFLINE`
- `NOT_PRESENT` -> `NOT_AVAILABLE`
- `INITIALIZING` -> `INITIALIZING`
- `ERROR` -> `ERROR`
- `UNKNOWN` -> `UNKNOWN`

Questo rende possibile aggiungere in futuro:

- Arducam
- libcamera
- FLIR
- USB Camera
- RTSP

senza cambiare `SourceManager` o `FrameProvider`.

## Integrazione futura con libcamera

Il layer device puo` evolvere aggiungendo driver concreti sotto la stessa interfaccia:

- `driver = libcamera`
- `driver = arducam`
- `driver = flir`
- `driver = usb`
- `driver = rtsp`

Le classi sorgente e frame provider continueranno a leggere solo lo stato normalizzato del device.

## Limitazioni attuali

- Nessuna acquisizione live.
- Nessun tracking.
- Nessuna stereo fusion.
- Nessuna thermal fusion.
- Nessun overlay.
- RGB e Thermal restano placeholder.

