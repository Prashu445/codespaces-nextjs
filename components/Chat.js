'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { encryptMessage, decryptMessage } from '../lib/crypto'

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
  }, [isKeySet]) // Re-fetch if key changes to try decrypting again

// 2. Realtime Subscription (Fixed)
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        // Decrypt new messages
        const decryptedContent = isKeySet 
          ? await decryptMessage(payload.new.content, passphrase) 
          : '🔒 Locked';
        
        const newMsg = { ...payload.new, content: decryptedContent };
        setMessages((prev) => [...prev, newMsg]);
        
        // Notification logic
        if (payload.new.sender_id !== session.user.id) {
          if (document.hidden && Notification.permission === "granted") {
            new Notification("New Message", { body: "She sent something..." });
          }
          markAsRead(payload.new.id);
        }
        scrollToBottom();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
        // FIX: Decrypt the content again when an update (like "Seen") happens
        const decryptedContent = isKeySet 
          ? await decryptMessage(payload.new.content, passphrase) 
          : '🔒 Locked';
          
        const updatedMsg = { ...payload.new, content: decryptedContent };
        
        setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? updatedMsg : msg));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [passphrase, isKeySet]);