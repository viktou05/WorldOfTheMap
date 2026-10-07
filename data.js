/* =====================================================================
   data.js: vaste gegevens voor de reisatlas.
   Normaal hoef je hier niets aan te veranderen. Wil je een extra groot
   land per regio kunnen inkleuren (bv. Mexico), voeg het dan toe aan
   BIG_COUNTRIES onderaan dit bestand.
   ===================================================================== */

/* Continenten, in de volgorde waarin ze in de zijbalk staan */
const CONTINENTS = {
  EU: 'Europa',
  AS: 'Azië',
  AF: 'Afrika',
  NA: 'Noord-Amerika',
  SA: 'Zuid-Amerika',
  OC: 'Oceanië',
};

/* De 197 landen die meetellen: 193 VN-lidstaten plus Vaticaanstad,
   Palestina, Kosovo en Taiwan.
   Formaat: LANDCODE:nummer-op-de-kaart (ISO 3166). */
const COUNTRY_CODES = {
  EU: `AL:008 AD:020 AT:040 BY:112 BE:056 BA:070 BG:100 HR:191 CY:196 CZ:203
       DK:208 EE:233 FI:246 FR:250 DE:276 GR:300 HU:348 IS:352 IE:372 IT:380
       XK:XK LV:428 LI:438 LT:440 LU:442 MT:470 MD:498 MC:492 ME:499 NL:528
       MK:807 NO:578 PL:616 PT:620 RO:642 RU:643 SM:674 RS:688 SK:703 SI:705
       ES:724 SE:752 CH:756 UA:804 GB:826 VA:336`,
  AS: `AF:004 AM:051 AZ:031 BH:048 BD:050 BT:064 BN:096 KH:116 CN:156 GE:268
       IN:356 ID:360 IR:364 IQ:368 IL:376 JP:392 JO:400 KZ:398 KW:414 KG:417
       LA:418 LB:422 MY:458 MV:462 MN:496 MM:104 NP:524 KP:408 OM:512 PK:586
       PS:275 PH:608 QA:634 SA:682 SG:702 KR:410 LK:144 SY:760 TW:158 TJ:762
       TH:764 TL:626 TR:792 TM:795 AE:784 UZ:860 VN:704 YE:887`,
  AF: `DZ:012 AO:024 BJ:204 BW:072 BF:854 BI:108 CV:132 CM:120 CF:140 TD:148
       KM:174 CG:178 CD:180 CI:384 DJ:262 EG:818 GQ:226 ER:232 SZ:748 ET:231
       GA:266 GM:270 GH:288 GN:324 GW:624 KE:404 LS:426 LR:430 LY:434 MG:450
       MW:454 ML:466 MR:478 MU:480 MA:504 MZ:508 NA:516 NE:562 NG:566 RW:646
       ST:678 SN:686 SC:690 SL:694 SO:706 ZA:710 SS:728 SD:729 TZ:834 TG:768
       TN:788 UG:800 ZM:894 ZW:716`,
  NA: `AG:028 BS:044 BB:052 BZ:084 CA:124 CR:188 CU:192 DM:212 DO:214 SV:222
       GD:308 GT:320 HT:332 HN:340 JM:388 MX:484 NI:558 PA:591 KN:659 LC:662
       VC:670 TT:780 US:840`,
  SA: `AR:032 BO:068 BR:076 CL:152 CO:170 EC:218 GY:328 PY:600 PE:604 SR:740
       UY:858 VE:862`,
  OC: `AU:036 FJ:242 KI:296 MH:584 FM:583 NR:520 NZ:554 PW:585 PG:598 WS:882
       SB:090 TO:776 TV:798 VU:548`,
};

/* Gebieden: je kunt ze aanduiden, maar ze tellen niet mee als land
   (Groenland, Hongkong, Puerto Rico, Antarctica, …). */
const TERRITORY_CODES = `
  GL:304 PR:630 EH:732 TF:260 FK:238 NC:540 PF:258 HK:344 MO:446 FO:234
  BM:060 AW:533 CW:531 SX:534 KY:136 TC:796 VG:092 VI:850 GU:316 MP:580
  AS:016 CK:184 NU:570 WF:876 MS:500 AI:660 PM:666 BL:652 MF:663 SH:654
  IM:833 JE:832 GG:831 AX:248 NF:574 PN:612 HM:334 GS:239 IO:086 AQ:010`;

/* Een paar nettere Nederlandse namen dan wat de browser standaard geeft */
const NAME_OVERRIDES = { HK: 'Hongkong', MO: 'Macau', PS: 'Palestina', XK: 'Kosovo' };

/* Stukken op de kaart zonder (correct) nummer: koppel ze aan het juiste land */
const NAME_ALIASES = {
  'Kosovo': 'XK',
  'N. Cyprus': '196',
  'Somaliland': '706',
  'France': '250',
  'Norway': '578',
};

/* =====================================================================
   GROTE LANDEN: deze kleur je per regio in.
   unit    = hoe de regio's heten (meervoud)
   regions = [code, naam]. Voor de VS is de code het FIPS-nummer van de
             staat, zodat de staten ook echt op de kaart verschijnen.
   ===================================================================== */
const BIG_COUNTRIES = {
  '840': {
    unit: 'staten',
    regions: [
      ['01', 'Alabama'], ['02', 'Alaska'], ['04', 'Arizona'], ['05', 'Arkansas'],
      ['06', 'Californië'], ['08', 'Colorado'], ['09', 'Connecticut'], ['10', 'Delaware'],
      ['11', 'Washington D.C.'], ['12', 'Florida'], ['13', 'Georgia'], ['15', 'Hawaï'],
      ['16', 'Idaho'], ['17', 'Illinois'], ['18', 'Indiana'], ['19', 'Iowa'],
      ['20', 'Kansas'], ['21', 'Kentucky'], ['22', 'Louisiana'], ['23', 'Maine'],
      ['24', 'Maryland'], ['25', 'Massachusetts'], ['26', 'Michigan'], ['27', 'Minnesota'],
      ['28', 'Mississippi'], ['29', 'Missouri'], ['30', 'Montana'], ['31', 'Nebraska'],
      ['32', 'Nevada'], ['33', 'New Hampshire'], ['34', 'New Jersey'], ['35', 'New Mexico'],
      ['36', 'New York'], ['37', 'North Carolina'], ['38', 'North Dakota'], ['39', 'Ohio'],
      ['40', 'Oklahoma'], ['41', 'Oregon'], ['42', 'Pennsylvania'], ['44', 'Rhode Island'],
      ['45', 'South Carolina'], ['46', 'South Dakota'], ['47', 'Tennessee'], ['48', 'Texas'],
      ['49', 'Utah'], ['50', 'Vermont'], ['51', 'Virginia'], ['53', 'Washington'],
      ['54', 'West Virginia'], ['55', 'Wisconsin'], ['56', 'Wyoming'],
    ],
  },
  '124': {
    unit: 'provincies en territoria',
    regions: [
      ['ab', 'Alberta'], ['bc', 'Brits-Columbia'], ['mb', 'Manitoba'], ['nb', 'New Brunswick'],
      ['nl', 'Newfoundland en Labrador'], ['ns', 'Nova Scotia'], ['on', 'Ontario'],
      ['pe', 'Prins Edwardeiland'], ['qc', 'Quebec'], ['sk', 'Saskatchewan'],
      ['nt', 'Northwest Territories'], ['nu', 'Nunavut'], ['yt', 'Yukon'],
    ],
  },
  '036': {
    unit: 'staten en territoria',
    regions: [
      ['nsw', 'New South Wales'], ['vic', 'Victoria'], ['qld', 'Queensland'],
      ['wa', 'West-Australië'], ['sa', 'Zuid-Australië'], ['tas', 'Tasmanië'],
      ['nt', 'Northern Territory'], ['act', 'Canberra (ACT)'],
    ],
  },
  '076': {
    unit: 'deelstaten',
    regions: [
      ['ac', 'Acre'], ['al', 'Alagoas'], ['ap', 'Amapá'], ['am', 'Amazonas'], ['ba', 'Bahia'],
      ['ce', 'Ceará'], ['df', 'Distrito Federal'], ['es', 'Espírito Santo'], ['go', 'Goiás'],
      ['ma', 'Maranhão'], ['mt', 'Mato Grosso'], ['ms', 'Mato Grosso do Sul'],
      ['mg', 'Minas Gerais'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pr', 'Paraná'],
      ['pe', 'Pernambuco'], ['pi', 'Piauí'], ['rj', 'Rio de Janeiro'],
      ['rn', 'Rio Grande do Norte'], ['rs', 'Rio Grande do Sul'], ['ro', 'Rondônia'],
      ['rr', 'Roraima'], ['sc', 'Santa Catarina'], ['sp', 'São Paulo'], ['se', 'Sergipe'],
      ['to', 'Tocantins'],
    ],
  },
  '156': {
    unit: 'provincies',
    regions: [
      ['ah', 'Anhui'], ['bj', 'Beijing'], ['cq', 'Chongqing'], ['fj', 'Fujian'], ['gs', 'Gansu'],
      ['gd', 'Guangdong'], ['gx', 'Guangxi'], ['gz', 'Guizhou'], ['hi', 'Hainan'], ['he', 'Hebei'],
      ['hl', 'Heilongjiang'], ['ha', 'Henan'], ['hb', 'Hubei'], ['hn', 'Hunan'],
      ['nm', 'Binnen-Mongolië'], ['js', 'Jiangsu'], ['jx', 'Jiangxi'], ['jl', 'Jilin'],
      ['ln', 'Liaoning'], ['nx', 'Ningxia'], ['qh', 'Qinghai'], ['sn', 'Shaanxi'],
      ['sd', 'Shandong'], ['sh', 'Shanghai'], ['sx', 'Shanxi'], ['sc', 'Sichuan'],
      ['tj', 'Tianjin'], ['xz', 'Tibet'], ['xj', 'Xinjiang'], ['yn', 'Yunnan'], ['zj', 'Zhejiang'],
    ],
  },
  '356': {
    unit: 'staten en territoria',
    regions: [
      ['ap', 'Andhra Pradesh'], ['ar', 'Arunachal Pradesh'], ['as', 'Assam'], ['br', 'Bihar'],
      ['ct', 'Chhattisgarh'], ['ga', 'Goa'], ['gj', 'Gujarat'], ['hr', 'Haryana'],
      ['hp', 'Himachal Pradesh'], ['jh', 'Jharkhand'], ['ka', 'Karnataka'], ['kl', 'Kerala'],
      ['mp', 'Madhya Pradesh'], ['mh', 'Maharashtra'], ['mn', 'Manipur'], ['ml', 'Meghalaya'],
      ['mz', 'Mizoram'], ['nl', 'Nagaland'], ['or', 'Odisha'], ['pb', 'Punjab'],
      ['rj', 'Rajasthan'], ['sk', 'Sikkim'], ['tn', 'Tamil Nadu'], ['tg', 'Telangana'],
      ['tr', 'Tripura'], ['up', 'Uttar Pradesh'], ['ut', 'Uttarakhand'], ['wb', 'West-Bengalen'],
      ['an', 'Andamanen en Nicobaren'], ['ch', 'Chandigarh'],
      ['dh', 'Dadra, Nagar Haveli en Daman en Diu'], ['dl', 'Delhi'],
      ['jk', 'Jammu en Kasjmir'], ['la', 'Ladakh'], ['ld', 'Lakshadweep'], ['py', 'Puducherry'],
    ],
  },
  '643': {
    unit: 'federale districten',
    regions: [
      ['cfd', 'Centraal (o.a. Moskou)'], ['nwfd', 'Noordwest (o.a. Sint-Petersburg)'],
      ['sfd', 'Zuid'], ['ncfd', 'Noord-Kaukasus'], ['vfd', 'Wolga'], ['ufd', 'Oeral'],
      ['sibfd', 'Siberië'], ['dfd', 'Verre Oosten'],
    ],
  },
};

/* =====================================================================
   Reservelijst luchthavens: wordt gebruikt als de grote online lijst
   (±7000 luchthavens) even niet laadt. Ze zorgt ook dat je in het
   Nederlands kunt zoeken ("Parijs", "Londen", "Kaapstad", …).
   [code, stad, naam, land, breedtegraad, lengtegraad]
   ===================================================================== */
const FALLBACK_AIRPORTS = [
  ['BRU', 'Brussel', 'Brussels Airport (Zaventem)', 'België', 50.901, 4.484],
  ['CRL', 'Charleroi', 'Brussels South Charleroi', 'België', 50.459, 4.453],
  ['ANR', 'Antwerpen', 'Antwerp International', 'België', 51.189, 4.460],
  ['LGG', 'Luik', 'Liège Airport', 'België', 50.637, 5.443],
  ['OST', 'Oostende', 'Ostend-Bruges', 'België', 51.199, 2.862],
  ['AMS', 'Amsterdam', 'Schiphol', 'Nederland', 52.308, 4.764],
  ['EIN', 'Eindhoven', 'Eindhoven Airport', 'Nederland', 51.450, 5.375],
  ['RTM', 'Rotterdam', 'Rotterdam The Hague', 'Nederland', 51.957, 4.437],
  ['MST', 'Maastricht', 'Maastricht Aachen', 'Nederland', 50.912, 5.770],
  ['CDG', 'Parijs', 'Charles de Gaulle', 'Frankrijk', 49.010, 2.548],
  ['ORY', 'Parijs', 'Orly', 'Frankrijk', 48.723, 2.379],
  ['NCE', 'Nice', 'Côte d’Azur', 'Frankrijk', 43.658, 7.216],
  ['LYS', 'Lyon', 'Saint-Exupéry', 'Frankrijk', 45.726, 5.091],
  ['MRS', 'Marseille', 'Provence', 'Frankrijk', 43.437, 5.215],
  ['LHR', 'Londen', 'Heathrow', 'Verenigd Koninkrijk', 51.470, -0.454],
  ['LGW', 'Londen', 'Gatwick', 'Verenigd Koninkrijk', 51.148, -0.190],
  ['STN', 'Londen', 'Stansted', 'Verenigd Koninkrijk', 51.885, 0.235],
  ['MAN', 'Manchester', 'Manchester Airport', 'Verenigd Koninkrijk', 53.354, -2.275],
  ['EDI', 'Edinburgh', 'Edinburgh Airport', 'Verenigd Koninkrijk', 55.950, -3.372],
  ['DUB', 'Dublin', 'Dublin Airport', 'Ierland', 53.421, -6.270],
  ['FRA', 'Frankfurt', 'Frankfurt am Main', 'Duitsland', 50.033, 8.571],
  ['MUC', 'München', 'Franz Josef Strauss', 'Duitsland', 48.354, 11.786],
  ['BER', 'Berlijn', 'Berlin Brandenburg', 'Duitsland', 52.366, 13.503],
  ['DUS', 'Düsseldorf', 'Düsseldorf Airport', 'Duitsland', 51.289, 6.767],
  ['CGN', 'Keulen', 'Köln/Bonn', 'Duitsland', 50.866, 7.143],
  ['HAM', 'Hamburg', 'Hamburg Airport', 'Duitsland', 53.630, 9.988],
  ['ZRH', 'Zürich', 'Zürich Airport', 'Zwitserland', 47.465, 8.549],
  ['GVA', 'Genève', 'Genève Aéroport', 'Zwitserland', 46.238, 6.109],
  ['VIE', 'Wenen', 'Wien-Schwechat', 'Oostenrijk', 48.110, 16.570],
  ['CPH', 'Kopenhagen', 'Kastrup', 'Denemarken', 55.618, 12.656],
  ['ARN', 'Stockholm', 'Arlanda', 'Zweden', 59.652, 17.919],
  ['OSL', 'Oslo', 'Gardermoen', 'Noorwegen', 60.194, 11.100],
  ['HEL', 'Helsinki', 'Helsinki-Vantaa', 'Finland', 60.317, 24.963],
  ['KEF', 'Reykjavik', 'Keflavík', 'IJsland', 63.985, -22.606],
  ['MAD', 'Madrid', 'Barajas', 'Spanje', 40.472, -3.561],
  ['BCN', 'Barcelona', 'El Prat', 'Spanje', 41.297, 2.078],
  ['AGP', 'Málaga', 'Costa del Sol', 'Spanje', 36.675, -4.499],
  ['PMI', 'Palma de Mallorca', 'Son Sant Joan', 'Spanje', 39.552, 2.739],
  ['ALC', 'Alicante', 'Alicante-Elche', 'Spanje', 38.282, -0.558],
  ['TFS', 'Tenerife', 'Tenerife Zuid', 'Spanje', 28.045, -16.573],
  ['LPA', 'Gran Canaria', 'Gran Canaria Airport', 'Spanje', 27.932, -15.387],
  ['LIS', 'Lissabon', 'Humberto Delgado', 'Portugal', 38.774, -9.134],
  ['OPO', 'Porto', 'Francisco Sá Carneiro', 'Portugal', 41.248, -8.681],
  ['FAO', 'Faro', 'Faro Airport', 'Portugal', 37.014, -7.966],
  ['FCO', 'Rome', 'Fiumicino', 'Italië', 41.800, 12.239],
  ['MXP', 'Milaan', 'Malpensa', 'Italië', 45.630, 8.723],
  ['VCE', 'Venetië', 'Marco Polo', 'Italië', 45.505, 12.352],
  ['NAP', 'Napels', 'Capodichino', 'Italië', 40.886, 14.291],
  ['ATH', 'Athene', 'Eleftherios Venizelos', 'Griekenland', 37.936, 23.947],
  ['HER', 'Heraklion', 'Nikos Kazantzakis', 'Griekenland', 35.340, 25.180],
  ['IST', 'Istanbul', 'Istanbul Airport', 'Turkije', 41.262, 28.742],
  ['SAW', 'Istanbul', 'Sabiha Gökçen', 'Turkije', 40.898, 29.309],
  ['AYT', 'Antalya', 'Antalya Airport', 'Turkije', 36.899, 30.800],
  ['PRG', 'Praag', 'Václav Havel', 'Tsjechië', 50.101, 14.260],
  ['WAW', 'Warschau', 'Chopin', 'Polen', 52.166, 20.967],
  ['KRK', 'Krakau', 'Johannes Paulus II', 'Polen', 50.078, 19.785],
  ['BUD', 'Boedapest', 'Ferenc Liszt', 'Hongarije', 47.437, 19.256],
  ['DBV', 'Dubrovnik', 'Dubrovnik Airport', 'Kroatië', 42.561, 18.268],
  ['SPU', 'Split', 'Split Airport', 'Kroatië', 43.539, 16.298],
  ['MLA', 'Malta', 'Malta International', 'Malta', 35.857, 14.477],
  ['RAK', 'Marrakech', 'Menara', 'Marokko', 31.607, -8.036],
  ['CMN', 'Casablanca', 'Mohammed V', 'Marokko', 33.368, -7.590],
  ['CAI', 'Caïro', 'Cairo International', 'Egypte', 30.122, 31.406],
  ['HRG', 'Hurghada', 'Hurghada International', 'Egypte', 27.178, 33.799],
  ['TLV', 'Tel Aviv', 'Ben Gurion', 'Israël', 32.011, 34.887],
  ['DXB', 'Dubai', 'Dubai International', 'Verenigde Arabische Emiraten', 25.253, 55.364],
  ['AUH', 'Abu Dhabi', 'Zayed International', 'Verenigde Arabische Emiraten', 24.433, 54.651],
  ['DOH', 'Doha', 'Hamad International', 'Qatar', 25.273, 51.608],
  ['JFK', 'New York', 'John F. Kennedy', 'Verenigde Staten', 40.640, -73.779],
  ['EWR', 'New York', 'Newark Liberty', 'Verenigde Staten', 40.690, -74.174],
  ['BOS', 'Boston', 'Logan', 'Verenigde Staten', 42.366, -71.010],
  ['IAD', 'Washington', 'Dulles', 'Verenigde Staten', 38.944, -77.456],
  ['ORD', 'Chicago', 'O’Hare', 'Verenigde Staten', 41.979, -87.905],
  ['ATL', 'Atlanta', 'Hartsfield-Jackson', 'Verenigde Staten', 33.637, -84.428],
  ['MIA', 'Miami', 'Miami International', 'Verenigde Staten', 25.793, -80.290],
  ['MCO', 'Orlando', 'Orlando International', 'Verenigde Staten', 28.429, -81.309],
  ['DFW', 'Dallas', 'Dallas/Fort Worth', 'Verenigde Staten', 32.897, -97.038],
  ['DEN', 'Denver', 'Denver International', 'Verenigde Staten', 39.856, -104.674],
  ['LAS', 'Las Vegas', 'Harry Reid', 'Verenigde Staten', 36.084, -115.154],
  ['LAX', 'Los Angeles', 'Los Angeles International', 'Verenigde Staten', 33.942, -118.408],
  ['SFO', 'San Francisco', 'San Francisco International', 'Verenigde Staten', 37.619, -122.375],
  ['SEA', 'Seattle', 'Seattle-Tacoma', 'Verenigde Staten', 47.450, -122.309],
  ['ANC', 'Anchorage', 'Ted Stevens', 'Verenigde Staten', 61.174, -149.996],
  ['HNL', 'Honolulu', 'Daniel K. Inouye', 'Verenigde Staten', 21.319, -157.922],
  ['YYZ', 'Toronto', 'Pearson', 'Canada', 43.677, -79.631],
  ['YUL', 'Montreal', 'Trudeau', 'Canada', 45.470, -73.741],
  ['YVR', 'Vancouver', 'Vancouver International', 'Canada', 49.195, -123.184],
  ['MEX', 'Mexico-Stad', 'Benito Juárez', 'Mexico', 19.436, -99.072],
  ['CUN', 'Cancún', 'Cancún International', 'Mexico', 21.037, -86.877],
  ['GRU', 'São Paulo', 'Guarulhos', 'Brazilië', -23.432, -46.469],
  ['GIG', 'Rio de Janeiro', 'Galeão', 'Brazilië', -22.810, -43.251],
  ['EZE', 'Buenos Aires', 'Ezeiza', 'Argentinië', -34.822, -58.536],
  ['SCL', 'Santiago', 'Arturo Merino Benítez', 'Chili', -33.393, -70.786],
  ['LIM', 'Lima', 'Jorge Chávez', 'Peru', -12.022, -77.114],
  ['BOG', 'Bogotá', 'El Dorado', 'Colombia', 4.702, -74.147],
  ['JNB', 'Johannesburg', 'O. R. Tambo', 'Zuid-Afrika', -26.139, 28.246],
  ['CPT', 'Kaapstad', 'Cape Town International', 'Zuid-Afrika', -33.965, 18.602],
  ['NBO', 'Nairobi', 'Jomo Kenyatta', 'Kenia', -1.319, 36.928],
  ['ADD', 'Addis Abeba', 'Bole', 'Ethiopië', 8.978, 38.799],
  ['SIN', 'Singapore', 'Changi', 'Singapore', 1.364, 103.991],
  ['BKK', 'Bangkok', 'Suvarnabhumi', 'Thailand', 13.690, 100.750],
  ['HKT', 'Phuket', 'Phuket International', 'Thailand', 8.113, 98.317],
  ['KUL', 'Kuala Lumpur', 'KLIA', 'Maleisië', 2.746, 101.710],
  ['CGK', 'Jakarta', 'Soekarno-Hatta', 'Indonesië', -6.126, 106.656],
  ['DPS', 'Bali', 'Ngurah Rai', 'Indonesië', -8.748, 115.167],
  ['HKG', 'Hongkong', 'Hong Kong International', 'Hongkong', 22.309, 113.915],
  ['PEK', 'Peking', 'Beijing Capital', 'China', 40.080, 116.585],
  ['PVG', 'Shanghai', 'Pudong', 'China', 31.143, 121.805],
  ['NRT', 'Tokio', 'Narita', 'Japan', 35.765, 140.386],
  ['HND', 'Tokio', 'Haneda', 'Japan', 35.553, 139.781],
  ['KIX', 'Osaka', 'Kansai', 'Japan', 34.427, 135.244],
  ['ICN', 'Seoel', 'Incheon', 'Zuid-Korea', 37.460, 126.441],
  ['TPE', 'Taipei', 'Taoyuan', 'Taiwan', 25.078, 121.233],
  ['DEL', 'Delhi', 'Indira Gandhi', 'India', 28.556, 77.100],
  ['BOM', 'Mumbai', 'Chhatrapati Shivaji', 'India', 19.089, 72.868],
  ['CMB', 'Colombo', 'Bandaranaike', 'Sri Lanka', 7.181, 79.884],
  ['MLE', 'Malé', 'Velana', 'Maldiven', 4.192, 73.529],
  ['SYD', 'Sydney', 'Kingsford Smith', 'Australië', -33.946, 151.177],
  ['MEL', 'Melbourne', 'Tullamarine', 'Australië', -37.673, 144.843],
  ['BNE', 'Brisbane', 'Brisbane Airport', 'Australië', -27.384, 153.117],
  ['PER', 'Perth', 'Perth Airport', 'Australië', -31.940, 115.967],
  ['AKL', 'Auckland', 'Auckland Airport', 'Nieuw-Zeeland', -37.008, 174.792],
];
