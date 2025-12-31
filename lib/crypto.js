// Convert passphrase to a Key
const getKey = async (passphrase, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
};

export const encryptMessage = async (text, passphrase) => {
  const salt = "our-special-salt"; // In prod, random salt is better, but this works for 2 people
  const key = await getKey(passphrase, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv }, key, encoded
  );

  // Combine IV and data for storage
  const ivArray = Array.from(iv);
  const encryptedArray = Array.from(new Uint8Array(encrypted));
  return JSON.stringify({ iv: ivArray, data: encryptedArray });
};

export const decryptMessage = async (rawJson, passphrase) => {
  try {
    const { iv, data } = JSON.parse(rawJson);
    const salt = "our-special-salt";
    const key = await getKey(passphrase, salt);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) }, 
      key, 
      new Uint8Array(data)
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return "🔒 Decryption failed (Wrong Passphrase?)";
  }
};