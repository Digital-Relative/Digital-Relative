import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useBeneficiaries() {
  const { user } = useAuth()
  const [beneficiaries, setBeneficiaries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (!error) setBeneficiaries(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function addBeneficiary(ben) {
    const { data, error } = await supabase
      .from('beneficiaries')
      .insert([{ ...ben, user_id: user.id, status: 'invited' }])
      .select()
      .single()
    if (error) throw error
    setBeneficiaries(prev => [...prev, data])
    // Send invite email and notify vault owner via edge function
    supabase.functions.invoke('send-beneficiary-invite', {
      body: { beneficiaryId: data.id, action: 'send_initial_invite' },
    }).catch(() => {}) // best-effort - never block the UI
    return data
  }

  async function removeBeneficiary(id) {
    const { error } = await supabase
      .from('beneficiaries')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    setBeneficiaries(prev => prev.filter(b => b.id !== id))
  }

  async function updateBeneficiary(id, updates) {
    const { data, error } = await supabase
      .from('beneficiaries')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    setBeneficiaries(prev => prev.map(b => b.id === id ? data : b))
    return data
  }

  return { beneficiaries, loading, addBeneficiary, removeBeneficiary, updateBeneficiary, refresh: fetch }
}
