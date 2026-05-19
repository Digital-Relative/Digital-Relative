import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { encryptEntry, decryptEntry } from '../lib/crypto'
import { useAuth } from '../context/AuthContext'

export function useVault() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchEntries = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Decrypt each entry
      const decrypted = await Promise.all((data || []).map(decryptEntry))
      setEntries(decrypted)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function addEntry(entry) {
    const encrypted = await encryptEntry({ ...entry, user_id: user.id })
    const { data, error } = await supabase
      .from('vault_entries')
      .insert([encrypted])
      .select()
      .single()
    if (error) throw error
    const decrypted = await decryptEntry(data)
    setEntries(prev => [decrypted, ...prev])
    return decrypted
  }

  async function updateEntry(id, updates) {
    const encrypted = await encryptEntry(updates)
    const { data, error } = await supabase
      .from('vault_entries')
      .update(encrypted)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    const decrypted = await decryptEntry(data)
    setEntries(prev => prev.map(e => e.id === id ? decrypted : e))
    return decrypted
  }

  async function deleteEntry(id) {
    const { error } = await supabase
      .from('vault_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function uploadFile(entryId, file) {
    const path = `${user.id}/${entryId}/${file.name}`
    const { error } = await supabase.storage
      .from('vault-files')
      .upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  return { entries, loading, error, addEntry, updateEntry, deleteEntry, uploadFile, refresh: fetchEntries }
}
