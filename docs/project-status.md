# Project status

EASY is being developed as a local maritime-awareness system running on a
Raspberry Pi. Its dashboard provides a single interface for viewing RGB and
FLIR/PureThermal feeds, organizing acquisition missions, running object
detection, and reviewing the resulting images and activity records.

## Current capabilities

- Continuous monitoring of two RGB inputs and on-demand PureThermal capture.
- Mission-based collection of photographs, AI detections, and activity logs.
- Structured session manifests and dataset validation/export.
- ONNX inference on RGB maritime images.
- Searchable archive of captures and activity, with CSV export for logs.
- Remote operation from a Mac while capture and storage remain on the Raspberry.

The camera and thermal integrations are implemented. Their availability during
a deployment still depends on the connected hardware, USB/V4L2 state, and the
operating temperature of the Raspberry Pi.

## Model and dataset

The dashboard uses `best.onnx` (YOLOv8n, 640px), exported from the model
developed in the
[EASY Maritime Awareness model repository](https://github.com/carminecoppola/easy-maritime-awareness).
It recognizes three classes: `boat`, `ship`, `buoy`.

### Known limitation: v1 baseline data leakage (superseded)

The original baseline, `EASY-v1-rgb3-buoy-rebalanced`, reported mAP50 0.942 on
its internal test set, but a sequence-level audit found data leakage in the
official train/val/test split (video sequences split across sets during a
buoy-rebalancing pass). On a corrected sequence-safe split, the same model
measures mAP50 0.382, recall 0.369, buoy recall 0.000. External validation on
MODD2 (open-water, never used in training) confirmed the gap: only 1.05% of
real obstacles detected.

The currently deployed model adds the public ABOships dataset (9038 images,
13 sequences, CC BY 4.0) to a sequence-safe split. Measured on the corrected
test set: mAP50 0.627, recall 0.592, buoy recall 0.485 (vs 0.000). On MODD2 it
still detects only 3.87% of obstacles -- better, but the open-water/small-object
domain remains underrepresented in all currently available data, public or
internal. A proprietary acquisition campaign in the real operating domain is
required before recall numbers can be trusted at sea; see the model
repository's `docs/proprietary_acquisition_spec.md`.

The official training baseline is `EASY-v1-rgb3-buoy-rebalanced`. Its repository
records the following public sources:

- **Singapore Maritime Dataset (SMD)** — primary RGB maritime source.
- **SeaShips** — supporting RGB source for ship and boat imagery; see the
  [SeaShips paper](https://sites.ucmerced.edu/files/wdu/files/seaship.pdf).
- **MassMIND (Massachusetts Maritime Infrared Dataset)** — thermal maritime
  companion and reference for future thermal development; see the
  [MassMIND repository](https://github.com/uml-marine-robotics/MassMIND).

The deployed ONNX model is currently RGB-only. MassMIND and images acquired
from the FLIR sensor are not presented as inputs to the current RGB weights;
they form part of the planned thermal and multimodal extension.

## Operational workflow

The Analysis page supports the stable test/replay workflow and can select the
live RGB providers exposed by the camera runtime. Replay remains the repeatable
validation source. The paper runtime benchmark completed ten replay-based
inference requests with a mean backend time of 608.17 ms and a mean end-to-end
API latency of 1014.19 ms. Sustained live-RGB inference still requires a
dedicated cooled field test and is not claimed by those replay measurements.
The deployed model accepts RGB input only.

The Mission page groups one acquisition period into a session. While a mission
is active, EASY can associate captured images, inference results, detections,
and logs with the same manifest. The resulting material can then be reviewed,
validated, and exported for future dataset growth and fine-tuning.

The Archive page keeps saved images and activity records accessible after a
mission. Operators can filter the records and export logs in CSV format. The
Live page remains focused on the current camera feeds and their availability.

## Next steps

1. Complete a cooled endurance test of continuous RGB plus repeated on-demand
   thermal captures.
2. Benchmark sustained ONNX inference from both live RGB views.
3. Collect new RGB and thermal samples with the EASY apparatus.
4. Review and label the acquired material before adding it to a versioned dataset.
5. Evaluate fine-tuning and, separately, a thermal or multimodal model extension.

New field data must not be added directly to the frozen EASY-v1 baseline. Any
future training dataset should have its own version, documented provenance,
label policy, and leakage-safe train/validation/test split.

## Nota: tentativo di hardening systemd (2026-08-28)

Tentato un drop-in di hardening sicuro (`NoNewPrivileges`, `ProtectKernelTunables`,
`ProtectKernelModules`, `ProtectKernelLogs`, `ProtectControlGroups`,
`RestrictSUIDSGID`, `RestrictRealtime`, `ProtectClock`, `ProtectHostname`,
`LockPersonality`) sul servizio `easy-dashboard.service` per migliorare il
punteggio `systemd-analyze security` (9.2/10 UNSAFE, nessun hardening
presente). Il tentativo ha rotto l'accesso alla camera RGB reale
(`libcamera-vid`: "Operation not permitted" su `/dev/media*`), pur non
toccando esplicitamente device/filesystem/rete. Causa probabile: una delle
direttive `Protect*`/`NoNewPrivileges` interferisce col modello di permessi
gestito da udev per i device multimediali (verosimilmente richiede
appartenenza a gruppi supplementari applicata a runtime). Ripristinato
immediatamente e verificato che RGB torni STREAMING. Non ritentare senza un
ciclo di test isolato (bisect delle singole direttive) fuori da un momento
di utilizzo attivo dell'hardware — non è più stato ritentato in questa sessione.

## Bisection hardening systemd (2026-08-28, seguito)

Bisect completo delle 10 direttive del tentativo precedente, testate una alla
volta contro il servizio live reale (systemd restart + verifica STREAMING
della camera RGB dopo ogni singola direttiva):

PASS (sicure singolarmente): `NoNewPrivileges`, `ProtectKernelTunables`,
`ProtectKernelModules`, `ProtectKernelLogs`, `ProtectControlGroups`,
`RestrictSUIDSGID`, `RestrictRealtime`, `ProtectHostname`, `LockPersonality`.

FAIL: `ProtectClock=true` — rompe l'acquisizione camera RGB da sola
("Operation not permitted" su `/dev/media*`, stesso sintomo del tentativo
combinato). Causa probabile: `ProtectClock` nega l'accesso a
`CAP_SYS_TIME`/`CAP_WAKE_ALARM` e ad alcune interfacce clock del kernel;
libcamera/il pipeline handler RPi potrebbe richiedere accesso a interfacce
correlate all'orologio di sistema per la sincronizzazione dei frame o la
gestione dei device V4L2/media, sebbene la causa esatta non sia stata
isolata a livello di syscall.

Le altre 9 direttive sono state confermate sicure singolarmente. Non sono
state testate in combinazione tra loro in questa sessione: se si vuole
applicare l'hardening in futuro, applicarle insieme (escludendo
`ProtectClock`) e verificare comunque l'accesso camera con un ciclo di
restart dedicato, dato che un'interazione tra più direttive non è esclusa
a priori.


## Ground-readiness check (2026-09-10, remote)

Combined-load endurance pass (~5 min, 17 cycles: inference + temperature +
memory sampling every ~18s): temperature stable 57.9-61.3C, no throttling
event during the window, memory stable ~1.6GB/7.8GB, 17/17 inference calls
succeeded (955-1500ms), zero errors in the service log.

Repeated thermal capture (20 back-to-back `/thermal/refresh` calls, ~1s
apart): 20/20 succeeded, no degradation, status stayed READY throughout.

**Open issue found**: `vcgencmd get_throttled` reports `0x50000` --
under-voltage and throttling have occurred since last boot (not during this
test, but at some point). Likely cause: power supply/USB-C cable not rated
for the combined camera + inference load. Needs physical check before sea
deployment: official Pi 4 power supply (5V/3A), cable quality, any USB hub
drawing current from the same rail.

7-day log review: no recurring errors beyond normal per-boot camera
initialization sequence (NOT_PRESENT -> ERROR -> INITIALIZING -> STREAMING,
self-resolves in under a second, expected behavior).

Not testable without the actual sea environment: wave motion/vibration,
real water glare and lighting conditions, detection validation against real
open-water objects (this is the object of the planned proprietary
acquisition campaign, not a bench test).
