'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { decryptMessage, encryptMessage } from '../lib/crypto'

export default function Chat({ session }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [passphrase, setPassphrase] = useState('') 
  const [isKeySet, setIsKeySet] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  // 1. Initial Load
  useEffect(() => {
    if (Notification.permission !== "granted") Notification.requestPermission();
    fetchMessages();
  }, [isKeySet]) 

  // 2. Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const decryptedContent = isKeySet 
          ? await decryptMessage(payload.new.content, passphrase) 
          : '🔒 Locked';
        
        const newMsg = { ...payload.new, content: decryptedContent };
        setMessages((prev) => [...prev, newMsg]);
        
        if (payload.new.sender_id !== session.user.id) {
          markAsRead(payload.new.id);
        }
        scrollToBottom();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
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
          content: isKeySet ? await decryptMessage(m.content, passphrase) : '🔒 Locked' 
        };
      }));
      setMessages(decrypted);
      scrollToBottom();
    }
  }

  const markAsRead = async (msgId) => {
    await supabase.from('messages').update({ is_read: true }).eq('id', msgId);
  }

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    await sendEncryptedMessage(newMessage);
    setNewMessage('');
  }

  const sendEncryptedMessage = async (text) => {
    const encrypted = await encryptMessage(text, passphrase);
    await supabase.from('messages').insert({ 
      content: encrypted, 
      sender_id: session.user.id 
    });
  }

  // --- NEW: Image Upload Logic ---
  const handleFileUpload = async (e) => {
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data } = supabase.storage.from('images').getPublicUrl(filePath);
      
      // 3. Send URL as a message with a special prefix
      const imageMessage = `[IMG]${data.publicUrl}`;
      await sendEncryptedMessage(imageMessage);

    } catch (error) {
      alert('Error uploading image!');
      console.error(error);
    } finally {
      setUploading(false);
    }
  }

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Helper to render Text OR Image
  const renderContent = (content) => {
    if (content.startsWith('[IMG]')) {
      const url = content.replace('[IMG]', '');
      return (
        <img 
          src={url} 
          alt="Shared photo" 
          className="rounded-lg max-w-full max-h-60 border-2 border-emerald-500/50"
          loading="lazy"
        />
      );
    }
    return content;
  }

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
          />
          <button type="submit" className="block w-full bg-emerald-600 p-2 rounded">Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur">
        <span className="text-emerald-400 font-bold tracking-widest text-xs uppercase">Secret Link</span>
        <div className="text-xs text-gray-500">Encrypted</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.user.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-200 rounded-bl-none'
              }`}>
                {renderContent(msg.content)}
              </div>
              {isMe && <span className="text-[10px] text-gray-600 mt-1 mr-1">{msg.is_read ? 'Seen' : 'Sent'}</span>}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2 items-center">
        {/* Hidden File Input */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          className="hidden" 
        />
        
        {/* Paperclip Button */}
        <button 
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current.click()}
          className="text-gray-400 hover:text-white p-2 transition"
        >
          {uploading ? '⏳' : '📎'}
        </button>

        <input
          className="flex-1 bg-black border border-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit" className="bg-emerald-600 text-white rounded-full w-10 h-10 flex items-center justify-center">
          ➤
        </button>
      </form>
    </div>
  )
}