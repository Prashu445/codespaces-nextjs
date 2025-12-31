// Final Fix Vercel
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { decryptMessage, encryptMessage } from '../lib/crypto'

export default function Chat({ session }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [passphrase, setPassphrase] = useState('') 
  const [isKeySet, setIsKeySet] = useState(false)
  const bottomRef = useRef(null)

  // 1. Initial Load & Permission
  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    fetchMessages();
  }, [isKeySet]) 

  // 2. Realtime Subscription (Fixed for "Seen" status)
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const decryptedContent = isKeySet 
          ? await decryptMessage(payload.new.content, passphrase) 
          : '🔒 Locked';
        
        const newMsg = { ...payload.new, content: decryptedContent };
        setMessages((prev) => [...prev, newMsg]);
        
        // Notification Logic
        if (payload.new.sender_id !== session.user.id) {
          if (document.hidden && Notification.permission === "granted") {
            new Notification("New Message", { body: "She sent something..." });
          }
          markAsRead(payload.new.id);
        }
        scrollToBottom();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
        // FIX: Keep message decrypted when status changes to "Seen"
        const decryptedContent = isKeySet 
          ? await decryptMessage(payload.new.content, passphrase) 
          : '🔒 Locked';
          
        const updatedMsg = { ...payload.new, content: decryptedContent };
        setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? updatedMsg : msg));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [passphrase, isKeySet]);

  const fetchMessages = async () => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (data) {
      const decrypted = await Promise.all(data.map(async (m) => {
        return { 
          ...m, 
          content: isKeySet ? await decryptMessage(m.content, passphrase) : '🔒 Locked (Set Key)' 
        };
      }));
      setMessages(decrypted);
      
      decrypted.forEach(msg => {
        if (msg.sender_id !== session.user.id && !msg.is_read) markAsRead(msg.id);
      });
      scrollToBottom();
    }
  }

  const markAsRead = async (msgId) => {
    await supabase.from('messages').update({ is_read: true }).eq('id', msgId);
  }

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const encrypted = await encryptMessage(newMessage, passphrase);
    await supabase.from('messages').insert({ 
      content: encrypted, 
      sender_id: session.user.id 
    });
    setNewMessage('');
  }

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Passphrase Screen
  if (!isKeySet) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <form onSubmit={(e) => { e.preventDefault(); setIsKeySet(true); }} className="space-y-4 text-center">
          <h2 className="text-xl font-light">Enter Secret Passphrase</h2>
          <input 
             type="password" 
             value={passphrase}
             onChange={(e) => setPassphrase(e.target.value)}
             className="bg-gray-800 p-2 rounded border border-gray-700 text-center"
             placeholder="Shared Secret"
          />
          <button type="submit" className="block w-full bg-emerald-600 p-2 rounded">Unlock Chat</button>
        </form>
      </div>
    );
  }

  // Main Chat Screen
  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur">
        <span className="text-emerald-400 font-bold tracking-widest text-xs uppercase">Secret Link</span>
        <div className="text-xs text-gray-500">Connected</div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.user.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${
                isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-200 rounded-bl-none'
              }`}>
                {msg.content}
              </div>
              {/* Seen Status */}
              {isMe && (
                <span className="text-[10px] text-gray-600 mt-1 mr-1">
                  {msg.is_read ? 'Seen' : 'Delivered'}
                </span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2">
        <input
          className="flex-1 bg-black border border-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a secret message..."
        />
        <button type="submit" className="bg-emerald-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-emerald-500 transition">
          ➤
        </button>
      </form>
    </div>
  )
}