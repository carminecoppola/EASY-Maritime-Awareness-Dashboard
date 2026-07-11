# EASY Maritime Awareness Dashboard — guida operativa

Questa dashboard controlla le camere RGB, il sensore termico FLIR/PureThermal,
gli snapshot e l’inferenza locale sulla Raspberry. L’obiettivo pratico è
raccogliere dati ordinati per analisi e fine-tuning, non solo “vedere video”.

## Flusso consigliato

1. Apri la pagina **Live**.
2. Verifica che RGB sinistra, RGB destra e termica siano leggibili.
3. Premi **Avvia missione** prima di raccogliere dati importanti.
4. Usa **Salva foto** per acquisire campioni.
5. Vai in **Rilevazioni** per avviare o controllare l’inferenza.
6. Vai in **Foto e log** per verificare immagini salvate, eventi ed errori.
7. Termina la missione quando hai finito la sessione di raccolta.

## Cosa significano le sezioni

### Live

È la vista operativa. I flussi video possono continuare a scorrere mentre lo
stato si aggiorna ogni pochi secondi. Il pulsante **Aggiorna stato** forza un
refresh dei dati e della preview termica.

### Missione

Una missione è una sessione di raccolta. Quando è attiva, la dashboard indicizza
snapshot, inferenze e detection in un manifest. Il manifest è il punto di
partenza per ricostruire cosa è stato acquisito.

### Dataset sessione

Il pannello mostra:

- campioni totali;
- coppie RGB/termico create entro la finestra temporale di pairing;
- snapshot salvati;
- inferenze registrate;
- detection associate alla sessione;
- conteggio per feed.

Se vuoi materiale utile al fine-tuning, controlla soprattutto campioni e coppie
RGB/termico.

Durante una missione, **Salva foto** crea un set coordinato con RGB sinistra,
RGB destra e termico. Le tre immagini condividono `capture_set_id` e
`sample_id`; un campione viene contato come RGB/termico solo quando entrambe le
modalità sono state acquisite realmente. I placeholder diagnostici restano nel
manifest con `usable: false`, ma non vengono considerati materiale di training.

### Rilevazioni

Qui si controlla il worker AI. Dopo **Avvia analisi**, i risultati dovrebbero
comparire come detection correnti, eventi e righe nel manifest della sessione.
Se non succede, controlla prima la sorgente frame e poi i log.

### Foto e log

Qui trovi le immagini salvate e gli eventi tecnici. I log servono a distinguere
un problema reale da uno stato normale di attesa, per esempio una camera offline
perché non sta consegnando frame.

## Checklist prima di una raccolta importante

- RGB sinistra e destra aggiornano i frame.
- La termica è `REAL` oppure l’assenza è intenzionale e visibile.
- La missione è attiva.
- Il pannello Dataset sessione mostra contatori coerenti.
- Foto e log non mostrano errori ripetuti su camera, FLIR o inferenza.

## Controlli da terminale sulla Raspberry

```bash
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:5000/api/status/summary
curl http://127.0.0.1:5000/api/acquisition/status
curl http://127.0.0.1:5000/api/session/manifest
./scripts/validate_raspberry_runtime.sh
```

## Se qualcosa non torna

- **Live offline**: verifica camera, alimentazione, nodo video e log.
- **Termica non rilevata**: controlla `/thermal/status` e `v4l2-ctl --list-devices`.
- **Snapshot senza dataset**: verifica che una missione sia attiva.
- **AI senza risultati**: controlla sorgente frame, modello ONNX e log della pagina Rilevazioni.
- **Dashboard non raggiungibile da Mac**: verifica che il servizio sia attivo sulla Raspberry e che il tunnel SSH sia aperto.
