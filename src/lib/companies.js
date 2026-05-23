// Curated UK company database for smart search
// Covers the most common accounts people need to pass on

export const UK_COMPANIES = [
  // ── Banking ────────────────────────────────────────────────────────────────
  { id: 'barclays',       name: 'Barclays',              category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings', 'mortgage'], bereavePhone: '0800 068 2313', bereaveUrl: 'https://www.barclays.co.uk/help/bereavement/', bereaveNote: 'Dedicated bereavement team. Call to register and close accounts.', bereaveRequirements: ['Death certificate', 'Grant of Probate (if estate over ~£50,000)', 'Executor ID', 'Account details'] },
  { id: 'lloyds',         name: 'Lloyds Bank',           category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings'], bereavePhone: '0800 096 4396', bereaveUrl: 'https://www.lloydsbank.com/help-guidance/bereavement.html', bereaveNote: 'Bereavement support team. Can close accounts and release funds for funeral costs.', bereaveRequirements: ['Death certificate', 'Executor or next of kin ID', 'Account details', 'Probate may be required for larger amounts'] },
  { id: 'natwest',        name: 'NatWest',               category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings'], bereavePhone: '0800 161 5584', bereaveUrl: 'https://www.natwest.com/support/bereavement.html', bereaveNote: 'NatWest bereavement team. Can also be notified via the Death Notification Service.', bereaveRequirements: ['Death certificate', 'Executor ID', 'Account details', 'Grant of Probate for amounts over threshold'] },
  { id: 'hsbc',           name: 'HSBC',                  category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings'], bereavePhone: '0800 783 1300', bereaveUrl: 'https://www.hsbc.co.uk/help/bereavement-support/', bereaveNote: 'HSBC bereavement and executor helpline.', bereaveRequirements: ['Death certificate', 'Executor or administrator ID', 'Account number or sort code', 'Grant of Probate if required'] },
  { id: 'santander',      name: 'Santander',             category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings', 'mortgage'], bereavePhone: '0800 085 0422', bereaveUrl: 'https://www.santander.co.uk/personal/support/bereavement', bereaveNote: 'Santander bereavement centre. Handles accounts, savings, and mortgages.', bereaveRequirements: ['Death certificate', 'Executor ID', 'Account details', 'Mortgage account number if applicable'] },
  { id: 'nationwide',     name: 'Nationwide',            category: 'banking',      logo: '🏦', tags: ['bank', 'building society', 'savings', 'mortgage'], bereavePhone: '0800 464 3018', bereaveUrl: 'https://www.nationwide.co.uk/support/bereavement/', bereaveNote: 'Nationwide bereavement team. Can handle accounts, savings, and ISAs.', bereaveRequirements: ['Death certificate', 'ID of executor or next of kin', 'Account or membership number', 'Probate may be needed for larger balances'] },
  { id: 'halifax',        name: 'Halifax',               category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'mortgage'], bereavePhone: '0345 850 5505', bereaveUrl: 'https://www.halifax.co.uk/helpcentre/bereavement/', bereaveNote: 'Halifax bereavement team. Part of Lloyds Banking Group.', bereaveRequirements: ['Death certificate', 'Executor ID', 'Account details', 'Probate letter if applicable'] },
  { id: 'monzo',          name: 'Monzo',                 category: 'banking',      logo: '🏦', tags: ['bank', 'digital bank', 'current account'], bereaveUrl: 'https://monzo.com/information/bereavement/', bereaveNote: 'Contact Monzo via the app or email bereavement@monzo.com. No dedicated phone line.' },
  { id: 'starling',       name: 'Starling Bank',         category: 'banking',      logo: '🏦', tags: ['bank', 'digital bank', 'current account'], bereaveUrl: 'https://www.starlingbank.com/help/managing-your-money/bereavement/', bereaveNote: 'Contact via in-app chat or email help@starlingbank.com for bereavement support.' },
  { id: 'revolut',        name: 'Revolut',               category: 'banking',      logo: '🏦', tags: ['bank', 'digital bank', 'current account'] },
  { id: 'virgin-money',   name: 'Virgin Money',          category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings'] },
  { id: 'tesco-bank',     name: 'Tesco Bank',            category: 'banking',      logo: '🏦', tags: ['bank', 'savings', 'credit card'] },
  { id: 'co-op-bank',     name: 'Co-operative Bank',     category: 'banking',      logo: '🏦', tags: ['bank', 'current account'] },
  { id: 'metro-bank',     name: 'Metro Bank',            category: 'banking',      logo: '🏦', tags: ['bank', 'current account'] },
  { id: 'first-direct',   name: 'First Direct',          category: 'banking',      logo: '🏦', tags: ['bank', 'current account', 'savings'] },
  { id: 'tsb',            name: 'TSB',                   category: 'banking',      logo: '🏦', tags: ['bank', 'current account'] },
  { id: 'post-office',    name: 'Post Office Money',     category: 'banking',      logo: '🏦', tags: ['bank', 'savings'] },
  { id: 'chase',          name: 'Chase UK',              category: 'banking',      logo: '🏦', tags: ['bank', 'digital bank', 'current account'] },

  // ── Investments & Pensions ─────────────────────────────────────────────────
  { id: 'vanguard',       name: 'Vanguard',              category: 'investments',  logo: '📈', tags: ['isa', 'sipp', 'pension', 'investments'] },
  { id: 'hargreaves',     name: 'Hargreaves Lansdown',   category: 'investments',  logo: '📈', tags: ['isa', 'sipp', 'pension', 'investments', 'stocks'] },
  { id: 'aj-bell',        name: 'AJ Bell',               category: 'investments',  logo: '📈', tags: ['isa', 'sipp', 'pension', 'investments'] },
  { id: 'fidelity',       name: 'Fidelity',              category: 'investments',  logo: '📈', tags: ['isa', 'sipp', 'pension', 'investments'] },
  { id: 'interactive',    name: 'Interactive Investor',  category: 'investments',  logo: '📈', tags: ['isa', 'sipp', 'stocks', 'investments'] },
  { id: 'trading-212',    name: 'Trading 212',           category: 'investments',  logo: '📈', tags: ['stocks', 'isa', 'investments'] },
  { id: 'nutmeg',         name: 'Nutmeg',                category: 'investments',  logo: '📈', tags: ['isa', 'pension', 'investments'] },
  { id: 'nest',           name: 'NEST Pension',          category: 'investments',  logo: '📈', tags: ['pension', 'workplace pension'], bereavePhone: '0300 020 0090', bereaveUrl: 'https://www.nestpensions.org.uk/schemeweb/nest/about-our-scheme/bereavement.html', bereaveNote: 'NEST bereavement team. Will process death benefit nominations and release funds.', bereaveRequirements: ['Death certificate', 'Beneficiary or next of kin ID', 'NEST membership number', 'Expression of Wishes form if not previously submitted'] },
  { id: 'peoples-pension',name: 'The People\'s Pension', category: 'investments',  logo: '📈', tags: ['pension', 'workplace pension'] },
  { id: 'aviva-pension',  name: 'Aviva Pension',         category: 'investments',  logo: '📈', tags: ['pension', 'annuity'], bereavePhone: '0800 068 5478', bereaveUrl: 'https://www.aviva.co.uk/bereavement/', bereaveNote: 'Aviva bereavement helpline. Handles pensions, annuities, and life insurance.', bereaveRequirements: ['Death certificate', 'Policy number', 'Claimant ID', 'Probate or Letters of Administration if required'] },
  { id: 'legal-general',  name: 'Legal & General',       category: 'investments',  logo: '📈', tags: ['pension', 'isa', 'investments'], bereavePhone: '0370 010 4080', bereaveUrl: 'https://www.legalandgeneral.com/existing-customers/bereavement/', bereaveNote: 'Legal & General bereavement helpline for pensions, ISAs, and life insurance.' },
  { id: 'standard-life',  name: 'Standard Life',         category: 'investments',  logo: '📈', tags: ['pension', 'investments'] },

  // ── Insurance ──────────────────────────────────────────────────────────────
  { id: 'aviva',          name: 'Aviva',                 category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'life', 'travel', 'insurance'], expiryRelevant: true, bereavePhone: '0800 068 5478', bereaveUrl: 'https://www.aviva.co.uk/bereavement/', bereaveNote: 'Aviva bereavement helpline for life insurance, protection, and pension claims.' },
  { id: 'direct-line',    name: 'Direct Line',           category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },
  { id: 'admiral',        name: 'Admiral',               category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },
  { id: 'axa',            name: 'AXA',                   category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'health', 'life', 'insurance'], expiryRelevant: true },
  { id: 'lv',             name: 'LV=',                   category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'life', 'insurance'], expiryRelevant: true },
  { id: 'churchill',      name: 'Churchill',             category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },
  { id: 'hastings',       name: 'Hastings Direct',       category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },
  { id: 'esure',          name: 'Esure',                 category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },
  { id: 'bupa',           name: 'Bupa',                  category: 'insurance',    logo: '🛡️', tags: ['health', 'dental', 'insurance'], expiryRelevant: true },
  { id: 'vitality',       name: 'Vitality',              category: 'insurance',    logo: '🛡️', tags: ['health', 'life', 'insurance'], expiryRelevant: true },
  { id: 'sunlife',        name: 'SunLife',               category: 'insurance',    logo: '🛡️', tags: ['life', 'over 50s', 'insurance'] },
  { id: 'zurich',         name: 'Zurich',                category: 'insurance',    logo: '🛡️', tags: ['life', 'insurance', 'protection'] },
  { id: 'royal-london',   name: 'Royal London',          category: 'insurance',    logo: '🛡️', tags: ['life', 'income protection', 'insurance'], bereavePhone: '0345 605 0098', bereaveUrl: 'https://www.royallondon.com/bereavement/', bereaveNote: 'Royal London bereavement and claims team for life cover and protection policies.', bereaveRequirements: ['Death certificate', 'Policy number', 'Claimant ID', 'Completed claim form (sent by Royal London)'] },
  { id: 'ageas',          name: 'Ageas',                 category: 'insurance',    logo: '🛡️', tags: ['car', 'home', 'insurance'], expiryRelevant: true },

  // ── Energy / Utilities ─────────────────────────────────────────────────────
  { id: 'british-gas',    name: 'British Gas',           category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy', 'boiler cover'] },
  { id: 'octopus',        name: 'Octopus Energy',        category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'eon',            name: 'E.ON',                  category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'edf',            name: 'EDF Energy',            category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'ovo',            name: 'OVO Energy',            category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'scottish-power', name: 'Scottish Power',        category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'bulb',           name: 'Bulb',                  category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'shell-energy',   name: 'Shell Energy',          category: 'utilities',    logo: '⚡', tags: ['gas', 'electricity', 'energy'] },
  { id: 'thames-water',   name: 'Thames Water',          category: 'utilities',    logo: '💧', tags: ['water', 'utilities'] },
  { id: 'severn-trent',   name: 'Severn Trent',          category: 'utilities',    logo: '💧', tags: ['water', 'utilities'] },
  { id: 'united-utilities',name:'United Utilities',      category: 'utilities',    logo: '💧', tags: ['water', 'utilities'] },
  { id: 'anglian-water',  name: 'Anglian Water',         category: 'utilities',    logo: '💧', tags: ['water', 'utilities'] },
  { id: 'yorkshire-water',name: 'Yorkshire Water',       category: 'utilities',    logo: '💧', tags: ['water', 'utilities'] },

  // ── Telecoms & Broadband ───────────────────────────────────────────────────
  { id: 'bt',             name: 'BT',                    category: 'subscriptions',logo: '📦', tags: ['broadband', 'phone', 'tv', 'internet'], expiryRelevant: true },
  { id: 'sky',            name: 'Sky',                   category: 'subscriptions',logo: '📦', tags: ['broadband', 'tv', 'phone', 'internet'], expiryRelevant: true },
  { id: 'virgin-media',   name: 'Virgin Media',          category: 'subscriptions',logo: '📦', tags: ['broadband', 'tv', 'phone', 'internet'], expiryRelevant: true },
  { id: 'talktalk',       name: 'TalkTalk',              category: 'subscriptions',logo: '📦', tags: ['broadband', 'phone', 'internet'], expiryRelevant: true },
  { id: 'ee',             name: 'EE',                    category: 'subscriptions',logo: '📦', tags: ['mobile', 'broadband', 'phone'] },
  { id: 'o2',             name: 'O2',                    category: 'subscriptions',logo: '📦', tags: ['mobile', 'phone'] },
  { id: 'vodafone',       name: 'Vodafone',              category: 'subscriptions',logo: '📦', tags: ['mobile', 'broadband', 'phone'] },
  { id: 'three',          name: 'Three',                 category: 'subscriptions',logo: '📦', tags: ['mobile', 'phone'] },
  { id: 'giffgaff',       name: 'Giffgaff',              category: 'subscriptions',logo: '📦', tags: ['mobile', 'phone'] },

  // ── Streaming & Subscriptions ──────────────────────────────────────────────
  { id: 'netflix',        name: 'Netflix',               category: 'subscriptions',logo: '📦', tags: ['streaming', 'tv', 'entertainment'] },
  { id: 'spotify',        name: 'Spotify',               category: 'subscriptions',logo: '📦', tags: ['music', 'streaming', 'audio'] },
  { id: 'amazon-prime',   name: 'Amazon Prime',          category: 'subscriptions',logo: '📦', tags: ['streaming', 'shopping', 'delivery'] },
  { id: 'disney-plus',    name: 'Disney+',               category: 'subscriptions',logo: '📦', tags: ['streaming', 'tv', 'entertainment'] },
  { id: 'apple-tv',       name: 'Apple TV+',             category: 'subscriptions',logo: '📦', tags: ['streaming', 'tv', 'entertainment'] },
  { id: 'youtube-premium',name: 'YouTube Premium',       category: 'subscriptions',logo: '📦', tags: ['streaming', 'video', 'music'] },
  { id: 'apple-music',    name: 'Apple Music',           category: 'subscriptions',logo: '📦', tags: ['music', 'streaming', 'audio'] },

  // ── Email & Cloud ──────────────────────────────────────────────────────────
  { id: 'gmail',          name: 'Gmail / Google',        category: 'email',        logo: '✉️', tags: ['email', 'google', 'drive', 'photos', 'youtube'] },
  { id: 'outlook',        name: 'Outlook / Microsoft',   category: 'email',        logo: '✉️', tags: ['email', 'microsoft', 'office', 'onedrive'] },
  { id: 'apple-id',       name: 'Apple ID / iCloud',     category: 'email',        logo: '✉️', tags: ['email', 'apple', 'icloud', 'photos', 'iphone'] },
  { id: 'yahoo-mail',     name: 'Yahoo Mail',            category: 'email',        logo: '✉️', tags: ['email'] },
  { id: 'proton-mail',    name: 'Proton Mail',           category: 'email',        logo: '✉️', tags: ['email', 'secure'] },

  // ── Social Media ───────────────────────────────────────────────────────────
  { id: 'facebook',       name: 'Facebook',              category: 'social',       logo: '💬', tags: ['social media', 'meta'] },
  { id: 'instagram',      name: 'Instagram',             category: 'social',       logo: '💬', tags: ['social media', 'photos', 'meta'] },
  { id: 'twitter-x',     name: 'X (Twitter)',            category: 'social',       logo: '💬', tags: ['social media', 'twitter'] },
  { id: 'linkedin',       name: 'LinkedIn',              category: 'social',       logo: '💬', tags: ['social media', 'professional'] },
  { id: 'whatsapp',       name: 'WhatsApp',              category: 'social',       logo: '💬', tags: ['messaging', 'meta'] },
  { id: 'tiktok',         name: 'TikTok',                category: 'social',       logo: '💬', tags: ['social media', 'video'] },
  { id: 'snapchat',       name: 'Snapchat',              category: 'social',       logo: '💬', tags: ['social media', 'messaging'] },

  // ── Government & Official ──────────────────────────────────────────────────
  { id: 'hmrc',           name: 'HMRC',                  category: 'government',   logo: '🏛️', tags: ['tax', 'self assessment', 'government', 'national insurance'] },
  { id: 'gov-gateway',    name: 'Government Gateway',    category: 'government',   logo: '🏛️', tags: ['government', 'online services', 'tax', 'benefits'] },
  { id: 'dvla',           name: 'DVLA',                  category: 'government',   logo: '🏛️', tags: ['driving licence', 'vehicle', 'government'], expiryRelevant: true },
  { id: 'passport',       name: 'UK Passport',           category: 'government',   logo: '🏛️', tags: ['passport', 'identity', 'travel'], expiryRelevant: true },
  { id: 'dwp',            name: 'DWP / Universal Credit',category: 'government',   logo: '🏛️', tags: ['benefits', 'universal credit', 'pension credit', 'government'] },
  { id: 'state-pension',  name: 'State Pension',         category: 'government',   logo: '🏛️', tags: ['pension', 'state pension', 'government', 'national insurance'] },
  { id: 'nhslogin',       name: 'NHS Login',             category: 'medical',      logo: '🏥', tags: ['nhs', 'health', 'medical', 'prescriptions'] },
  { id: 'electoral',      name: 'Electoral Roll',        category: 'government',   logo: '🏛️', tags: ['voting', 'electoral', 'council'] },

  // ── Property ───────────────────────────────────────────────────────────────
  { id: 'rightmove',      name: 'Rightmove',             category: 'property',     logo: '🏠', tags: ['property', 'mortgage', 'estate agent'] },
  { id: 'zoopla',         name: 'Zoopla',                category: 'property',     logo: '🏠', tags: ['property', 'mortgage', 'estate agent'] },
  { id: 'land-registry',  name: 'Land Registry',         category: 'property',     logo: '🏠', tags: ['property', 'deeds', 'ownership'] },
  { id: 'rightmove-portal',name:'Mortgage Account',      category: 'property',     logo: '🏠', tags: ['mortgage', 'property', 'home loan'] },

  // ── Medical ────────────────────────────────────────────────────────────────
  { id: 'gp-surgery',     name: 'GP Surgery',            category: 'medical',      logo: '🏥', tags: ['doctor', 'medical', 'gp', 'health'] },
  { id: 'dentist',        name: 'Dentist',               category: 'medical',      logo: '🏥', tags: ['dental', 'medical', 'health'], expiryRelevant: true },
  { id: 'bupa-health',    name: 'BUPA Health Portal',    category: 'medical',      logo: '🏥', tags: ['health', 'medical', 'insurance'] },

  // ── Legal ──────────────────────────────────────────────────────────────────
  { id: 'solicitor',      name: 'Solicitor / Law Firm',  category: 'legal',        logo: '⚖️', tags: ['solicitor', 'lawyer', 'legal', 'will', 'power of attorney'] },
  { id: 'will',           name: 'Will / Testament',      category: 'legal',        logo: '⚖️', tags: ['will', 'testament', 'solicitor', 'legal'] },
  { id: 'lpa',            name: 'Lasting Power of Attorney', category: 'legal',    logo: '⚖️', tags: ['lpa', 'power of attorney', 'legal'] },
]

// Search function — scores results by relevance
export function searchCompanies(query) {
  if (!query || query.length < 1) return []
  const q = query.toLowerCase().trim()
  
  const scored = UK_COMPANIES.map(company => {
    let score = 0
    const nameLower = company.name.toLowerCase()
    
    // Exact name match
    if (nameLower === q) score += 100
    // Name starts with query
    else if (nameLower.startsWith(q)) score += 80
    // Name contains query
    else if (nameLower.includes(q)) score += 60
    // Tag exact match
    else if (company.tags.some(t => t === q)) score += 70
    // Tag starts with query
    else if (company.tags.some(t => t.startsWith(q))) score += 50
    // Tag contains query
    else if (company.tags.some(t => t.includes(q))) score += 30
    
    return { ...company, score }
  })
  
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}
