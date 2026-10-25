# Mijn reisatlas

Een persoonlijke website met drie wereldkaarten:

1. **Landen**: grijs = nog nooit geweest, groen = 1 keer, en via geel en oranje naar rood bij 5 keer of meer. Per continent zie je hoeveel landen je al bezocht, met een niveau en sterren.
2. **Vluchten**: voeg elke vlucht toe (vertrek, bestemming, datum). Je ziet alle routes op een kaart of wereldbol, plus het totaal aantal vluchten, kilometers, luchthavens en een schatting van je tijd in de lucht.
3. **Verlanglijst**: klik op de landen waar je nog naartoe wilt.

### Grote landen
De VS, Canada, Australië, Brazilië, China, India en Rusland kleur je per regio in (staten, provincies of federale districten). Zolang je weinig regio's aanduidt, is het land gearceerd; pas als je het grootste deel zag, kleurt het vol. De VS wordt zelfs per staat ingekleurd op de kaart. In "% van het landoppervlak" telt alleen het stuk dat je echt zag.

Liever het hele land ingekleurd? Zet **Alleen bezochte regio's inkleuren** uit (in de zijbalk onder "Grote landen", of via het instellingen-icoon). Dan kleuren grote landen volledig in zodra je er geweest bent, en tellen ze volledig mee in "% van het landoppervlak". Die keuze wordt mee bewaard in `reizen.json`.

### Statistieken
De knop **Statistieken** toont leuke weetjes: hoe vaak je rond de aarde en naar de maan vloog, hoe lang je er te voet of met de fiets over zou doen, je vliegrecords (langste en kortste vlucht, favoriete route, maatschappij, maand), hoe vaak je de evenaar en de datumgrens overstak, de uitersten op je kaart, je landen-alfabet en een ruwe CO₂-schatting.

### Delen
De knop **Delen** maakt een overzicht dat iedereen snapt: een afbeelding met je kaart, cijfers en de lijst met landen (downloaden, kopiëren of op je gsm meteen delen via WhatsApp en co), en een tekstversie met vlaggetjes om te plakken in een chat of mail.

## Online zetten met GitHub en Vercel

1. Maak een gratis account op github.com.
2. Klik rechtsboven op **+** en dan **New repository**. Geef het een naam (bv. `reisatlas`) en klik **Create repository**.
3. Klik op **uploading an existing file**, sleep alle bestanden uit deze map erin (index.html, styles.css, app.js, data.js, config.js, supabase.sql, reizen.json, README.md) en klik **Commit changes**.
4. Ga naar vercel.com en kies **Sign Up**, dan **Continue with GitHub**.
5. Klik **Add New…**, dan **Project**, en kies bij je repository **Import**.
6. Laat alles staan zoals het is (Framework Preset: *Other*, geen build command) en klik **Deploy**.
7. Na ongeveer een halve minuut krijg je een link zoals `reisatlas.vercel.app`. Dat is je website.

## Accounts: je kaart op elk toestel

Met een (gratis) account wordt alles automatisch bewaard en zie je je eigen kaart op elk toestel waarop je inlogt. Zonder account werkt de site zoals vroeger: alles blijft in de browser.

De accounts draaien op [Supabase](https://supabase.com) (gratis database met login). Eenmalig instellen:

1. Maak een gratis account op supabase.com en klik **New project** (kies een regio in Europa, bv. Frankfurt).
2. Ga naar **SQL Editor → New query**, plak de inhoud van `supabase.sql` en klik **Run**.
3. Ga naar **Authentication → URL Configuration** en vul bij **Site URL** je Vercel-link in (bv. `https://reisatlas.vercel.app`). Zet diezelfde link ook bij **Redirect URLs**. Zo werken de links in de bevestigings- en wachtwoordmails.
4. Ga naar **Project Settings → API** (of de knop **Connect**) en kopieer de **Project URL** en de **anon public** (of **publishable**) key.
5. Vul ze in `config.js` in en zet dat bestand op GitHub. Vercel zet de site vanzelf opnieuw online.

Daarna: klik rechtsboven op **Inloggen → Nog geen account? Maak er een**, bevestig je e-mailadres via de mail en log in. Is je account nog leeg, dan vraagt de site of hij de reizen uit die browser mag overnemen. Een oud `reizen.json` kun je ook inladen via het instellingen-icoon → **Importeer een bestand**.

Goed om te weten:

- De sleutel in `config.js` mag openbaar zijn. De database laat elke gebruiker alleen zijn eigen kaart lezen en wijzigen.
- Elke wijziging wordt binnen een seconde bewaard. Het bolletje op de accountknop is groen als alles bewaard is, geel tijdens het opslaan en rood als het niet lukte (bv. geen internet). Dan blijven je wijzigingen op dat toestel staan en worden ze later doorgestuurd.
- Kom je terug naar een tabblad dat al open stond, dan haalt de site automatisch de nieuwste versie op.
- Wil je niet dat vreemden een account kunnen maken? Zet in Supabase onder **Authentication → Sign In / Providers** de optie **Allow new users to sign up** uit nadat je zelf een account hebt.

## Reservekopie

Via het instellingen-icoon kun je nog altijd **Exporteer reizen.json** (download) en **Importeer een bestand** gebruiken.

## Zelf aanpassen

- **Titel**: via het instellingen-icoon rechtsboven.
- **Kleuren**: bovenaan `styles.css` en bovenaan `app.js` (VISIT_COLORS).
- **Een groot land toevoegen** (bv. Mexico per staat): onderaan `data.js`, in `BIG_COUNTRIES`.

## Goed om te weten

- Zonder account ziet een bezoeker alleen wat in zijn eigen browser staat (of `reizen.json` als dat op GitHub staat). Met een account is je kaart privé. Je GitHub-repository mag privé staan; Vercel werkt daar ook mee.
- Kaartgegevens komen van Natural Earth (via world-atlas en us-atlas), luchthavens van OpenFlights.
