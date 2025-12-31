import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) alert(error.message)
    else alert('Check your email for the magic link!')
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-gray-200">
      <div className="w-full max-w-xs p-8 space-y-4 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl">
        <h1 className="text-2xl font-light text-center tracking-widest text-emerald-400">ENCRYPTED</h1>
        <p className="text-xs text-center text-gray-500">Only for Us.</p>
        <input
          className="w-full px-4 py-3 bg-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm placeholder-gray-600 transition"
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors text-white disabled:opacity-50"
        >
          {loading ? 'Sending Magic Link...' : 'Enter'}
        </button>
      </div>
    </div>
  )
}