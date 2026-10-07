# Mijn reisatlas

Een persoonlijke website met drie wereldkaarten:

1. **Landen**: grijs = nog nooit geweest, groen = 1 keer, en via geel en oranje naar rood bij 5 keer of meer. Per continent zie je hoeveel landen je al bezocht, met een niveau en sterren.
2. **Vluchten**: voeg elke vlucht toe (vertrek, bestemming, datum). Je ziet alle routes op een kaart of wereldbol, plus het totaal aantal vluchten, kilometers, luchthavens en een schatting van je tijd in de lucht.
3. **Verlanglijst**: klik op de landen waar je nog naartoe wilt.

### Grote landen
De VS, Canada, Australië, Brazilië, China, India en Rusland kleur je per regio in (staten, provincies of federale districten). Zolang je weinig regio's aanduidt, is het land gearceerd; pas als je het grootste deel zag, kleurt het vol. De VS wordt zelfs per staat ingekleurd op de kaart. In "% van het landoppervlak" telt alleen het stuk dat je echt zag.

## Online zetten met GitHub en Vercel

1. Maak een gratis account op github.com.
2. Klik rechtsboven op **+** en dan **New repository**. Geef het een naam (bv. `reisatlas`) en klik **Create repository**.
3. Klik op **uploading an existing file**, sleep alle bestanden uit deze map erin (index.html, styles.css, app.js, data.js, reizen.json, README.md) en klik **Commit changes**.
4. Ga naar vercel.com en kies **Sign Up**, dan **Continue with GitHub**.
5. Klik **Add New…**, dan **Project**, en kies bij je repository **Import**.
6. Laat alles staan zoals het is (Framework Preset: *Other*, geen build command) en klik **Deploy**.
7. Na ongeveer een halve minuut krijg je een link zoals `reisatlas.vercel.app`. Dat is je website.

## Je gegevens bewaren

- Alles wat je invult, wordt automatisch bewaard **in de browser** waarin je werkt.
- Wil je het op elk toestel zien (en voor iedereen met de link)? Klik op **Exporteer**. Je downloadt dan `reizen.json`.
- Ga op GitHub naar je repository, klik **Add file → Upload files**, sleep `reizen.json` erin en klik **Commit changes**. Het oude bestand wordt vervangen.
- Vercel zet je site dan automatisch opnieuw online.
- Let op: het bestand moet exact `reizen.json` heten. Heet het `reizen (1).json`, hernoem het dan eerst.
- Een oranje bolletje op de Exporteer-knop betekent dat je wijzigingen hebt die nog niet op GitHub staan.

## Zelf aanpassen

- **Titel**: via het instellingen-icoon rechtsboven.
- **Kleuren**: bovenaan `styles.css` en bovenaan `app.js` (VISIT_COLORS).
- **Een groot land toevoegen** (bv. Mexico per staat): onderaan `data.js`, in `BIG_COUNTRIES`.

## Goed om te weten

- De site is openbaar: wie de link heeft, ziet je kaart. Je GitHub-repository mag privé staan; Vercel werkt daar ook mee.
- Kaartgegevens komen van Natural Earth (via world-atlas en us-atlas), luchthavens van OpenFlights.
