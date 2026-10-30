# Pubblicare Semaforo Etichette sul Play Store

Tutto quello che serve per la Play Console, in ordine. I file citati sono in questa cartella.

## 0. Cosa ti serve

- **Account sviluppatore Google Play** a tuo nome: 25 $ una volta sola, documento d'identità e verifica del telefono. Si apre da play.google.com/console.
- **Il file `SemaforoEtichette.aab`** (versione 2.0, codice versione 10). È il pacchetto per il Play Store.
- **La chiave `release.keystore`** (alias `semaforo`). Firma il pacchetto, e per Google è la tua *chiave di caricamento*. Non perderla: serve per ogni aggiornamento.
- **Un indirizzo email pubblico** di contatto per la scheda.
- **L'indirizzo della privacy**: quando il repository su GitHub è pubblico è `https://github.com/<tuo-utente>/semaforo-etichette/blob/main/PRIVACY.md`.

## 1. Crea l'app

Play Console › **Crea app**
- Nome: **Semaforo Etichette**
- Lingua predefinita: **Italiano – it-IT**
- Tipo: **App** · Gratuita
- Accetta le dichiarazioni.

## 2. Scheda dello store (Crescita › Presenza nello store › Scheda principale)

**Nome app** (max 30): `Semaforo Etichette`

**Breve descrizione** (max 80):
`Il semaforo dei valori nutrizionali: scansiona il codice o fotografa la tabella`

**Descrizione completa**:

```
Semaforo Etichette ti dice a colpo d'occhio se un prodotto ha tanti grassi, grassi saturi, zuccheri o sale.

COME FUNZIONA
• Scansiona il codice a barre: i valori arrivano da Open Food Facts, il database alimentare libero.
• Oppure fotografa la tabella "Valori nutrizionali": i numeri vengono letti sul telefono, anche senza internet. Puoi anche caricare una foto dalla galleria.
• Controlli i valori letti accanto alla foto e li correggi se serve.
• Ogni nutriente diventa verde, arancione o rosso e il prodotto riceve un voto da 0 a 10.

LE SOGLIE (per 100 g)
• Grassi: verde fino a 3 g, rosso oltre 17,5 g
• Grassi saturi: verde fino a 1,5 g, rosso oltre 5 g
• Zuccheri: verde fino a 5 g, rosso oltre 15 g
• Sale: verde fino a 0,3 g, rosso oltre 1,2 g
Per le bevande le soglie sono più basse. Fibre e proteine danno un bonus quando il prodotto è "fonte di" o "ricco di".

PRODOTTI SALVATI
• Ogni prodotto confermato si salva da solo.
• Cerca, ordina per voto e filtra per categoria.
• Backup su file per passare a un telefono nuovo.
• Condividi il risultato come immagine, per esempio su WhatsApp.

CORREZIONI PER TUTTI
Con un account Open Food Facts gratuito puoi inviare correzioni e prodotti nuovi al database, con la foto della tabella come prova. L'app rilegge la scheda per verificare che i valori siano stati salvati. La password resta sul telefono, cifrata nel portachiavi sicuro di Android.

PRIVACY
Niente pubblicità, niente tracciamento, nessuna registrazione. I prodotti salvati restano sul telefono. Il codice è open source.

Il voto serve a confrontare i prodotti e non è un consiglio medico.
Questa app non è affiliata a Open Food Facts. L'app è stata realizzata con l'aiuto di strumenti di intelligenza artificiale.
```

**Grafica**
- Icona app: `icona-512.png` (512 × 512)
- Immagine in evidenza: `immagine-in-evidenza-1024x500.png`
- Screenshot del telefono: i 4 file in `screenshots/` (1080 × 1920)

**Categoria**: App › **Cibo e bevande** · Tag: nutrizione, etichette, spesa
**Contatti**: la tua email. Il sito web è facoltativo (puoi mettere il link al repository GitHub).

## 3. Contenuti dell'app (Monitoraggio e qualità › Contenuti dell'app)

Rispondi così, e rileggi ogni domanda: le risposte sono tue responsabilità verso Google. Questa non è una consulenza legale.

- **Norme sulla privacy**: l'indirizzo di PRIVACY.md (vedi sopra).
- **Annunci**: l'app **non** contiene annunci.
- **Accesso all'app**: tutte le funzioni sono disponibili senza credenziali speciali. L'account Open Food Facts è facoltativo e di terze parti.
- **Classificazione dei contenuti** (questionario IARC): categoria "Riferimenti, notizie o istruzione" oppure "Strumenti/Utilità". Rispondi **no** a violenza, sesso, linguaggio, droghe, gioco d'azzardo, acquisti digitali e condivisione della posizione. Gli utenti non interagiscono tra loro dentro l'app.
- **Pubblico di destinazione**: **18 anni e oltre**, la scelta più semplice. L'app non è pensata per bambini.
- **App per la salute**: seleziona "Nutrizione e gestione del peso" (o la voce più vicina) e dichiara che l'app non è un dispositivo medico.
- **App governative / finanziarie / notizie**: no.
- **Sicurezza dei dati**:
  - *Raccogli o condividi dati?* **Sì**, solo quando l'utente usa Open Food Facts:
    - **Foto** (facoltativa): la foto della tabella, caricata su Open Food Facts solo se l'utente conferma l'invio.
    - **Altri contenuti generati dagli utenti**: valori nutrizionali e nome del prodotto inviati a Open Food Facts su conferma dell'utente.
    - **Informazioni sull'account / ID utente**: il nome utente Open Food Facts, inviato a Open Food Facts per l'invio delle correzioni.
  - Per ciascuno: **raccolti**, **non condivisi** (l'invio parte da un'azione dell'utente verso il servizio che sceglie), **facoltativi**, scopo **"Funzionalità dell'app"**.
  - *Dati criptati in transito*: **Sì** (HTTPS).
  - *L'utente può chiedere la cancellazione*: per i contributi pubblicati su Open Food Facts vale la loro procedura. I dati sul telefono si cancellano disinstallando l'app.
  - La lettura delle foto e dei codici a barre avviene sul telefono: non è "raccolta".

## 4. Test chiuso: obbligatorio per i nuovi account personali

Per gli account personali creati dopo il 13 novembre 2023, Google chiede un **test chiuso con almeno 12 tester, iscritti per 14 giorni di fila**, prima di poter pubblicare in produzione.

1. Test › **Test chiuso** › crea un canale (ad esempio "Amici").
2. **Tester**: crea un elenco con le email Google di almeno 12 persone (meglio 14–15, nel caso qualcuno si ritiri).
3. **Crea release** › carica `SemaforoEtichette.aab` › note di rilascio:
   `Prima versione: semaforo dei valori nutrizionali, lettura del codice a barre e della tabella, prodotti salvati, backup e condivisione.`
4. Alla prima release Google propone la **firma dell'app di Google Play**: accetta. Il tuo `release.keystore` diventa la chiave di caricamento.
5. Invia per la revisione. Quando è approvata, manda ai tester il link di iscrizione. Devono **accettare il test e installare l'app dal Play Store**, e restare iscritti per 14 giorni.
6. Passati i 14 giorni: Dashboard › **Richiedi l'accesso alla produzione**. Google chiede un riepilogo del test (cosa hanno provato i tester e cosa hai corretto).

## 5. Produzione

Dopo l'approvazione: Produzione › Crea release › carica lo stesso `.aab` (o una versione nuova) › paesi: **Italia** (e quelli che vuoi) › Invia per la revisione. La prima revisione può richiedere qualche giorno.

## Note tecniche (se Google segnala qualcosa)

- **Versione Android**: l'app dichiara Android 16 (API 36), come richiesto dal 31 agosto 2026. Gestisce lo schermo a tutta altezza di Android 15+ e il nuovo gesto "indietro".
- **Codice di terze parti**: nessuna libreria nativa (.so), quindi nessun problema con le pagine di memoria da 16 KB.
- **Permessi**: solo fotocamera e internet.
- **Aggiornamenti futuri**: ogni nuovo pacchetto deve avere un `versionCode` più alto ed essere firmato con la stessa chiave.
- **Chi ha installato l'APK fuori dallo store** non riceve gli aggiornamenti dal Play Store finché non disinstalla e reinstalla dallo store. Prima di farlo conviene esportare il backup dei prodotti salvati.
