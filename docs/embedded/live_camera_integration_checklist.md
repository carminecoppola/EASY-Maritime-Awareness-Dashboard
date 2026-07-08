# EASY Dashboard - Live Camera Integration Checklist

Data: 2026-07-08

## 1. Stato Attuale

- Replay operativo e già validato su Raspberry Pi.
- Source Manager implementato e pronto per la selezione sorgente.
- RGB LEFT, RGB RIGHT e THERMAL registrati come placeholder.
- Pipeline AI già validata in modalità Replay.
- Le sorgenti live reali non sono ancora collegate al prototipo hardware.
- Il sistema deve continuare a funzionare correttamente anche con camere non disponibili, scollegate o con obiettivo chiuso.

## 2. Requisiti Hardware

- Raspberry Pi compatibile con il carico previsto.
- Modulo camera Arducam / Camarray, se previsto dal prototipo finale.
- Sorgente RGB LEFT.
- Sorgente RGB RIGHT.
- Sensore termico / FLIR.
- Alimentazione stabile e adeguata al carico di camere e accessori.
- Case o supporto meccanico per il montaggio.
- Cablaggio completo e verificato.
- Connettori, adattatori e fissaggi necessari.

## 3. Verifiche Preliminari

- Verificare il rilevamento delle camere da parte del sistema operativo.
- Eseguire un test `libcamera`.
- Eseguire un test stream su singola camera.
- Eseguire un test stream dual camera.
- Eseguire un test della termica.
- Verificare la temperatura della Raspberry durante l’esercizio.
- Verificare la stabilità dell’alimentazione durante i test.
- Verificare che non compaiano crash se una camera non è disponibile.

## 4. Integrazione Software

### RGB LEFT

- Provider da implementare: provider live RGB basato sul dispositivo reale disponibile, ad esempio `libcamera` o `Arducam`.
- Comando / test minimo: avvio stream singolo e acquisizione di un frame valido.
- Output atteso: frame leggibile, stato sorgente coerente, nessun crash in caso di assenza hardware.
- Stato Source Manager atteso: `ONLINE`, `STREAMING`, `OFFLINE` o `NOT_AVAILABLE` a seconda del contesto.
- Fallback se non disponibile: `NOT_AVAILABLE` con messaggio chiaro.

### RGB RIGHT

- Provider da implementare: provider live RGB basato sul dispositivo reale disponibile, ad esempio `libcamera` o `Arducam`.
- Comando / test minimo: avvio stream singolo e acquisizione di un frame valido.
- Output atteso: frame leggibile, stato sorgente coerente, nessun crash in caso di assenza hardware.
- Stato Source Manager atteso: `ONLINE`, `STREAMING`, `OFFLINE` o `NOT_AVAILABLE` a seconda del contesto.
- Fallback se non disponibile: `NOT_AVAILABLE` con messaggio chiaro.

### THERMAL

- Provider da implementare: provider termico reale basato sul sensore FLIR / placeholder termico supportato dal progetto.
- Comando / test minimo: acquisizione di un frame termico valido o risposta placeholder controllata.
- Output atteso: frame termico leggibile oppure placeholder esplicito, stato coerente, nessun crash.
- Stato Source Manager atteso: `ONLINE`, `STREAMING`, `OFFLINE` o `NOT_AVAILABLE` a seconda del contesto.
- Fallback se non disponibile: `NOT_AVAILABLE` con messaggio chiaro.

## 5. API da Usare

- `/api/sources/status`
- `/api/sources/select`
- `/api/frame-provider/status`
- `/api/inference/status`

Uso previsto:

- verificare lo stato delle sorgenti prima del test
- selezionare la sorgente attiva senza riavvio dashboard
- controllare lo stato del frame provider
- verificare lo stato dell’inferenza dopo la selezione sorgente

## 6. Dashboard

Verificare i seguenti pannelli e aree:

- `Mission Sources`
- `Frame Source`
- `Current Session`
- `Current Events`
- `Detection Preview`

Controlli richiesti:

- selezione sorgente visibile e coerente
- stato sorgenti leggibile
- aggiornamento senza refresh manuale della pagina
- nessun errore JavaScript
- nessun blocco dell’interfaccia

## 7. Criteri di Successo

- Nessun crash quando una camera non è disponibile.
- Selezione sorgente corretta dal Source Manager.
- Frame acquisito dalla sorgente selezionata quando disponibile.
- Inferenza opzionale e non bloccante per la validazione iniziale.
- Sessione aggiornata correttamente.
- Eventi e log coerenti con le azioni eseguite.
- Replay ancora funzionante come fallback di regressione.

## 8. Rischi

- Camera non rilevata dal sistema.
- Multiplexer non configurato correttamente.
- FPS troppo basso per l’uso atteso.
- Temperatura Raspberry troppo alta.
- Alimentazione instabile o insufficiente.
- Obiettivi chiusi, coperti o protetti che impediscono un frame utile.
- Driver o tool `libcamera` non coerenti con il prototipo montato.

## 9. Piano di Test Consigliato

1. Test replay regression.
2. Test RGB LEFT.
3. Test RGB RIGHT.
4. Test termica.
5. Test switch sorgenti.
6. Test sessione.
7. Test benchmark breve.

## Note Operative

- Questa checklist serve solo a preparare la fase hardware successiva.
- Non introduce nuove feature.
- Non modifica Source Manager.
- Non modifica Frame Provider.
- Il comportamento di Replay deve restare stabile fino all’integrazione live reale.

