/*
 * Resume Writing Assistant: a rule-based writing engine that runs entirely in the browser.
 * No network calls, no AI APIs. Exposes `ResumeAssistant` (browser global / CommonJS).
 *
 * Suggestion shape:
 *   { type, start, end, original, replacements: string[], message }
 *   `replacements` is empty for advice-only suggestions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ResumeAssistant = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = {
    spelling: { label: 'Spelling', priority: 0 },
    grammar: { label: 'Grammar', priority: 1 },
    verb: { label: 'Action verbs', priority: 2 },
    clarity: { label: 'Awkward phrasing', priority: 3 },
    concise: { label: 'Concise', priority: 4 },
    tone: { label: 'Professional tone', priority: 5 },
    repeat: { label: 'Repetition', priority: 6 },
    resume: { label: 'Resume tips', priority: 7 },
  };

  /* ---------------------------------------------------------------- verbs */

  const VERB_BASES = (
    'accelerate acquire adapt administer advise advocate align allocate analyze architect arrange assemble assess ' +
    'assist audit automate boost brief build calculate champion clarify close coach collaborate collect communicate ' +
    'compile complete conduct configure consolidate construct consult contribute control convert coordinate create ' +
    'cultivate cut debug decrease define deliver demonstrate deploy design detect develop devise diagnose direct ' +
    'document double draft drive earn edit educate eliminate enable engineer enhance ensure establish estimate ' +
    'evaluate examine exceed execute expand expedite facilitate finalize forecast formulate generate grow guide handle ' +
    'head help hire identify implement improve increase influence initiate innovate inspect install integrate interview ' +
    'introduce investigate launch lead leverage lower maintain manage market maximize measure mentor merge migrate ' +
    'minimize model monitor motivate negotiate onboard operate optimize orchestrate organize outperform oversee own ' +
    'partner perform pilot pioneer plan prepare present prioritize process produce program promote propose prospect ' +
    'prototype provide publish qualify raise rebuild recommend recruit redesign reduce refactor refine reorganize repair ' +
    'report research resolve restructure revamp review revise run save scale schedule secure sell serve ship simplify ' +
    'solve source spearhead standardize streamline strengthen structure supervise support surpass teach test track ' +
    'train transform translate triple troubleshoot unify update upgrade use validate verify win write work make do get ' +
    'give take set participate achieve attain close convey craft cut direct employ enforce exceed grow host lift ' +
    'mobilize obtain orchestrate overhaul reach release retain roll ship shorten spur sustain trim win achieve'
  ).split(/\s+/);

  const IRREGULAR_PAST = {
    build: 'built', lead: 'led', drive: 'drove', grow: 'grew', oversee: 'oversaw', run: 'ran', sell: 'sold',
    teach: 'taught', win: 'won', write: 'wrote', make: 'made', do: 'did', get: 'got', give: 'gave', take: 'took',
    set: 'set', cut: 'cut', bring: 'brought', hold: 'held', meet: 'met', speak: 'spoke', begin: 'began',
    find: 'found', keep: 'kept', spend: 'spent', think: 'thought', send: 'sent', rebuild: 'rebuilt',
    undertake: 'undertook', overtake: 'overtook', seek: 'sought', buy: 'bought', lend: 'lent', choose: 'chose',
  };
  const DOUBLE_FINAL = new Set('plan ship commit control submit program stop drop admit refer prefer transfer occur equip scrap map step chat pin regret trim'.split(' '));

  function pastOf(base) {
    if (IRREGULAR_PAST[base]) return IRREGULAR_PAST[base];
    if (DOUBLE_FINAL.has(base)) return base + base.slice(-1) + 'ed';
    if (/e$/.test(base)) return base + 'd';
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ied';
    return base + 'ed';
  }
  function ingOf(base) {
    if (base === 'run') return 'running';
    if (base === 'win') return 'winning';
    if (base === 'set') return 'setting';
    if (base === 'get') return 'getting';
    if (base === 'cut') return 'cutting';
    if (DOUBLE_FINAL.has(base)) return base + base.slice(-1) + 'ing';
    if (/ie$/.test(base)) return base.slice(0, -2) + 'ying';
    if (/[^e]e$/.test(base) && base !== 'be') return base.slice(0, -1) + 'ing';
    return base + 'ing';
  }
  function sOf(base) {
    if (base === 'do') return 'does';
    if (/(s|x|z|ch|sh)$/.test(base)) return base + 'es';
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
    return base + 's';
  }

  // form -> { base, form: 'base'|'past'|'ing'|'s' }
  const VERB_FORMS = new Map();
  function registerVerb(base) {
    if (!VERB_FORMS.has(base)) VERB_FORMS.set(base, { base, form: 'base' });
    const p = pastOf(base);
    if (!VERB_FORMS.has(p) || VERB_FORMS.get(p).form !== 'base') VERB_FORMS.set(p, { base, form: 'past' });
    VERB_FORMS.set(ingOf(base), { base, form: 'ing' });
    VERB_FORMS.set(sOf(base), { base, form: 's' });
  }
  VERB_BASES.forEach(registerVerb);
  // Some past forms equal the base (set, cut): prefer reading them as past only when unambiguous.
  VERB_FORMS.set('set', { base: 'set', form: 'base' });
  VERB_FORMS.set('cut', { base: 'cut', form: 'base' });

  function lookupVerb(word) {
    return VERB_FORMS.get(String(word).toLowerCase()) || null;
  }

  function guessBaseFromIng(ing) {
    const w = ing.toLowerCase();
    const known = VERB_FORMS.get(w);
    if (known) return known.base;
    let stem = w.replace(/ing$/, '');
    if (/([bdgmnprt])\1$/.test(stem)) return stem.slice(0, -1);
    if (/(at|iz|ov|us|uc|ir|ag|iv|ad|ur|ot|ss)$/.test(stem) && !/ss$/.test(stem)) return stem + 'e';
    return stem;
  }

  /** Conjugate a base verb for a resume context: present roles use the base form, everything else past. */
  function conj(base, ctx) {
    return ctx && ctx.tense === 'present' ? base : pastOf(base);
  }

  const VERB_SYNONYMS = {
    manage: ['direct', 'oversee', 'supervise', 'coordinate', 'run'],
    lead: ['direct', 'head', 'spearhead', 'guide'],
    develop: ['build', 'create', 'engineer', 'design'],
    create: ['design', 'build', 'produce', 'launch'],
    improve: ['enhance', 'optimize', 'streamline', 'strengthen'],
    increase: ['grow', 'boost', 'expand', 'raise'],
    reduce: ['cut', 'lower', 'decrease', 'trim'],
    work: ['collaborate', 'partner'],
    implement: ['deploy', 'execute', 'introduce', 'roll out'],
    build: ['engineer', 'construct', 'assemble', 'develop'],
    design: ['architect', 'craft', 'plan'],
    analyze: ['evaluate', 'assess', 'examine', 'investigate'],
    support: ['assist', 'enable', 'back'],
    coordinate: ['organize', 'orchestrate', 'arrange'],
    achieve: ['attain', 'reach', 'deliver'],
    launch: ['introduce', 'release', 'ship'],
    handle: ['manage', 'process', 'resolve'],
    communicate: ['present', 'convey', 'brief'],
    train: ['coach', 'mentor', 'teach'],
    sell: ['close', 'secure'],
    generate: ['produce', 'drive'],
    deliver: ['ship', 'complete', 'provide'],
    organize: ['arrange', 'coordinate', 'structure'],
    ensure: ['guarantee', 'secure', 'verify'],
    exceed: ['surpass', 'outperform'],
    negotiate: ['broker', 'secure'],
    close: ['secure', 'win', 'sign'],
    help: ['support', 'assist', 'enable'],
    use: ['apply', 'employ'],
    make: ['create', 'build', 'produce'],
    provide: ['deliver', 'supply', 'offer'],
    conduct: ['run', 'lead', 'perform'],
    maintain: ['sustain', 'preserve', 'uphold'],
    drive: ['lead', 'push', 'spur'],
    grow: ['expand', 'increase', 'scale'],
    collaborate: ['partner', 'team up'],
    oversee: ['supervise', 'direct', 'manage'],
    prospect: ['source', 'identify'],
  };
  // conjugate multi-word verbs like "roll out"
  function conjPhrase(phrase, ctx) {
    const parts = phrase.split(' ');
    const head = parts.shift();
    return [ctx && ctx.tense === 'present' ? head : pastOf(head)].concat(parts).join(' ');
  }
  ['release', 'supply', 'offer', 'push', 'broker', 'sign', 'preserve', 'uphold', 'back', 'apply', 'roll'].forEach(registerVerb);

  /* ------------------------------------------------------------ utilities */

  function matchCase(orig, rep) {
    if (!rep) return rep;
    if (/^[A-Z]/.test(orig) && orig.length > 1 && orig === orig.toUpperCase() && /[A-Z]{2}/.test(orig)) return rep.toUpperCase();
    if (/^[A-Z]/.test(orig)) return rep.charAt(0).toUpperCase() + rep.slice(1);
    return rep;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function lineStartAt(text, i) {
    let j = i - 1;
    while (j >= 0 && (text[j] === ' ' || text[j] === '\t' || text[j] === '-' || text[j] === '•' || text[j] === '*')) j--;
    return j < 0 || text[j] === '\n';
  }

  /* ------------------------------------------------------------- spelling */

  const MISSPELLINGS = {
    accomodate: 'accommodate', accomodated: 'accommodated', acheive: 'achieve', acheived: 'achieved', achived: 'achieved',
    acheivement: 'achievement', achievment: 'achievement', acheivements: 'achievements', achievments: 'achievements',
    acommodate: 'accommodate', accross: 'across', adress: 'address', adressed: 'addressed', agressive: 'aggressive',
    alot: 'a lot', analize: 'analyze', analisys: 'analysis', analysys: 'analysis', anual: 'annual', annualy: 'annually',
    apparant: 'apparent', appearence: 'appearance', aquire: 'acquire', aquired: 'acquired', arguement: 'argument',
    assistence: 'assistance', basicly: 'basically', begining: 'beginning', beggining: 'beginning', beleive: 'believe',
    benifit: 'benefit', benifits: 'benefits', buget: 'budget', budjet: 'budget', buisness: 'business', bussiness: 'business',
    calender: 'calendar', carreer: 'career', carrer: 'career', catagory: 'category', cheif: 'chief',
    collaberate: 'collaborate', collaberated: 'collaborated', collegue: 'colleague', collegues: 'colleagues',
    comission: 'commission', commision: 'commission', comittee: 'committee', commitee: 'committee',
    communcation: 'communication', comunication: 'communication', completly: 'completely', concensus: 'consensus',
    consistant: 'consistent', coordinater: 'coordinator', curiculum: 'curriculum', custmer: 'customer',
    custmers: 'customers', definately: 'definitely', definatly: 'definitely', desicion: 'decision',
    develope: 'develop', developement: 'development', developped: 'developed', diffrent: 'different',
    dilemna: 'dilemma', disapoint: 'disappoint', efficency: 'efficiency', efficent: 'efficient', enviroment: 'environment',
    equiptment: 'equipment', excede: 'exceed', exceded: 'exceeded', excellant: 'excellent', existance: 'existence',
    experiance: 'experience', experince: 'experience', expierence: 'experience', familar: 'familiar', finaly: 'finally',
    foward: 'forward', goverment: 'government', grammer: 'grammar', gratefull: 'grateful', gaurantee: 'guarantee',
    guarentee: 'guarantee', hte: 'the', immediatly: 'immediately', independant: 'independent',
    indispensible: 'indispensable', inital: 'initial', intergrate: 'integrate', intergration: 'integration',
    intrest: 'interest', irregardless: 'regardless', knowlege: 'knowledge', knowledgable: 'knowledgeable',
    lenght: 'length', liason: 'liaison', libary: 'library', lisence: 'license', maintainance: 'maintenance',
    maintenence: 'maintenance', managable: 'manageable', managment: 'management', mangement: 'management',
    neccessary: 'necessary', necesary: 'necessary', negociate: 'negotiate', negociated: 'negotiated',
    noticable: 'noticeable', occassion: 'occasion', occassionally: 'occasionally', occured: 'occurred',
    occurence: 'occurrence', oppurtunity: 'opportunity', oportunity: 'opportunity', oppurtunities: 'opportunities',
    oportunities: 'opportunities', orginal: 'original', paralell: 'parallel', particuarly: 'particularly',
    paticipate: 'participate', perfomance: 'performance', performence: 'performance', persistant: 'persistent',
    persue: 'pursue', plannig: 'planning', posession: 'possession', prefered: 'preferred', presense: 'presence',
    privelege: 'privilege', proffesional: 'professional', profesional: 'professional', publically: 'publicly',
    quater: 'quarter', quaterly: 'quarterly', realy: 'really', recieve: 'receive', recieved: 'received',
    recieves: 'receives', recieving: 'receiving', recomend: 'recommend', reccomend: 'recommend',
    reccommend: 'recommend', refered: 'referred', relevent: 'relevant', reponsible: 'responsible',
    resposible: 'responsible', responsable: 'responsible', resourses: 'resources', revenu: 'revenue',
    satisfed: 'satisfied', schedual: 'schedule', seperate: 'separate', seperated: 'separated',
    stakholders: 'stakeholders', stakeholers: 'stakeholders', statergy: 'strategy', stratagy: 'strategy',
    strategys: 'strategies', sucess: 'success', succesful: 'successful', successfull: 'successful',
    sucessful: 'successful', sucessfully: 'successfully', succesfully: 'successfully', supercede: 'supersede',
    suprise: 'surprise', teamate: 'teammate', teamates: 'teammates', techinical: 'technical', technicial: 'technical',
    teh: 'the', adn: 'and', thier: 'their', tommorow: 'tomorrow', tranfer: 'transfer', truely: 'truly',
    untill: 'until', usefull: 'useful', wich: 'which', wierd: 'weird', withold: 'withhold', writting: 'writing',
    recrutied: 'recruited', recuited: 'recruited', mangaged: 'managed', manged: 'managed', negotation: 'negotiation',
    implmented: 'implemented', impelemented: 'implemented', implemeted: 'implemented', accuracey: 'accuracy',
    buisnesses: 'businesses', clints: 'clients', cliants: 'clients', excelent: 'excellent', responsibilites: 'responsibilities',
    responsiblities: 'responsibilities', exellent: 'excellent', leadershp: 'leadership', leaderhip: 'leadership',
    pipline: 'pipeline', proces: 'process', procces: 'process', proccess: 'process', recieveing: 'receiving', quotaa: 'quota', territorry: 'territory', teritory: 'territory',
  };

  function spellingRule(text, out) {
    const re = /\b[A-Za-z]+\b/g;
    let m;
    while ((m = re.exec(text))) {
      const fix = MISSPELLINGS[m[0].toLowerCase()];
      if (fix) push(out, 'spelling', m.index, m.index + m[0].length, text, [matchCase(m[0], fix)], `“${m[0]}” looks misspelled.`);
    }
  }

  /* -------------------------------------------------------------- rules */

  function push(out, type, start, end, text, replacements, message) {
    out.push({ type, start, end, original: text.slice(start, end), replacements: replacements || [], message });
  }

  // Regex rule: fn(match, ctx, text) -> { replacements, message, start?, end? } | null
  function R(type, re, fn) { return { type, re, fn }; }
  // Simple phrase replacement
  function P(type, re, rep, message) {
    return R(type, re, (m) => ({ replacements: (Array.isArray(rep) ? rep : [rep]).map((r) => matchCase(m[0], r.replace(/\$(\d)/g, (_, n) => m[n] || ''))), message }));
  }

  const AN_EXCEPTIONS = /^(uni|use|usu|uti|eu|one|once|ubiq|ufo|ura)/i;
  const AN_SILENT_H = /^(hour|honest|honor|honour|heir)/i;

  const RULES = [
    /* Grammar */
    R('grammar', /\b([A-Za-z]+)\s+\1\b/gi, (m) => {
      if (/^(had|that|is)$/i.test(m[1])) return null;
      return { replacements: [m[1]], message: `“${m[1]}” is repeated.` };
    }),
    R('grammar', /\b(a|an)\s+([A-Za-z][\w-]*)/gi, (m) => {
      const art = m[1], word = m[2];
      if (/^[A-Z0-9]{2,}/.test(word)) return null; // acronyms are ambiguous (an MBA, a CRM)
      const vowel = /^[aeiou]/i.test(word) && !AN_EXCEPTIONS.test(word);
      const needsAn = vowel || AN_SILENT_H.test(word);
      if (art.toLowerCase() === 'a' && needsAn) return { end: m.index + art.length, replacements: [matchCase(art, 'an')], message: `Use “an” before “${word}”.` };
      if (art.toLowerCase() === 'an' && !needsAn) return { end: m.index + art.length, replacements: [matchCase(art, 'a')], message: `Use “a” before “${word}”.` };
      return null;
    }),
    R('grammar', /(?<![\w.'’])i(?![\w.'’])/g, () => ({ replacements: ['I'], message: 'Capitalize “I”.' })),
    R('grammar', /(?<=\S) {2,}(?=\S)/g, () => ({ replacements: [' '], message: 'Extra space.' })),
    R('grammar', /(?<=\w) +(?=[,.;:!?](?:\s|$))/g, () => ({ replacements: [''], message: 'Remove the space before punctuation.' })),
    R('grammar', /(?<=[A-Za-z]),(?=[A-Za-z])/g, () => ({ replacements: [', '], message: 'Add a space after the comma.' })),
    R('grammar', /(?<=[a-z]{2})\.(?=[A-Z](?:[a-z]|\s))/g, () => ({ replacements: ['. '], message: 'Add a space after the period.' })),
    R('grammar', /(?<=[.!?]\s+)([a-z])(?=[a-z]*\b)/g, (m, ctx, text) => {
      // skip common abbreviations like "e.g. something"
      const before = text.slice(Math.max(0, m.index - 6), m.index);
      if (/\b(e\.g|i\.e|etc|vs|approx|incl)\.\s+$/i.test(before)) return null;
      return { replacements: [m[1].toUpperCase()], message: 'Start the sentence with a capital letter.' };
    }),
    P('grammar', /\b(could|should|would|must|might) of\b/gi, '$1 have', 'Use “have”, not “of”.'),
    P('grammar', /\b(they|we|you) was\b/gi, '$1 were', 'Subject and verb disagree.'),
    P('grammar', /\b(he|she|it) don[’']t\b/gi, "$1 doesn't", 'Subject and verb disagree.'),
    P('grammar', /\b(more|less|better|greater|fewer|rather|larger|higher|lower|faster) then\b/gi, '$1 than', 'Use “than” for comparisons.'),
    P('grammar', /\bits['’] /gi, 'its ', '“its’” is not a word. Use “its”.'),
    P('grammar', /\bless (people|customers|clients|errors|mistakes|employees|tickets|bugs|calls|hours|days)\b/gi, 'fewer $1', 'Use “fewer” for things you can count.'),

    /* Awkward phrasing / clarity */
    R('clarity', /\b(?:(?:was|were|am|is|are)\s+)?responsible for (?:the )?([a-z]+ing)\b/gi, (m, ctx) => {
      const base = guessBaseFromIng(m[1]);
      return { replacements: [matchCase(m[0], conj(base, ctx))], message: '“Responsible for” describes a duty. Say what you did.' };
    }),
    R('clarity', /\b(?:was|were) able to ([a-z]+)\b/gi, (m, ctx) => {
      const v = lookupVerb(m[1]);
      if (!v || v.form !== 'base') return null;
      return { replacements: [matchCase(m[0], pastOf(v.base))], message: '“Was able to” is indirect. Lead with the verb.' };
    }),
    R('clarity', /\b(?:tasked with|charged with) ([a-z]+ing)\b/gi, (m, ctx) => ({
      replacements: [matchCase(m[0], conj(guessBaseFromIng(m[1]), ctx))], message: '“Tasked with” hides the outcome. Say what you did.',
    })),
    ...[
      [/\bmade (?:a |the )?decisions? (?:on|about)\b/gi, 'decided', 'decide'],
      [/\bmade (?:a |the )?decisions?\b/gi, 'decided', 'decide'],
      [/\bconducted (?:an |the )?analysis of\b/gi, 'analyzed', 'analyze'],
      [/\bperformed (?:an |the )?analysis of\b/gi, 'analyzed', 'analyze'],
      [/\bprovided assistance (?:to|with)\b/gi, 'assisted', 'assist'],
      [/\bgave (?:a |the )?presentations? (?:on|about|to)\b/gi, 'presented', 'present'],
      [/\bperformed (?:an |the )?evaluation of\b/gi, 'evaluated', 'evaluate'],
      [/\bmade improvements (?:to|in)\b/gi, 'improved', 'improve'],
      [/\bmade (?:a |the )?reduction (?:in|of)\b/gi, 'reduced', 'reduce'],
      [/\bcame to (?:an |the )?agreement\b/gi, 'agreed', 'agree'],
      [/\bhad (?:a |the )?discussion (?:about|on|with)\b/gi, 'discussed', 'discuss'],
      [/\bconducted (?:a |the )?review of\b/gi, 'reviewed', 'review'],
      [/\bprovided (?:the )?training (?:to|for)\b/gi, 'trained', 'train'],
      [/\bcame up with\b/gi, 'devised', 'devise'],
      [/\bcome up with\b/gi, 'devise', 'devise'],
      [/\bmade (?:a |the )?contribution to\b/gi, 'contributed to', 'contribute'],
      [/\bis able to\b/gi, 'can', null],
      [/\bhas the ability to\b/gi, 'can', null],
    ].map(([re, rep, base]) => R('clarity', re, (m, ctx) => ({
      replacements: [matchCase(m[0], base && /^(made|conducted|performed|provided|gave|came|had)\b/i.test(m[0]) ? conjPhrase(rep === 'contributed to' ? 'contribute to' : base, ctx) : rep)],
      message: 'A noun phrase is doing a verb’s job. Use the verb.',
    }))),
    R('clarity', /\b(?:was|were|is|are|been|being)\s+(\w+ed)\s+by\b/gi, () => ({
      replacements: [], message: 'Passive voice. Put who acted first so the sentence reads stronger.',
    })),

    /* Concise */
    ...[
      [/\bin order to\b/gi, 'to'],
      [/\bso as to\b/gi, 'to'],
      [/\bdue to the fact that\b/gi, 'because'],
      [/\bowing to the fact that\b/gi, 'because'],
      [/\bin light of the fact that\b/gi, 'because'],
      [/\bdespite the fact that\b/gi, 'although'],
      [/\bat this point in time\b/gi, 'now'],
      [/\bat the present time\b/gi, 'currently'],
      [/\ba (?:large|great|significant) number of\b/gi, 'many'],
      [/\ba (?:wide )?variety of\b/gi, 'various'],
      [/\bfor the purpose of\b/gi, 'for'],
      [/\bin the event that\b/gi, 'if'],
      [/\bwith (?:regard|regards|respect) to\b/gi, 'regarding'],
      [/\bin (?:regard|regards) to\b/gi, 'regarding'],
      [/\bon a (daily|weekly|monthly|quarterly|yearly) basis\b/gi, '$1'],
      [/\bon a regular basis\b/gi, 'regularly'],
      [/\bon an ongoing basis\b/gi, 'continuously'],
      [/\bthe majority of\b/gi, 'most'],
      [/\bprior to\b/gi, 'before'],
      [/\bsubsequent to\b/gi, 'after'],
      [/\bin close proximity to\b/gi, 'near'],
      [/\beach and every\b/gi, 'every'],
      [/\bfirst and foremost\b/gi, 'first'],
      [/\bpast history\b/gi, 'history'],
      [/\bend result\b/gi, 'result'],
      [/\bfuture plans\b/gi, 'plans'],
      [/\bcompletely (eliminated|finished|destroyed)\b/gi, '$1'],
      [/\bwhether or not\b/gi, 'whether'],
      [/\bat all times\b/gi, 'always'],
      [/\buntil such time as\b/gi, 'until'],
      [/\bin the process of /gi, ''],
      [/\butiliz(e|es|ed|ing)\b/gi, 'us$1'],
      [/\butilization\b/gi, 'use'],
      [/\ba total of /gi, ''],
      [/\bin a timely manner\b/gi, 'promptly'],
      [/\bin an effort to\b/gi, 'to'],
      [/\bwith the goal of (\w+)ing\b/gi, null],
      [/\bthe fact that\b/gi, 'that'],
    ].filter(([, rep]) => rep !== null).map(([re, rep]) => P('concise', re, rep, 'Wordy. A shorter phrase says the same thing.')),
    R('concise', /\b(very|really|extremely|actually|basically|quite|totally|literally|truly|just|successfully|definitely|incredibly)\s+(?![-])/gi, (m) => ({
      replacements: [''], message: `“${m[1]}” adds little. Cut it.`,
    })),

    /* Professional tone */
    ...[
      [/\bdon[’']t\b/gi, 'do not'], [/\bcan[’']t\b/gi, 'cannot'], [/\bwon[’']t\b/gi, 'will not'],
      [/\bdidn[’']t\b/gi, 'did not'], [/\bwasn[’']t\b/gi, 'was not'], [/\bisn[’']t\b/gi, 'is not'],
      [/\baren[’']t\b/gi, 'are not'], [/\bcouldn[’']t\b/gi, 'could not'], [/\bwouldn[’']t\b/gi, 'would not'],
      [/\bshouldn[’']t\b/gi, 'should not'], [/\bdoesn[’']t\b/gi, 'does not'], [/\bhaven[’']t\b/gi, 'have not'],
      [/\bhasn[’']t\b/gi, 'has not'], [/\bI[’']m\b/g, 'I am'], [/\bI[’']ve\b/g, 'I have'], [/\bI[’']ll\b/g, 'I will'],
      [/\bwe[’']re\b/gi, 'we are'], [/\bthey[’']re\b/gi, 'they are'], [/\bwe[’']ve\b/gi, 'we have'],
    ].map(([re, rep]) => P('tone', re, rep, 'Contractions read casual on a resume.')),
    ...[
      [/\b(?:a lot of|lots of|tons of|loads of) (?=experience|knowledge|expertise|success|responsibility|exposure)/gi, ['extensive ', 'deep '], 'Casual. Use a precise word.'],
      [/\b(?:a lot of|lots of|tons of|loads of)\b/gi, ['many', 'numerous'], 'Casual. Use a precise word or a number.'],
      [/\bstuff\b/gi, ['materials', 'work'], '“Stuff” is vague. Name the thing.'],
      [/\bthings\b/gi, ['tasks', 'items'], '“Things” is vague. Name what they were.'],
      [/\bkids\b/gi, ['children', 'students'], 'Casual word choice.'],
      [/\bguys\b/gi, ['team members', 'colleagues'], 'Casual word choice.'],
      [/\b(?:awesome|amazing|super cool|cool)\b/gi, ['excellent', 'outstanding'], 'Casual word choice.'],
      [/\bhuge\b/gi, ['significant', 'major'], 'Casual word choice.'],
      [/\bboss\b/gi, ['manager', 'supervisor'], 'Casual word choice.'],
      [/\bpretty much\b/gi, ['largely', 'mostly'], 'Casual word choice.'],
      [/\b(?:kind of|sort of)\b/gi, ['somewhat'], 'Hedging weakens the claim.'],
      [/\bfigured out\b/gi, ['determined', 'solved'], 'Casual phrasal verb.'],
      [/\bfigure out\b/gi, ['determine', 'solve'], 'Casual phrasal verb.'],
      [/\bchecked out\b/gi, ['reviewed', 'evaluated'], 'Casual phrasal verb.'],
      [/\bhelped out\b/gi, ['assisted', 'supported'], 'Casual phrasal verb.'],
      [/\bhelp out\b/gi, ['assist', 'support'], 'Casual phrasal verb.'],
      [/\bgonna\b/gi, ['going to'], 'Slang.'],
      [/\bwanna\b/gi, ['want to'], 'Slang.'],
      [/\bgot promoted\b/gi, ['was promoted', 'earned promotion'], 'Casual word choice.'],
      [/\bgot\b/gi, ['earned', 'received', 'secured'], '“Got” is vague and casual.'],
      [/\bok(?:ay)?\b/gi, ['acceptable', 'satisfactory'], 'Casual word choice.'],
    ].map(([re, rep, msg]) => P('tone', re, rep, msg)),
    R('tone', /!+/g, () => ({ replacements: ['.'], message: 'Exclamation marks read informal on a resume.' })),
    R('tone', /\betc\.?/gi, () => ({ replacements: [], message: '“etc.” reads vague. List the items that matter most.' })),
  ];

  /* Line rules: applied to each line (bullets) with its offset. */
  const WEAK_STARTS = [
    { re: /^helped (?:to )?([a-z]+)\b/i, fn: (m, ctx) => {
      const v = lookupVerb(m[1]);
      if (v && v.form === 'base') return { replacements: [conj('contribute', ctx) + ' to ' + ingOf(v.base), conj('collaborate', ctx) + ' to ' + v.base], message: '“Helped” hides your part. Say what you did, or how you contributed.' };
      return { end: 6, replacements: ['support', 'assist', 'enable'].map((b) => conj(b, ctx)), message: '“Helped” is weak. Name how you helped.' };
    } },
    { re: /^worked on\b/i, fn: (m, ctx) => ({ replacements: ['develop', 'build', 'deliver'].map((b) => conj(b, ctx)), message: '“Worked on” is vague. Use a verb that shows the result.' }) },
    { re: /^worked with\b/i, fn: (m, ctx) => ({ replacements: ['partner with', 'collaborate with'].map((b) => conjPhrase(b, ctx)), message: '“Worked with” is weak. Show the collaboration.' }) },
    { re: /^did\b/i, fn: (m, ctx) => ({ replacements: ['perform', 'execute', 'complete'].map((b) => conj(b, ctx)), message: '“Did” is weak. Use a specific verb.' }) },
    { re: /^made\b/i, fn: (m, ctx) => ({ replacements: ['create', 'build', 'produce'].map((b) => conj(b, ctx)), message: '“Made” is weak. Use a specific verb.' }) },
    { re: /^handled\b/i, fn: (m, ctx) => ({ replacements: ['manage', 'resolve', 'process'].map((b) => conj(b, ctx)), message: '“Handled” is vague. Say how.' }) },
    { re: /^(?:was |am )?in charge of\b/i, fn: (m, ctx) => ({ replacements: ['lead', 'manage', 'direct'].map((b) => conj(b, ctx)), message: '“In charge of” is passive. Lead with the verb.' }) },
    { re: /^participated in\b/i, fn: (m, ctx) => ({ replacements: ['contribute to', 'collaborate on'].map((b) => conjPhrase(b, ctx)), message: '“Participated in” undersells you. Say what you contributed.' }) },
    { re: /^assisted (?:with|in)\b/i, fn: (m, ctx) => ({ replacements: ['support', 'co-lead'].map((b) => conj(b, ctx)), message: '“Assisted with” is weak. Name your role.' }) },
    { re: /^used\b/i, fn: (m, ctx) => ({ replacements: ['apply', 'employ'].map((b) => conj(b, ctx)), message: '“Used” is weak. Show what you achieved with it.' }) },
    { re: /^(?:was |am )?responsible for (?!\w+ing\b)/i, fn: (m, ctx) => ({ replacements: ['manage ', 'own ', 'oversee '].map((b) => conjPhrase(b.trim(), ctx) + ' '), message: '“Responsible for” describes a duty. Say what you did.' }) },
    { re: /^(?:my )?duties included\s*/i, fn: () => ({ replacements: [], message: 'Skip “Duties included”. Start with what you did.' }) },
    { re: /^tried to\b/i, fn: () => ({ replacements: [], message: '“Tried to” suggests you didn’t succeed. State the result.' }) },
  ];

  const CLICHES = /\b(team player|hard[- ]working|hard worker|detail[- ]oriented|self[- ]starter|go[- ]getter|results[- ]driven|results[- ]oriented|think outside the box|synergy|synergies|dynamic|passionate|proven track record|excellent communication skills|fast learner|quick learner|highly motivated|motivated|guru|ninja|rockstar|rock star|best of breed|go-to person|people person)\b/gi;

  function bulletLineRules(line, off, ctx, out, text) {
    const lead = line.match(/^[\s\-•*·]*/)[0];
    const body = line.slice(lead.length);
    if (!body.trim()) return;
    const bStart = off + lead.length;

    // First-person pronouns at the start
    const pro = body.match(/^(I|We|My team and I)\s+(?=\w)/);
    if (pro) {
      push(out, 'concise', bStart, bStart + pro[0].length, text, [''], 'Resume bullets usually drop “I”. Start with the verb.');
    }
    const afterPro = pro ? body.slice(pro[0].length) : body;
    const aStart = bStart + (pro ? pro[0].length : 0);

    let weak = false;
    for (const w of WEAK_STARTS) {
      const m = afterPro.match(w.re);
      if (m) {
        const res = w.fn(m, ctx);
        if (res) {
          const end = aStart + (res.end != null ? res.end : m[0].length);
          // Include a leading pronoun in the range so one fix handles both.
          push(out, 'verb', bStart, end, text, res.replacements.map((r) => cap(r)), res.message);
          weak = true;
        }
        break;
      }
    }

    const firstWordMatch = afterPro.match(/^([A-Za-z][A-Za-z-]*)/);
    const firstWord = firstWordMatch ? firstWordMatch[1] : '';
    const v = lookupVerb(firstWord);

    // Tense consistency
    if (!weak && v && ctx.tense && ctx.kind === 'bullets') {
      if (ctx.tense === 'past' && (v.form === 'base' || v.form === 's') && !/^(set|cut)$/i.test(firstWord)) {
        push(out, 'verb', aStart, aStart + firstWord.length, text, [matchCase(firstWord, pastOf(v.base))], 'Past roles read best in past tense.');
      } else if (ctx.tense === 'present' && v.form === 's') {
        // Past tense is fine for finished achievements in a current role; only "Manages" style needs fixing.
        push(out, 'verb', aStart, aStart + firstWord.length, text, [matchCase(firstWord, v.base)], 'Resume bullets drop the “s”: write “Manage”, not “Manages”.');
      }
    }

    if (ctx.kind === 'bullets') {
      const hasFix = out.some((s) => s.start === aStart && s.replacements.length);
      if (!weak && !pro && !hasFix && firstWord && !v && !/ed$/i.test(firstWord) && !/^(co-|re-)/i.test(firstWord)) {
        push(out, 'resume', bStart, bStart + firstWord.length, text, [], 'Start each bullet with an action verb (Led, Built, Grew).');
      }
      const words = body.split(/\s+/).filter(Boolean).length;
      if (words > 32) push(out, 'resume', bStart, off + line.length, text, [], `Long bullet (${words} words). Aim for one or two lines.`);
      if (!/\d|%|\$|€|£|percent|million|thousand|doubled|tripled|halved/i.test(body) && words >= 4) {
        push(out, 'resume', bStart, off + line.length, text, [], 'Add a measurable result: a number, %, $, or time saved.');
      }
    }
  }

  function repetitionRule(text, out) {
    const STOP = new Set('with that this from have were their them they your into over than then also more most such only other which while where when what team teams work across using used within about each both'.split(' '));
    const counts = new Map();
    const re = /\b[A-Za-z][a-z]{3,}\b/g;
    let m;
    const seen = [];
    while ((m = re.exec(text))) {
      const w = m[0].toLowerCase();
      if (STOP.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
      seen.push({ w, i: m.index, word: m[0] });
    }
    for (const s of seen) {
      const n = counts.get(s.w);
      if (n >= 3) {
        const idx = seen.filter((x) => x.w === s.w).indexOf(s);
        if (idx < 2) continue;
        const v = lookupVerb(s.w);
        let reps = [];
        if (v && VERB_SYNONYMS[v.base]) {
          reps = VERB_SYNONYMS[v.base].slice(0, 3).map((b) => matchCase(s.word, formLike(b, v.form)));
        }
        push(out, 'repeat', s.i, s.i + s.word.length, text, reps, `“${s.word}” appears ${n} times here. Vary the wording.`);
      }
    }
  }

  function formLike(base, form) {
    const parts = base.split(' ');
    const head = parts.shift();
    const f = form === 'past' ? pastOf(head) : form === 'ing' ? ingOf(head) : form === 's' ? sOf(head) : head;
    return [f].concat(parts).join(' ');
  }

  function clicheRule(text, out) {
    CLICHES.lastIndex = 0;
    let m;
    while ((m = CLICHES.exec(text))) {
      push(out, 'resume', m.index, m.index + m[0].length, text, [], `“${m[0]}” is a cliché recruiters skim past. Show it with an example instead.`);
    }
  }

  function periodConsistency(text, out, ctx) {
    if (ctx.kind !== 'bullets') return;
    const lines = [];
    let off = 0;
    for (const line of text.split('\n')) {
      if (line.trim()) lines.push({ line, off });
      off += line.length + 1;
    }
    if (lines.length < 2) return;
    const withP = lines.filter((l) => /\.\s*$/.test(l.line));
    if (!withP.length || withP.length === lines.length) return;
    const majorityPeriod = withP.length > lines.length / 2;
    for (const l of lines) {
      const trimmed = l.line.replace(/\s+$/, '');
      const has = /\.$/.test(trimmed);
      if (has === majorityPeriod) continue;
      if (majorityPeriod) push(out, 'grammar', l.off + trimmed.length, l.off + trimmed.length, text, ['.'], 'Most bullets end with a period. Match them.');
      else push(out, 'grammar', l.off + trimmed.length - 1, l.off + trimmed.length, text, [''], 'Most bullets have no final period. Match them.');
    }
  }

  function sentenceLength(text, out, ctx) {
    if (ctx.kind === 'bullets') return;
    const re = /[^.!?\n]+[.!?]?/g;
    let m;
    while ((m = re.exec(text))) {
      const n = m[0].split(/\s+/).filter(Boolean).length;
      if (n > 35) push(out, 'clarity', m.index, m.index + m[0].length, text, [], `This sentence runs ${n} words. Split it in two.`);
    }
    if (ctx.kind === 'summary') {
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words > 90) push(out, 'resume', 0, Math.min(text.length, 40), text, [], `Summary is ${words} words. Keep it under about 70 so recruiters read it.`);
    }
  }

  // Layout advice: split long paragraphs, and put three or more points on their own lines.
  const CHARS_PER_LINE = 90; // about one printed line at 10.5 pt with one-inch margins
  function sentencesOf(line) {
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z])|;\s+/).map((x) => x.trim()).filter(Boolean);
    return parts.every((x) => x.split(/\s+/).length >= 2) ? parts : [];
  }
  function structureRule(text, out, ctx) {
    let off = 0;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      const lead = line.length - line.trimStart().length;
      if (trimmed) {
        const est = Math.ceil(trimmed.length / CHARS_PER_LINE);
        if ((ctx.kind === 'summary' || ctx.kind === 'plain') && est > 7) {
          push(out, 'resume', off + lead, off + lead + Math.min(trimmed.length, 40), text, [], `This paragraph runs about ${est} lines. Split anything over 7 lines into two paragraphs.`);
        }
        // Several points in one line: offer to put each on its own line (shown as bullets)
        if (ctx.kind === 'bullets' || ctx.lines) {
          const parts = sentencesOf(trimmed);
          if (parts.length >= 3) {
            const rep = parts.map((x) => x.replace(/;$/, '').replace(/^[a-z]/, (c) => c.toUpperCase())).join('\n');
            push(out, 'resume', off + lead, off + line.length, text, [rep], `${parts.length} points in one line. Give each its own bullet so recruiters can scan them.`);
          }
        }
      }
      off += line.length + 1;
    }
  }

  /* ------------------------------------------------------------ analyze */

  function analyze(text, ctx, types) {
    ctx = ctx || {};
    text = String(text || '');
    const out = [];
    if (!text.trim()) return out;
    spellingRule(text, out);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text))) {
        if (m[0] === '') { rule.re.lastIndex++; continue; }
        const res = rule.fn(m, ctx, text);
        if (!res) continue;
        const start = res.start != null ? res.start : m.index;
        const end = res.end != null ? res.end : m.index + m[0].length;
        push(out, rule.type, start, end, text, res.replacements, res.message);
      }
    }
    if (ctx.kind === 'bullets' || ctx.kind === 'summary') {
      let off = 0;
      for (const line of text.split('\n')) {
        if (ctx.kind === 'bullets') bulletLineRules(line, off, ctx, out, text);
        off += line.length + 1;
      }
    }
    // Capitalize the first letter of each line
    let off2 = 0;
    for (const line of text.split('\n')) {
      const m = line.match(/^([\s\-•*·]*)([a-z])([a-z]*)/);
      const i = off2 + (m ? m[1].length : 0);
      if (m && !(/^i$/.test(m[2] + m[3])) && ctx.kind !== 'skills' && !out.some((s) => s.start === i && s.replacements.length && (!types || types.includes(s.type)))) {
        push(out, 'grammar', i, i + 1, text, [m[2].toUpperCase()], 'Start with a capital letter.');
      }
      off2 += line.length + 1;
    }
    periodConsistency(text, out, ctx);
    sentenceLength(text, out, ctx);
    structureRule(text, out, ctx);
    repetitionRule(text, out);
    clicheRule(text, out);
    return dedupe(types ? out.filter((s) => types.includes(s.type)) : out, text);
  }

  function dedupe(list, text) {
    const fixes = list.filter((s) => s.replacements.length);
    const advice = list.filter((s) => !s.replacements.length);
    fixes.sort((a, b) => TYPES[a.type].priority - TYPES[b.type].priority || a.start - b.start);
    const kept = [];
    for (const s of fixes) {
      if (s.replacements.every((r) => r === s.original)) continue;
      const clash = kept.some((k) => (s.start < k.end && k.start < s.end) || (s.start === s.end && s.start === k.start) || (k.start === k.end && k.start === s.start));
      if (!clash) kept.push(s);
    }
    const seen = new Set();
    const adv = advice.filter((s) => {
      const key = s.start + ':' + s.end + ':' + s.message;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return kept.concat(adv).sort((a, b) => a.start - b.start || TYPES[a.type].priority - TYPES[b.type].priority);
  }

  /* -------------------------------------------------------------- apply */

  function applySuggestion(text, s, replacement) {
    const rep = replacement != null ? replacement : s.replacements[0];
    if (rep == null) return text;
    let next = text.slice(0, s.start) + rep + text.slice(s.end);
    // After a deletion at the start of a line, capitalize what now starts it.
    if (rep === '' && lineStartAt(next, s.start) && /[a-z]/.test(next.charAt(s.start))) {
      next = next.slice(0, s.start) + next.charAt(s.start).toUpperCase() + next.slice(s.start + 1);
    }
    return next;
  }

  function applyMany(text, suggestions) {
    const fixes = suggestions.filter((s) => s.replacements.length).sort((a, b) => b.start - a.start);
    let out = text;
    let lastStart = Infinity;
    for (const s of fixes) {
      if (s.end > lastStart) continue;
      out = applySuggestion(out, s);
      lastStart = s.start;
    }
    return out;
  }

  const MODES = {
    polish: ['spelling', 'grammar', 'clarity', 'concise', 'tone', 'verb'],
    fix: ['spelling', 'grammar'],
    awkward: ['clarity', 'grammar'],
    concise: ['concise'],
    tone: ['tone'],
    verbs: ['verb'],
  };

  /** Run a whole-text transformation. Returns { text, changed }. */
  function transform(text, mode, ctx) {
    const types = MODES[mode] || MODES.polish;
    let cur = String(text || '');
    for (let pass = 0; pass < 4; pass++) {
      const sugg = analyze(cur, ctx, types).filter((s) => s.replacements.length);
      if (!sugg.length) break;
      const next = applyMany(cur, sugg);
      if (next === cur) break;
      cur = next;
    }
    return { text: cur, changed: cur !== text };
  }

  /** Offer up to three rephrasings of one line or sentence. */
  function rephrase(line, ctx) {
    ctx = ctx || {};
    const original = String(line || '').trim();
    if (!original) return [];
    const options = [];
    const polished = transform(original, 'polish', ctx).text;
    options.push(polished);

    // Swap the lead verb for a synonym
    const m = polished.match(/^([A-Za-z]+)(\b.*)$/);
    if (m) {
      const v = lookupVerb(m[1]);
      if (v && VERB_SYNONYMS[v.base]) {
        for (const syn of VERB_SYNONYMS[v.base].slice(0, 2)) {
          options.push(cap(formLike(syn, v.form)) + m[2]);
        }
      }
    }

    // Restructure: "X by doing Y" -> "Did Y, X-ing"
    const trail = /\.$/.test(polished) ? '.' : '';
    const body = polished.replace(/\.$/, '');
    const by = body.match(/^([A-Za-z]+)\s+(.+?)\s+(?:by|through)\s+([a-z]+ing)\s+(.+)$/);
    if (by) {
      const v1 = lookupVerb(by[1]);
      const base2 = guessBaseFromIng(by[3]);
      if (v1) options.unshift(cap(formLike(base2, v1.form === 'base' ? 'base' : 'past')) + ' ' + by[4] + ', ' + ingOf(v1.base) + ' ' + by[2] + trail);
    }
    // Restructure: "Did X, resulting in Y" -> "Drove Y by doing X"
    const res = body.match(/^([A-Za-z]+)\s+(.+?),?\s+(?:resulting in|leading to|which (?:led to|resulted in))\s+(.+)$/);
    if (res) {
      const v1 = lookupVerb(res[1]);
      if (v1) options.unshift(cap(conj('deliver', ctx)) + ' ' + res[3] + ' by ' + ingOf(v1.base) + ' ' + res[2] + trail);
    }
    // Fallback: swap the first verb that has synonyms anywhere in the sentence
    if (options.length < 3) {
      const re = /\b[a-z]+\b/g;
      let w;
      while ((w = re.exec(polished))) {
        const v = lookupVerb(w[0]);
        if (v && VERB_SYNONYMS[v.base] && w.index > 0) {
          for (const syn of VERB_SYNONYMS[v.base].slice(0, 2)) options.push(polished.slice(0, w.index) + formLike(syn, v.form) + polished.slice(w.index + w[0].length));
          break;
        }
      }
    }
    const seen = new Set([original.toLowerCase()]);
    return options.filter((o) => {
      const k = o.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 3);
  }

  /**
   * Cross-field checks. `fields` is [{ path, text, ctx }].
   * Returns { [path]: suggestion[] } including per-field analysis.
   */
  function analyzeResume(fields) {
    const result = {};
    const leadVerbs = new Map();
    for (const f of fields) {
      result[f.path] = analyze(f.text, f.ctx);
      if (f.ctx && f.ctx.kind === 'bullets') {
        let off = 0;
        for (const line of String(f.text || '').split('\n')) {
          const mm = line.match(/^([\s\-•*·]*)([A-Za-z]+)/);
          if (mm) {
            const v = lookupVerb(mm[2]);
            if (v) {
              const list = leadVerbs.get(v.base) || [];
              list.push({ path: f.path, start: off + mm[1].length, word: mm[2], form: v.form, ctx: f.ctx, text: f.text });
              leadVerbs.set(v.base, list);
            }
          }
          off += line.length + 1;
        }
      }
    }
    for (const [base, uses] of leadVerbs) {
      if (uses.length < 3) continue;
      uses.slice(1).forEach((u) => {
        const syns = (VERB_SYNONYMS[base] || []).slice(0, 3).map((b) => matchCase(u.word, formLike(b, u.form)));
        const sug = { type: 'repeat', start: u.start, end: u.start + u.word.length, original: u.word, replacements: syns, message: `${uses.length} bullets start with “${cap(formLike(base, u.form))}”. Vary your verbs.` };
        const list = result[u.path];
        if (!list.some((s) => s.replacements.length && s.start < sug.end && sug.start < s.end)) list.push(sug);
        list.sort((a, b) => a.start - b.start);
      });
    }
    return result;
  }

  /** Word-level diff for before/after previews. Returns [{ op: 'eq'|'del'|'ins', text }]. */
  function diffWords(a, b) {
    const A = String(a).match(/\s+|[^\s]+/g) || [];
    const B = String(b).match(/\s+|[^\s]+/g) || [];
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    const add = (op, text) => { const last = out[out.length - 1]; if (last && last.op === op) last.text += text; else out.push({ op, text }); };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { add('eq', A[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { add('del', A[i]); i++; }
      else { add('ins', B[j]); j++; }
    }
    while (i < n) add('del', A[i++]);
    while (j < m) add('ins', B[j++]);
    return out;
  }

  return { TYPES, MODES, analyze, analyzeResume, applySuggestion, applyMany, transform, rephrase, diffWords, lookupVerb, pastOf, ingOf };
});
