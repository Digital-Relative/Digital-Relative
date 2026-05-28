import { useState } from 'react'
import SEO from '../components/SEO'

const ARTICLES = [
  {
    id: 'first-week',
    title: 'What to do in the first week after a bereavement',
    date: '15 May 2025',
    readTime: '8 min read',
    excerpt: 'The days immediately after losing someone are overwhelming. Here is a practical guide to what needs to happen in the first week - and what can wait.',
    content: [
      { heading: 'Day 1-2: The immediate essentials', body: 'The first priority is obtaining the Medical Certificate of Cause of Death from the doctor or hospital. You cannot register the death without this. Once you have it, you have five days (in England and Wales) to register the death at the local registry office. You will receive the death certificate - order at least five copies, as institutions will not accept photocopies.' },
      { heading: 'Tell Me Once', body: 'Once registered, use the Government\'s Tell Me Once service at gov.uk/tell-us-once. A single appointment notifies HMRC, DWP, DVLA, the passport office, and your local council simultaneously. It takes about 20 minutes and saves hours of individual phone calls.' },
      { heading: 'Notify the employer and bank', body: 'If the deceased was employed, contact their employer as soon as possible. There may be a death in service benefit, a final salary payment, or a workplace pension. For banking, most major banks are part of the Death Notification Service (deathnotificationservice.co.uk), which lets you notify multiple banks at once.' },
      { heading: 'What can wait', body: 'Not everything needs to happen in week one. Subscriptions, loyalty accounts, social media, and secondary financial accounts can all wait until you are ready. Be gentle with yourself. The admin will still be there.' },
    ],
  },
  {
    id: 'digital-accounts',
    title: 'The hidden problem of digital accounts after death',
    date: '22 April 2025',
    readTime: '6 min read',
    excerpt: 'The average person now has over 90 online accounts. Most families have no idea they exist. Here is what happens to digital accounts when someone dies - and how to prepare.',
    content: [
      { heading: 'The scale of the problem', body: 'Research by digital estate planning services suggests the average person has between 70 and 100 online accounts by middle age. Email, banking, streaming, shopping, utilities, social media, cloud storage. When someone dies, these accounts do not automatically close. Many continue charging. Most families never find them.' },
      { heading: 'What platforms do when you die', body: 'Each platform has its own policy. Facebook and Instagram have "memorialisation" options. Google has an Inactive Account Manager. Apple iCloud data can be permanently lost. Most streaming services simply terminate the account on the next billing failure. Bank accounts freeze, but the money remains until the estate is settled - which can take months.' },
      { heading: 'The practical impact', body: 'Families report spending an average of over 400 hours on estate administration. A significant portion of that time is simply discovering what accounts existed. Without a record, executors are reduced to searching email inboxes for receipts, checking bank statements for recurring payments, and calling institutions with no information to hand.' },
      { heading: 'How to prepare', body: 'A digital legacy vault - like Digital Relative - solves this by giving you one place to store account details, with controlled access for your beneficiaries. Even a simple spreadsheet, kept somewhere your executor can find it, is vastly better than nothing. The key is making sure someone trusted knows it exists.' },
    ],
  },
  {
    id: 'executor-guide',
    title: 'A plain-English guide to being an executor',
    date: '10 March 2025',
    readTime: '10 min read',
    excerpt: 'Being named as an executor is an honour - and a significant responsibility. Here is what it actually involves, step by step.',
    content: [
      { heading: 'What does an executor actually do?', body: 'An executor is the person responsible for carrying out the instructions in a will. This includes registering the death, obtaining probate (if required), collecting and valuing assets, paying any debts, filing the deceased\'s final tax return, and distributing what remains to the beneficiaries. It is typically a 12-24 month process.' },
      { heading: 'Do you need probate?', body: 'Not always. If the estate is under approximately £5,000, if all assets were held jointly, or if there is no property, probate may not be required. Banks have different thresholds - some will release up to £50,000 without probate. A solicitor can advise whether your situation requires it.' },
      { heading: 'The probate timeline', body: 'Applying for a Grant of Probate typically takes 4-12 weeks from the date of application. Before applying, you must complete inheritance tax forms (even if no tax is owed) and submit them to HMRC. The process has become significantly slower since 2020, so patience is essential.' },
      { heading: 'Looking after yourself', body: 'Executor duties often fall to the person closest to the deceased - which means you are managing complex administration while grieving. It is entirely reasonable to appoint a professional executor, or to instruct a solicitor to handle the probate process on your behalf. The estate pays the cost.' },
    ],
  },
  {
    id: 'funeral-planning',
    title: 'Pre-planning your funeral: what it means and why it matters',
    date: '1 February 2025',
    readTime: '7 min read',
    excerpt: 'Funeral planning is not morbid - it is one of the kindest things you can do for the people who will be left behind. Here is what to consider.',
    content: [
      { heading: 'Why plan ahead?', body: 'In the immediate aftermath of a death, families face a decision they are least equipped to make: arranging a funeral within days, often without knowing what the person wanted. Funeral costs in the UK average over £4,000. Making your wishes known in advance - however informally - removes an enormous burden.' },
      { heading: 'Burial vs cremation', body: 'Burial is generally more expensive and requires an ongoing commitment to a plot. Cremation is chosen by the majority of families in the UK, and ashes can be kept, scattered, or interred according to your wishes. Both options have environmental variations - natural burials and water cremation (aquamation) are increasingly available.' },
      { heading: 'What to record', body: 'Even brief notes help enormously. Type of service (religious or secular), music you would like played, readings or poems, any specific people you would like to speak, where you would like any service held, and whether you have preferences about flowers or donations in lieu. Recording this in your Digital Relative After I\'m Gone guide means your beneficiaries will see it when they need it.' },
      { heading: 'Funeral payment plans', body: 'Funeral plans, purchased in advance, lock in today\'s prices and can significantly reduce the cost and stress for your family. The funeral industry is regulated by the FCA since 2022, which gives consumers greater protection. Always check a provider is FCA-authorised before purchasing.' },
    ],
  },
]

function ArticleView({ article, onBack }) {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    author: { '@type': 'Organization', name: 'Digital Relative' },
    publisher: {
      '@type': 'Organization',
      name: 'Digital Relative',
      logo: { '@type': 'ImageObject', url: 'https://digitalrelative.co.uk/brand/logo.svg' },
    },
    mainEntityOfPage: `https://digitalrelative.co.uk/blog/${article.id}`,
    inLanguage: 'en-GB',
  }
  return (
    <div>
      <SEO
        title={`${article.title} — Digital Relative`}
        description={article.excerpt}
        path={`/blog/${article.id}`}
        ogType="article"
        jsonLd={articleJsonLd}
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/blog' },
          { name: article.title, path: `/blog/${article.id}` },
        ]}
      />
      <button onClick={onBack} className="btn-ghost" style={{ marginBottom: 20, fontSize: 13 }}>
        ← Back to blog
      </button>
      <div className="fade-up page-header">
        <h1 className="page-title" style={{ fontSize: 28, lineHeight: 1.3 }}>{article.title}</h1>
        <p className="page-sub">{article.date} · {article.readTime}</p>
      </div>
      <div className="fade-up-2 card-static">
        <p style={{ fontSize: 15, color: 'var(--cream-dim)', lineHeight: 1.9, marginBottom: 24, fontStyle: 'italic' }}>
          {article.excerpt}
        </p>
        {article.content.map((section, i) => (
          <div key={i} style={{ marginBottom: 24 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 10 }}>{section.heading}</h3>
            <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.9 }}>{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BlogPage({ initialArticleId }) {
  const initial = initialArticleId ? ARTICLES.find(a => a.id === initialArticleId) : null
  const [activeArticle, setActiveArticle] = useState(initial || null)

  if (activeArticle) {
    return <ArticleView article={activeArticle} onBack={() => {
      setActiveArticle(null)
      if (window.location.pathname.startsWith('/blog/')) {
        window.history.pushState({}, '', '/blog')
      }
    }} />
  }

  const blogListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Digital Relative Resources',
    description: 'Practical guides for life admin, estate planning, and digital legacy in the UK.',
    url: 'https://digitalrelative.co.uk/blog',
    inLanguage: 'en-GB',
    publisher: { '@type': 'Organization', name: 'Digital Relative' },
    blogPost: ARTICLES.map(a => ({
      '@type': 'BlogPosting',
      headline: a.title,
      datePublished: a.date,
      url: `https://digitalrelative.co.uk/blog/${a.id}`,
      description: a.excerpt,
    })),
  }

  return (
    <div>
      <SEO
        title="Resources — Practical Guides for UK Estate Planning & Digital Legacy | Digital Relative"
        description="Practical guides for life admin and estate planning in the UK: what to do after a bereavement, digital accounts after death, being an executor, funeral planning, and more."
        path="/blog"
        jsonLd={blogListJsonLd}
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/blog' },
        ]}
      />
      <div className="fade-up page-header">
        <h1 className="page-title">Resources</h1>
        <p className="page-sub">Practical guides for life admin and estate planning</p>
      </div>

      <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ARTICLES.map(article => (
          <a
            key={article.id}
            href={`/blog/${article.id}`}
            className="card-static"
            style={{ cursor: 'pointer', display: 'block', textDecoration: 'none', color: 'inherit' }}
            onClick={(e) => {
              // Intra-app: don't full-page-load, just open the article view.
              e.preventDefault()
              setActiveArticle(article)
              window.history.pushState({}, '', `/blog/${article.id}`)
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8 }}>
              {article.date} · {article.readTime}
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--cream)', marginBottom: 8, lineHeight: 1.4 }}>
              {article.title}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, marginBottom: 12 }}>
              {article.excerpt}
            </p>
            <span style={{ fontSize: 13, color: 'var(--gold)' }}>Read more →</span>
          </a>
        ))}
      </div>
    </div>
  )
}
