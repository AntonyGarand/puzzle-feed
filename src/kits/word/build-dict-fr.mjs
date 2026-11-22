// Regenerates the French word assets (run through build-dict.mjs, or directly):
//   node src/kits/word/build-dict-fr.mjs          (REVIEW=1 prints the answer lists per length)
// Sources (devDependencies):
//   - an-array-of-french-words (MIT, © Zeke Sikelianos; derived from the Letterpress list): ~336k words,
//     used for the validation dictionary.
//   - @zxcvbn-ts/language-fr (MIT) commonWords.json: word frequencies from OpenSubtitles 2024 via OPUS
//     (ODC-BY, attribution: Helsinki-NLP / OPUS, subtitle contributors). Used to rank words by how
//     common they are in spoken French.
//   - french-badwords-list (MIT, © Maurice Butler): words kept out of the answers and the common list.
// Gameplay is A–Z only: words are folded (é→e, ç→c, œ→oe) before use.
// Outputs (committed):
//   dict-fr.txt   – validation dictionary, 3–8 letters, familiar words only (see THREE / RESCUE_4 / DROP_4 / QC_*),
//                   front-coded like dict.txt; lazily loaded chunk.
//   common-fr.ts  – the most frequent ~6000 words (3–8 letters) split into ANSWERS (base forms, safe)
//                   and OTHER (inflections, function words…), bundled for synchronous generation.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pkgFile = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), file);

export const fold = (w) =>
  w
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const COMMON_SIZE = 6000;

// Never accepted anywhere (profanity, slurs, Québec swears, explicit sexual terms). Folded forms.
const HARD = `bite bites chatte chattes con cons conne connes connard connards connarde connasse couille couilles couillon cul culs
encule encules enculee enculer enculeur foutre merde merdes merdeux merdique putain putains pute putes salope salopes salop salaud
salauds niquer nique niquez pede pedes pedale tapette tarlouze tafiole gouine negro negre negres bougnoul bougnoule youpin youpine
bicot chinetoque chintok bamboula branler branlette branleur chier chieur chiant chiante emmerder emmerdeur emmerdeuse etron fiotte
pouffiasse poufiasse petasse pisse pisser pisseux enfoire enfoiree bordel tabarnak tabarnac calisse caliss crisse ostie osti
sperme porno pornos orgasme clitoris vagin penis zizi nichon nichons nibar nibards baiser baise baisee baiseur bander bandant`.split(/\s+/);

// Crude but valid: kept out of the common list (so never targets or hints), still accepted as guesses.
const SOFT = 'emmerde emmerdes merdier connerie conneries chiottes gonzesse deconner deconne'.split(' ');

// Valid guesses, but never picked as answers/targets (death, violence, drugs, religion, crude, mild insults…).
const NOT_ANSWERS = `mort morte morts mourir meurt meurtre tuer tueur tueuse tue tuee suicide cadavre deces cercueil tombe tombeau
guerre arme armes fusil pistolet bombe balle balles flingue couteau poignard sang sanglant viol violer violeur violence prison
taule otage crime criminel assassin assassiner voleur voler vol drogue drogues drogue alcool biere vin whisky vodka ivre soule
saoul sexe sexy sexuel nu nue nus nudite gay homo lesbienne enfer diable demon satan dieu jesus christ bible eglise priere prier
pape cure hostie ciboire calvaire tabernacle sacrament islam juif juive arabe nazi esclave cancer malade maladie vomir vomi caca
pipi pet prout fesse fesses sein seins slip culotte idiot idiote stupide debile imbecile abruti cretin con niaiseux nul nulle
moche laid laide gros grosse bete haine hair poison noyer noye gun cash dollar dollars flic flics police poulet taser
sucer urine uterus cocaine overdose morphine raciste suicider sexuelle enceinte homicide massacre attentat autopsie revolver
grenade missile dynamite gachette braquage tabasser torture torturer crack ivrogne cognac dealer bunker fuhrer legiste victime
violent gueule ordure morveux tireur cartel escroc pervers vermine mafia peter`.split(/\s+/);

// Inflected/irregular verb forms, subjunctives, names and English loans the heuristics miss.
const NOT_BASE = `suis sont sera seras serai serez serons seront serait etait etais etaient etes etions etiez soit sois soient soyez
ayez ayant aient aie aies aura aurai auras aurez aurons auront aurait avait avais avaient avez avons avions aviez eu eue eus
fait faits faite faites font fera ferai feras ferez ferons feront ferait fasse fassent fais faisait fallu faut fallait
vais vas vont irai iras ira irez irons iront irait allais allait aille aillent allez allons
dit dits dite dites dira dirai diras direz diront dirait disait disent dise
peux peut peuvent pouvez pouvons pourra pourrai pourrais pourrait pourrez pourront puisse puisses pu pus put pourrons
veux veut veulent voulez voulons voudra voudrai voudrais voudrait voulu voulait voulais veuille
sais sait savent savez savons saura saurai saurais saurait sache sachez su
dois doit doivent devez devons devra devrai devrais devrait devait du dus due dues
vois voit voient voyez voyons verra verrai verras verrez verront vu vue vus vues
viens vient viennent venez venons viendra viendrai venu venue venus venait
tiens tient tiennent tenez tenons tiendra tenu tenue
prends prend prennent prenez prenons prendra pris prise prit
mets met mettent mettez mettons mettra mis mise
crois croit croient croyez croyons cru
bois boit boivent buvez bu
vis vit vivent vivez vivons vecu
suit suis suivez suivi
connais connait connu connue
nait ne nee
meurs meurt meurent
ouvre ouvert ouverte
sors sort sortent sortez
pars part partent partez
dors dort dorment dormez
sens sent sentent sentez
sers sert servent servez
mens ment mentent mentez
cours court courent courez couru
lis lit lisent lisez lu
ecris ecrit ecrite ecrivez
ris rit rient riez
plait plu recu recue
assis assise vaut valu pleut hais hait
prend rend rends perd perds vend vends mord mords tend tends entend entends attend attends repond reponds descend
mene mener leve gere pese gele achete jette appelle rappelle espere prefere repete
parie pige amene meme
jack mark henry tommy jenny robin oscar louis marc rosa tara tian maya noel paris cuba inde chine japon cesar
have love girl baby lady lord black ring bang bush look coke mail boss gang rock show star stop cool yang jazz
okay hello sorry fuck shit damn bitch yeah ciao allo hein ouais heu euh bah ben bof chut hop
ais ait aux des ces les mes nes ses tes ils uns eut fut fit mit est ont ere gre dis las eux nos vos que qui han hua hui dan dol gus
lei ohe tot usa won out the man mac max bob boy bye fox pop pro yin pan pat pis toc dom cal bai ana are sir top gin job
aime agit bati beni came decu fini fout jure mele paie paru prie revu tape bill ding hart khan lori mimi pope
adore avere ayons buter cense cesse concu doive gemit mater menti meure moque peint pense prevu promu remet remis rompu roule sonne
trahi exige exclu mordu pendu perdu coute close diane doris colin jules milan penny rosie green group round scoop sieur piper river
apparu appris appuie arrete arrive auriez buvait buvons choisi conclu crains craint devais deviez devint devrez dirige disais disant
disiez disons embete enerve envahi envoie essaie eteins eteint etonne existe failli faudra finira furent grandi habite hesite ignore
occupe offert parait permet plains plaint predit prenne promet promis recois recoit recule refuse releve rempli repris resolu reussi
saigne savais savait saviez semble soumis suffit survit tienne tourne triche trompe valait valent vienne voyais voyait rigole dement
design timing square script boston canada bresil harper jasper joseph julien merlin robert sierra gloria marina palmer lester carter
depend natale marrer lecher choper foirer
affecte affirme apprete atteint atterri aurions benisse croyais croyait demarre derange deroule deteste detient deviens devient devions
devriez devrons devront effraie emballe endormi entendu enverra evanoui faisais faisant faisiez faisons fassiez finisse imagine importe
indique inscrit insiste inspire meprise mourrez nettoie obtiens obtient partira possede pouvais pouvait pouvant pouviez prenais prenait
prenant preniez presume pretend reclame reconnu regarde rejette rejoins rejoint renvoie reverra reviens revient sachant sachent sachiez
sauront servira sortira suffira suggere supplie suppose surpris survecu tremble verrait verrons voudrez voulant vouliez ressens soupire
convenu compris disparu recevez brandon spencer phoenix richard bouddha flipper manager scanner
apparait apprecie apprenne approuve auraient commence concerne contient convient craignez croirait devaient devienne disaient enfreint
essaient envoient existait existent faisions faudrait interdis mangeait mangeant mangeons meritait meritent mettrait mourront plairait
poursuit pouvions prendrez previens provient puissiez regrette remercie rendrait reprenez revienne reverrai savaient semblait semblant
semblent signifie souhaite soutient souviens souvient tiendrai tracasse vaudrait veuillez voudriez voudront voulions benjamin florence
napoleon portland victoria virginie superman ressenti transmis souffert parcouru corrompu suspendu reverend
soul bouge brille ennuie degage admire retiens savions aimeriez meprenez enverrai devrions consiste jan rob kit fonce`.split(/\s+/);

// ---- familiar-words filter ----
// The source list has ~336k words, many of them archaic, technical or English (FATS, LET, ERS, RAI…). Short
// words are where those bite: a random letter grid traces them by accident. So:
//   3 letters  – only this hand-picked list of words a Québec player knows.
//   4 letters  – words whose base form is in the OpenSubtitles frequency list, plus RESCUE_4, minus DROP_4.
//   5+ letters – the whole dictionary (long obscure words rarely come up by accident; cutting them rejects
//                real words like ADAGE, IGLOO, RUGIR).
const THREE = `age ail air aie ais ait ame ami ane ans arc art axe aux bac bal bar bas bat bec bel ben ble boa bof bol bon
bus but cap car cas ces cet cle col coq cor cou cri cru des dis dit dix don dos duc due duo dur eau ego elu emu epi ere est
ete eut eux fee fer feu fil fin fit foi fou fut gag gai gaz gel gym hic hop ici ile ils ira jet jeu job jus lac les lie lin lis
lit loi lot lue lui lus lys mai mal mat mec mer mes met mie mis mit moi mon mot mou mue mur nee nes net nez nid nie nom non nos
nue nul nus oie ont ose ote ouf oui par pas pet peu pic pie pif pin pis pli plu pop pot pou pro pub pue pur pus que qui ras rat
ris rit riz roc roi rue sac sec sel ses six ski soi sol son sot sou sud sue sur tas tel tes the tic tir toi ton top tri tue une
uni uns use van ver via vie vif vil vin vis vit vol vos vue vus zen zoo zut`.split(/\s+/);

// Known 4-letter words missing from the frequency list.
const RESCUE_4 = `acre alpe alto apex ardu atre auge aune axer axee beur brie brio bris broc buee buis cane cepe cime crac crin croc
cyan dodu dune echu eden emeu emir euro faon fard feve fiel flop fret geai glas gnou goal gond gril grog guru halo huee huer ibis
ilot inox iota jonc jute kaki kart kilt kiwi lest lift loir luth lynx lyre moka musc neon ocre onyx opus orme ovin peso piaf puma
rapt ruee ruer saxo serf silo smog souk soya taon teck thym tome tutu typo urge velu watt yogi zebu`.split(/\s+/);

// 4-letter words the frequency rule lets through but nobody plays (English, names, rare forms).
const DROP_4 = `aces aspe bais bata bate beys bibi bill bled bora cade cadi caid cals cene cens chai chas chia chue chus cule deca
dole dols duce duit elis ente etai eues fars fats feue feus fiai fias fies fora fors foui frai fris full gals gaza gent gins girl
guis guss hart have hies home houe huai huas huis ives jans jars kali kans khan kiki lady laie lais land lege lese liai lias lite
live lord lori lote lyse macs maie maki mans mark mati maya mesa mess meus meut mies more must nase niai nias nome none nota nova
nuai nuas ores osai osas otai otas pack pais pane para pers pife pifs pive puna raja rani reas rees regs rias rene rets robs sake
sied siee sils sirs shah slow soue soul suai suas tacs tans tara tees tell tian tory toto tris tuai tuas vals vils vine yang yard
yens alla mata mina mira rama crea cuba dora rosa lima usas bobs boys ding jack love bush data colt open self ring rush pope
bang`.split(/\s+/);

// Québec words the source list lacks or the frequency list misses. Nouns/adjectives also get an -s plural,
// verbs their common present / imparfait / participle forms.
const QC_NOUNS = `tuque chum bleuet poutine cegep mitaine toune chicane pinotte bebelle sacoche patente piastre piasse cenne bine
creton guedille gougoune jasette huard orignal frette quetaine pitou minou minoune bobette sloche brunante garnotte poudrerie
dep depanneur`.split(/\s+/);
const QC_WORDS = `pantoute niaiseux chialeux`.split(/\s+/);
const QC_VERBS = `pogner niaiser jaser placoter achaler chialer gosser magasiner capoter zigonner taponner`.split(/\s+/);

function quebec() {
  const out = new Set(QC_WORDS);
  for (const w of QC_NOUNS) out.add(w).add(w + 's');
  for (const v of QC_VERBS) {
    const st = v.slice(0, -2);
    for (const e of ['er', 'e', 'es', 'ent', 'ez', 'ons', 'e', 'ee', 'es', 'ees', 'ait', 'ais', 'aient', 'ant', 'era']) out.add(st + e);
  }
  return [...out].filter((w) => /^[a-z]{3,8}$/.test(w));
}

/** Plausible base forms of an (accented) word: itself, singular, masculine, infinitive. Passé simple is ignored. */
function lemmas(w) {
  const o = [w];
  if (/[sx]$/.test(w)) o.push(w.slice(0, -1));
  if (w.endsWith('aux')) o.push(w.slice(0, -3) + 'al');
  for (const [a, b] of [
    ['e', ''],
    ['es', ''],
    ['euse', 'eur'],
    ['ive', 'if'],
    ['elle', 'el'],
    ['enne', 'en'],
    ['ette', 'et'],
    ['ère', 'er'],
    ['rice', 'eur'],
    ['onne', 'on'],
  ])
    if (w.endsWith(a)) o.push(w.slice(0, -a.length) + b);
  const ends = ['e', 'es', 'ent', 'ons', 'ez', 'ais', 'ait', 'aient', 'ions', 'iez', 'erai', 'eras', 'era', 'erons', 'erez', 'eront'];
  ends.push('erais', 'erait', 'é', 'ée', 'és', 'ées', 'ant', 'is', 'it', 'i', 'ie', 'ies', 'irai', 'ira', 'u', 'ue', 'us', 'ues');
  ends.push('s', 't', 'd');
  for (const e of ends)
    if (w.endsWith(e) && w.length > e.length + 1) {
      const st = w.slice(0, -e.length);
      for (const s of [st, st.replace(/è([^è]*)$/, 'e$1'), st.replace(/è([^è]*)$/, 'é$1'), st.replace(/ç$/, 'c'), st.replace(/ge$/, 'g')])
        for (const i of [s + 'er', s + 'ir', s + 're', s + 'ire', s + 'dre', s + 'tre']) o.push(i);
    }
  return o;
}

const STRICT_VERB = [
  'ez',
  'ons',
  'aient',
  'iez',
  'ions',
  'erai',
  'eras',
  'erez',
  'eront',
  'erait',
  'erais',
  'eraient',
  'èrent',
  'âmes',
  'âtes',
  'assent',
  'issons',
  'issez',
  'issent',
  'issait',
  'issais',
  'irent',
  'irai',
  'iras',
  'iront',
  'irait',
  'é',
  'ée',
  'és',
  'ées',
];
const AMB_VERB = [
  'e',
  'es',
  'ent',
  'ant',
  'ait',
  'ais',
  'ai',
  'as',
  'a',
  'era',
  'u',
  'ue',
  'us',
  'ues',
  'i',
  'ie',
  'is',
  'it',
  'ies',
  'ra',
  'rai',
  'ras',
];
const FEM = [
  ['e', ''],
  ['euse', 'eur'],
  ['ive', 'if'],
  ['elle', 'el'],
  ['enne', 'en'],
  ['ette', 'et'],
  ['ère', 'er'],
  ['rice', 'eur'],
  ['onne', 'on'],
  ['ienne', 'ien'],
];

export function buildFr() {
  const all = require('an-array-of-french-words');
  const freq = JSON.parse(readFileSync(pkgFile('@zxcvbn-ts/language-fr', 'src/commonWords.json'), 'utf8'));
  const bad = readFileSync(pkgFile('french-badwords-list', 'list.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((w) => /^[a-zàâäçéèêëîïôöùûüÿœ]+$/.test(w))
    .map(fold);

  const hard = new Set(HARD);
  const soft = new Set([...HARD, ...bad, ...SOFT]);
  const notAnswer = new Set([...NOT_ANSWERS, ...NOT_BASE]);

  // ---- validation dictionary ----
  const acc = new Set(all); // accented forms, for morphology checks
  const frequent = new Set(freq.filter((w) => acc.has(w)));
  const three = new Set(THREE);
  const rescue4 = new Set(RESCUE_4);
  const drop4 = new Set(DROP_4);
  const familiar = (w, f) => {
    if (f.length === 3) return three.has(f);
    if (f.length === 4) return rescue4.has(f) || (!drop4.has(f) && lemmas(w).some((l) => frequent.has(l)));
    return true;
  };
  const dictSet = new Set();
  for (const w of all) {
    const f = fold(w);
    if (/^[a-z]{3,8}$/.test(f) && !hard.has(f) && familiar(w, f)) dictSet.add(f);
  }
  for (const f of [...three, ...rescue4, ...quebec()]) if (!hard.has(f)) dictSet.add(f);
  const dict = [...dictSet].sort();
  let packed = '';
  let prev = '';
  for (const w of dict) {
    let k = 0;
    while (k < 9 && k < prev.length && k < w.length - 1 && prev[k] === w[k]) k++;
    packed += k + w.slice(k);
    prev = w;
  }
  writeFileSync(join(here, 'dict-fr.txt'), packed);

  // ---- common words + answers ----
  const rank = new Map();
  freq.forEach((w, i) => {
    if (!rank.has(w)) rank.set(w, i);
  });
  const R = (w) => rank.get(w) ?? Infinity;
  const has = (w) => acc.has(w);

  /** Why a word is probably not a base form ('' if it looks like one). */
  const inflection = (w) => {
    const r = R(w);
    if (/[sx]$/.test(w) && w.length > 3 && has(w.slice(0, -1))) return 'plural';
    if (w.endsWith('aux') && has(w.slice(0, -3) + 'al')) return 'plural';
    for (const [a, b] of FEM) {
      if (w.endsWith(a) && w.length > a.length + 1) {
        const m = w.slice(0, -a.length) + b;
        if (m !== w && has(m) && R(m) < r) return 'feminine';
      }
    }
    for (const e of STRICT_VERB) {
      if (w.endsWith(e) && w.length > e.length + 1) {
        const st = w.slice(0, -e.length);
        for (const i of [st + 'er', st + 'ir', st + 're']) if (has(i)) return 'verb';
      }
    }
    for (const e of AMB_VERB) {
      if (w.endsWith(e) && w.length > e.length + 1) {
        const st = w.slice(0, -e.length);
        const stems = [st, st.replace(/è([^è]*)$/, 'e$1'), st.replace(/è([^è]*)$/, 'é$1')];
        for (const s of stems) for (const i of [s + 'er', s + 'ir', s + 're', s + 'ire']) if (i !== w && has(i) && R(i) < r) return 'verb';
      }
    }
    // dors → dormir, sent → sentir, prend → prendre
    if (/[st]$/.test(w)) for (const x of ['mir', 'tir', 'vir']) if (has(w.slice(0, -1) + x) && R(w.slice(0, -1) + x) < r) return 'verb';
    if (w.endsWith('d') && has(w + 're') && R(w + 're') < r) return 'verb';
    return '';
  };

  const seen = new Set();
  const answers = [];
  const other = [];
  for (const w of freq) {
    if (seen.size >= COMMON_SIZE) break;
    if (!has(w)) continue; // drops names, English, numbers, elisions
    const f = fold(w);
    if (!/^[a-z]{3,8}$/.test(f) || seen.has(f) || soft.has(f) || !dictSet.has(f)) continue;
    seen.add(f);
    if (notAnswer.has(f) || inflection(w)) other.push(f);
    else answers.push(f);
  }
  // A folded answer that is also some other word's inflection is still fine (it's a real base form).
  const fmt = (ws) => {
    const out = [];
    for (let len = 3; len <= 8; len++) {
      const l = ws.filter((w) => w.length === len).sort();
      for (let i = 0; i < l.length; i += 20) out.push(l.slice(i, i + 20).join(' '));
    }
    return out.join('\n');
  };
  writeFileSync(
    join(here, 'common-fr.ts'),
    `// Generated by build-dict-fr.mjs — do not edit by hand.\n` +
      `// The ${COMMON_SIZE} most frequent French words of 3–8 letters, folded to a–z (é→e, ç→c, œ→oe).\n` +
      `// Frequencies: OpenSubtitles 2024 via OPUS (ODC-BY; Helsinki-NLP / OPUS, subtitle contributors),\n` +
      `// as packaged in @zxcvbn-ts/language-fr (MIT). Spellings checked against an-array-of-french-words (MIT).\n` +
      `// ANSWERS: base forms that are safe to pick as targets. OTHER: inflections, function words, etc.\n` +
      `export const ANSWERS_FR = \`\n${fmt(answers)}\n\`;\n` +
      `export const OTHER_FR = \`\n${fmt(other)}\n\`;\n`,
  );
  console.log('fr dict', dict.length, 'words,', packed.length, 'bytes; common', seen.size, 'words,', answers.length, 'answers');
  if (process.env.REVIEW) {
    for (let len = 3; len <= 8; len++) {
      const l = answers.filter((w) => w.length === len).sort();
      console.log(`\n#${len} (${l.length}): ${l.join(' ')}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildFr();
