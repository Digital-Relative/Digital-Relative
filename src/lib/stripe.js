import { loadStripe } from '@stripe/stripe-js'

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
export const stripePromise = loadStripe(key || '')

export const PRICES = {
  single_annual:   'price_1TYuBBAT0bYW1W6mK3STHKbN',
  couples_monthly: 'price_1TYuBOAT0bYW1W6mOOnhSy11',
  couples_annual:  'price_1TYuBcAT0bYW1W6mD5OGw2Mm',
}

export const PLANS = {
  free: {
    id: 'free', name: 'Free', price: '£0', period: '',
    entryLimit: 5, beneficiaryLimit: 1, storageGB: 0,
    deadMansSwitch: false, fileUploads: false,
  },
  single: {
    id: 'single', name: 'Single', price: '£18', period: '/year',
    saving: 'Save 25% vs monthly',
    entryLimit: Infinity, beneficiaryLimit: 3, storageGB: 1,
    deadMansSwitch: true, fileUploads: true,
    priceId: PRICES.single_annual,
  },
  couples: {
    id: 'couples', name: 'Couples', price: '£5', period: '/month',
    annualPrice: '£45/year',
    entryLimit: Infinity, beneficiaryLimit: 5, storageGB: 5,
    deadMansSwitch: true, fileUploads: true, vaults: 2,
    priceId: PRICES.couples_monthly,
    annualPriceId: PRICES.couples_annual,
  },
}
