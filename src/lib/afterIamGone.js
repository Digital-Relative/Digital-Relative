// After I'm Gone — default guide steps
// Pre-filled with the standard UK death admin process
// Owners can edit/remove/reorder these before they apply to them

export const DEFAULT_GUIDE_SECTIONS = [
  {
    id: 'immediate',
    title: 'In the first few days',
    icon: '📋',
    steps: [
      {
        id: 'death-cert',
        title: 'Get the death certificate',
        detail: 'The doctor or coroner will issue a Medical Certificate of Cause of Death. Take this to the Register Office within 5 days (8 days in Scotland) to get the official death certificate. Request at least 10 certified copies - you will need them for banks, insurers, and government.',
        required: true,
        editable: true,
      },
      {
        id: 'tell-us-once',
        title: 'Use Tell Us Once',
        detail: 'The UK government\'s Tell Us Once service notifies multiple government departments in a single step. Visit gov.uk/after-a-death or call 0800 085 7308. This covers HMRC, DWP, DVLA, passport office, and your local council simultaneously.',
        required: true,
        editable: true,
        link: 'https://www.gov.uk/after-a-death/organisations-you-need-to-contact-and-tell-us-once',
      },
      {
        id: 'find-will',
        title: 'Locate the will',
        detail: 'Check this vault for details of where the will is stored. If held by a solicitor, contact them directly. You can also search the National Will Register at gov.uk/search-will-probate.',
        required: true,
        editable: true,
      },
      {
        id: 'probate',
        title: 'Apply for probate (if needed)',
        detail: 'If the estate is over £5,000, you will likely need a Grant of Probate before banks will release funds. Apply at gov.uk/applying-for-probate or use a solicitor. This typically takes 4–8 weeks.',
        required: false,
        editable: true,
        link: 'https://www.gov.uk/applying-for-probate',
      },
    ],
  },
  {
    id: 'digital-accounts',
    title: 'Digital accounts',
    icon: '💻',
    steps: [
      {
        id: 'google-account',
        title: 'Google account (Gmail, Drive, Photos, YouTube)',
        detail: 'Google\'s Inactive Account Manager may have already granted access if it was set up. Otherwise, next of kin can submit a request at google.com/account/about/. You will need a death certificate and proof of relationship. Google may allow download of data or deletion of the account.',
        required: false,
        editable: true,
        link: 'https://support.google.com/accounts/troubleshooter/6357590',
      },
      {
        id: 'microsoft-account',
        title: 'Microsoft account (Outlook, OneDrive, Xbox)',
        detail: 'Microsoft\'s Next of Kin process allows family to request access or closure. Go to Microsoft\'s Next of Kin request page and provide a death certificate. Note: Microsoft does not transfer account access but may allow data download.',
        required: false,
        editable: true,
        link: 'https://support.microsoft.com/en-gb/topic/microsoft-account-closure-request-by-next-of-kin-8c7f3b37-f014-5ce5-7a70-26e5c8be7cd0',
      },
      {
        id: 'apple-account',
        title: 'Apple ID / iCloud',
        detail: 'Apple\'s Digital Legacy feature allows nominated people to request access using an Access Key plus the death certificate at apple.com/legal/privacy/. If Digital Legacy was not set up, Apple will not grant account access - data may be unrecoverable.',
        required: false,
        editable: true,
        link: 'https://support.apple.com/en-gb/HT212360',
      },
      {
        id: 'facebook',
        title: 'Facebook / Instagram',
        detail: 'Facebook allows memorialisation (the profile remains as a tribute) or full removal. Submit a request at facebook.com/help/contact/228813257197480 with a death certificate. Instagram has a similar process. A nominated Legacy Contact can manage the memorialised account.',
        required: false,
        editable: true,
        link: 'https://www.facebook.com/help/1568013990080948',
      },
      {
        id: 'passwords',
        title: 'All other accounts',
        detail: 'Use this vault to access the login details for all other accounts. For each account: log in, cancel any subscriptions, download any important data, then close or delete the account. Prioritise paid subscriptions first to avoid continued charges.',
        required: true,
        editable: true,
      },
    ],
  },
  {
    id: 'financial',
    title: 'Financial accounts',
    icon: '🏦',
    steps: [
      {
        id: 'banks',
        title: 'Notify banks and building societies',
        detail: 'Contact each bank listed in this vault with a death certificate and Grant of Probate (if applicable). Joint accounts usually continue automatically. Sole accounts will be frozen until probate is granted. Ask about bereavement teams - most major banks have dedicated support lines.',
        required: true,
        editable: true,
      },
      {
        id: 'pensions',
        title: 'Claim pension and death benefits',
        detail: 'Contact each pension provider listed in this vault. Workplace pensions often include a death-in-service lump sum - contact the employer\'s HR department. State pension stops on death and overpayments must be returned to DWP.',
        required: true,
        editable: true,
      },
      {
        id: 'investments',
        title: 'Investment accounts and ISAs',
        detail: 'Contact each investment provider in this vault. ISAs can be passed to a spouse as an "inherited ISA" - ask specifically about this option to avoid losing the tax benefit. Other investments require Grant of Probate to transfer.',
        required: true,
        editable: true,
      },
      {
        id: 'insurance-claims',
        title: 'Make insurance claims',
        detail: 'Check this vault for life insurance, mortgage protection, and any payment protection policies. Contact each provider promptly - most have a time limit for claims. Have the death certificate, policy number, and Grant of Probate ready.',
        required: true,
        editable: true,
      },
      {
        id: 'bereavement-register',
        title: 'Stop junk mail - The Bereavement Register',
        detail: 'Register at thebereavementregister.org.uk to stop marketing mail addressed to the deceased. This is free and helps prevent distressing reminders arriving through the post.',
        required: false,
        editable: true,
        link: 'https://www.thebereavementregister.org.uk',
      },
    ],
  },
  {
    id: 'property',
    title: 'Property and home',
    icon: '🏠',
    steps: [
      {
        id: 'mortgage',
        title: 'Notify mortgage lender',
        detail: 'Contact the mortgage lender listed in this vault. If there was mortgage life insurance, make a claim immediately. The lender will advise on next steps - they cannot repossess immediately and must work with executors.',
        required: false,
        editable: true,
      },
      {
        id: 'council',
        title: 'Notify the council',
        detail: 'Tell Us Once (Step 1) will notify your local council. However, also contact them directly about: council tax (single person discount may apply), housing benefit if relevant, and whether the property is rented from the council.',
        required: true,
        editable: true,
      },
      {
        id: 'utilities-notify',
        title: 'Transfer or close utility accounts',
        detail: 'Contact each utility provider in this vault. Energy, water, broadband, and phone accounts should be transferred to the surviving person or closed. Most providers have bereavement teams and will waive early termination fees.',
        required: true,
        editable: true,
      },
      {
        id: 'contents-insurance',
        title: 'Review home and contents insurance',
        detail: 'Check whether existing home insurance remains valid. Some policies become void on death of the policyholder. Contact the insurer to transfer or arrange new cover promptly.',
        required: false,
        editable: true,
      },
    ],
  },
  {
    id: 'practical',
    title: 'Practical tasks',
    icon: '✅',
    steps: [
      {
        id: 'driving-licence',
        title: 'Return driving licence to DVLA',
        detail: 'Send the driving licence to DVLA, Swansea, SA99 1AB with a letter explaining the holder has died. Tell Us Once handles this automatically if used. Cancel any vehicle tax and notify the insurer.',
        required: false,
        editable: true,
      },
      {
        id: 'passport',
        title: 'Cancel the passport',
        detail: 'Send the passport to HM Passport Office, PO Box 767, Southport, PR8 9PW with a letter and death certificate. Ask them to cancel and return it to you marked "cancelled" for your records.',
        required: false,
        editable: true,
      },
      {
        id: 'subscriptions',
        title: 'Cancel subscriptions',
        detail: 'Use this vault to identify all active subscriptions. Cancel promptly to avoid continued charges. Most streaming, software, and membership subscriptions can be cancelled online. Check bank statements for any recurring payments not listed here.',
        required: true,
        editable: true,
      },
      {
        id: 'loyalty-points',
        title: 'Claim loyalty points and cashback',
        detail: 'Check for Nectar, Tesco Clubcard, Avios, and other loyalty accounts. Many schemes allow transfer to next of kin - contact each scheme directly. Some have significant value and a time limit for claiming after death.',
        required: false,
        editable: true,
      },
    ],
  },
  {
    id: 'emotional',
    title: 'Support for you',
    icon: '💛',
    steps: [
      {
        id: 'cruse',
        title: 'Bereavement support',
        detail: 'Cruse Bereavement Support offers free, confidential help. Call 0808 808 1677 or visit cruse.org.uk. You do not need to do everything at once - take your time and ask for help.',
        required: false,
        editable: true,
        link: 'https://www.cruse.org.uk',
      },
      {
        id: 'citizens-advice',
        title: 'Get practical help',
        detail: 'Citizens Advice offers free guidance on probate, benefits, debts, and housing after a bereavement. Visit citizensadvice.org.uk or call 0800 144 8848.',
        required: false,
        editable: true,
        link: 'https://www.citizensadvice.org.uk',
      },
    ],
  },
]

// Categories of guide sections for navigation
export const GUIDE_SECTION_IDS = DEFAULT_GUIDE_SECTIONS.map(s => s.id)
