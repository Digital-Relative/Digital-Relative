import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// VAPID public key from env
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [supported, setSupported]     = useState(false)
  const [permission, setPermission]   = useState('default')
  const [subscribed, setSubscribed]   = useState(false)
  const [loading, setLoading]         = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(ok)
    if (ok) setPermission(Notification.permission)
  }, [])

  // Check if already subscribed
  useEffect(() => {
    if (!supported || !user) return
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub)
      })
    }).catch(() => {})
  }, [supported, user])

  const subscribe = useCallback(async () => {
    if (!supported || !user || !VAPID_PUBLIC_KEY) return false
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const key  = sub.getKey('p256dh')
      const auth = sub.getKey('auth')
      if (!key || !auth) throw new Error('Missing push keys')

      await supabase.from('push_subscriptions').upsert({
        user_id:  user.id,
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(key))),
        auth:     btoa(String.fromCharCode(...new Uint8Array(auth))),
        active:   true,
      }, { onConflict: 'user_id,endpoint' })

      setPermission('granted')
      setSubscribed(true)
      return true
    } catch (err) {
      if (err.name === 'NotAllowedError') setPermission('denied')
      return false
    } finally {
      setLoading(false)
    }
  }, [supported, user])

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions')
          .update({ active: false })
          .eq('user_id', user.id)
          .eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {} finally { setLoading(false) }
  }, [supported, user])

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}
