import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function usePartner() {
  const { user } = useAuth()
  const [link, setLink]       = useState(null)   // active partner link
  const [partner, setPartner] = useState(null)   // partner profile
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('partner_links')
      .select('*, requester:requester_id(id, full_name, plan), partner:partner_id(id, full_name, plan)')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setLink(data)
      setPartner(data.requester_id === user.id ? data.partner : data.requester)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function sendInvite(email) {
    // Find if user exists
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', (await supabase.auth.admin?.getUserByEmail?.(email))?.data?.user?.id)
      .single()

    // Create the link request
    const { data, error } = await supabase
      .from('partner_links')
      .insert([{ requester_id: user.id, partner_id: profileData?.id || user.id }])
      .select()
      .single()
    if (error) throw error

    // Notification will be sent via edge function / email
    return data
  }

  async function acceptLink(linkId) {
    // Goes through the couples-accept edge function (service role) so it can
    // set couples_payer_id, upgrade the partner's plan, and refund their
    // existing Single sub if any. Direct partner_links.update only handles
    // status — partner would then be left on free/single and get bounced to
    // Stripe again as if they needed to pay.
    const { data, error } = await supabase.functions.invoke('couples-accept', {
      body: { linkId },
    })
    if (error) throw new Error(error.message || 'Could not accept invite')
    if (data?.error) throw new Error(data.error)
    await fetch()
    return data
  }

  async function declineLink(linkId) {
    const { error } = await supabase
      .from('partner_links')
      .update({ status: 'declined' })
      .eq('id', linkId)
    if (error) throw error
    setLink(null)
    setPartner(null)
  }

  async function unlink(linkId) {
    const { error } = await supabase
      .from('partner_links')
      .update({ status: 'unlinked' })
      .eq('id', linkId)
    if (error) throw error
    setLink(null)
    setPartner(null)
  }

  return { link, partner, loading, sendInvite, acceptLink, declineLink, unlink, refresh: fetch }
}
