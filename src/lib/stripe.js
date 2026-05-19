import { loadStripe } from '@stripe/stripe-js'

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
export const stripePromise = loadStripe(key || 'pk_test_demo')

// Price IDs — replace with your real Stripe price IDs after creating products
export const PRICES = {
  single_annual:  'price_single_annual_GBP_1800',   // £18/yr
  couples_monthly:'price_couples_monthly_GBP_500',  // £5/mo
  couples_annual: 'price_couples_annual_GBP_4500',  // £45/yr
}

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: '£0',
    period: '',
    entryLimit: 5,
    beneficiaryLimit: 1,
    storageGB: 0,
    deadMansSwitch: false,
    fileUploads: false,
  },
  single: {
    id: 'single',
    name: 'Single',
    price: '£18',
    period: '/year',
    saving: 'Save 25% vs monthly',
    entryLimit: Infinity,
    beneficiaryLimit: 3,
    storageGB: 1,
    deadMansSwitch: true,
    fileUploads: true,
    priceId: PRICES.single_annual,
  },
  couples: {
    id: 'couples',
    name: 'Couples',
    price: '£5',
    period: '/month',
    annualPrice: '£45/year',
    entryLimit: Infinity,
    beneficiaryLimit: 5,
    storageGB: 5,
    deadMansSwitch: true,
    fileUploads: true,
    vaults: 2,
    priceId: PRICES.couples_monthly,
    annualPriceId: PRICES.couples_annual,
  },
}
