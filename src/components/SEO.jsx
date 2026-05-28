import { useEffect } from 'react'

const SITE_URL = 'https://digitalrelative.co.uk'
const DEFAULT_OG_IMAGE = `${SITE_URL}/brand/og-image.png`

function setMeta(selector, attr, value) {
  if (!value) return
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    const [, name] = selector.match(/\[(?:name|property)="([^"]+)"\]/) || []
    const isProperty = /^og:|^article:|^fb:/.test(name || '')
    el.setAttribute(isProperty ? 'property' : 'name', name)
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

function setCanonical(href) {
  if (!href) return
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function setJsonLd(id, data) {
  let el = document.head.querySelector(`script[type="application/ld+json"][data-seo="${id}"]`)
  if (!data) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-seo', id)
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/**
 * Per-route SEO head updater.
 *
 * Usage:
 *   <SEO
 *     title="About — Digital Relative"
 *     description="..."
 *     path="/about"
 *     jsonLd={{ "@context": "https://schema.org", "@type": "AboutPage", ... }}
 *   />
 */
export default function SEO({
  title,
  description,
  path,
  image,
  imageAlt,
  ogType = 'website',
  noindex = false,
  jsonLd,
  breadcrumbs,
}) {
  const url = path ? `${SITE_URL}${path}` : SITE_URL + '/'
  const ogImage = image || DEFAULT_OG_IMAGE

  useEffect(() => {
    if (title) document.title = title

    setMeta('meta[name="description"]', 'content', description)
    setCanonical(url)

    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', description)
    setMeta('meta[property="og:url"]', 'content', url)
    setMeta('meta[property="og:type"]', 'content', ogType)
    setMeta('meta[property="og:image"]', 'content', ogImage)
    setMeta('meta[property="og:image:alt"]', 'content', imageAlt || title)

    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', description)
    setMeta('meta[name="twitter:image"]', 'content', ogImage)
    setMeta('meta[name="twitter:image:alt"]', 'content', imageAlt || title)

    setMeta(
      'meta[name="robots"]',
      'content',
      noindex
        ? 'noindex, nofollow'
        : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    )

    setJsonLd('page', jsonLd)

    if (breadcrumbs && breadcrumbs.length) {
      setJsonLd('breadcrumbs', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: b.path ? `${SITE_URL}${b.path}` : undefined,
        })),
      })
    } else {
      setJsonLd('breadcrumbs', null)
    }
  }, [title, description, url, ogImage, imageAlt, ogType, noindex, JSON.stringify(jsonLd), JSON.stringify(breadcrumbs)])

  return null
}
