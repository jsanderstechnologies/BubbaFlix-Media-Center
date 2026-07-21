
// Synchronized Local DB with Backend API
const API_BASE = '/api/db';

const getToken = () => localStorage.getItem('authToken');

// In-memory cache for instant UI updates
const dbCache: Record<string, any[]> = {};

const fetchCollection = async (colName: string) => {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${API_BASE}/get/${colName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      dbCache[colName] = data;
      window.dispatchEvent(new Event(`localDb_${colName}_changed`));
      return data;
    }
  } catch (e) {
    console.error("DB Fetch Error:", e);
  }
  return dbCache[colName] || [];
};

const saveCollection = async (colName: string, data: any[]) => {
  dbCache[colName] = data;
  window.dispatchEvent(new Event(`localDb_${colName}_changed`));
  
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/post/${colName}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error("DB Save Error:", e);
  }
};

// Initial preload (useful for fast switching)
const preload = () => {
  ['favorites', 'settings', 'history'].forEach(col => {
    if (getToken()) fetchCollection(col);
  });
};
window.addEventListener('load', preload);

export const db = {};

export const collection = (db: any, name: string) => name;
export const doc = (db: any, collectionName: string, id: string) => ({ collectionName, id });

export const query = (colName: string, ...conditions: any[]) => {
  return { collectionName: colName, conditions };
};

export const where = (field: string, operator: string, value: any) => {
  return { field, operator, value };
};

export const onSnapshot = (q: any, callback: (snapshot: any) => void, errorCb?: (e: any) => void) => {
  const collectionName = typeof q === 'string' ? q : q.collectionName;
  const conditions = typeof q === 'string' ? [] : q.conditions;
  
  const notify = () => {
    let items = dbCache[collectionName] || [];
    
    if (conditions && conditions.length > 0) {
      for (const cond of conditions) {
        if (cond.operator === '==') {
          items = items.filter((item: any) => item[cond.field] == cond.value);
        }
      }
    }
    
    const snapshot = {
      docs: items.map((item: any) => ({
        id: item.id,
        data: () => item
      }))
    };
    callback(snapshot);
  };
  
  // Immediate trigger if cached
  if (dbCache[collectionName]) {
    notify();
  }
  
  // Fetch from backend
  fetchCollection(collectionName).then(() => notify());
  
  const listener = () => notify();
  window.addEventListener(`localDb_${collectionName}_changed`, listener);
  
  return () => {
    window.removeEventListener(`localDb_${collectionName}_changed`, listener);
  };
};

export const getDocs = async (q: any) => {
  const collectionName = typeof q === 'string' ? q : q.collectionName;
  const conditions = typeof q === 'string' ? [] : q.conditions;
  let items = await fetchCollection(collectionName);
  
  if (conditions) {
    for (const cond of conditions) {
      if (cond.operator === '==') {
        items = items.filter((item: any) => item[cond.field] == cond.value);
      }
    }
  }
  return {
    docs: items.map((item: any) => ({
      id: item.id,
      data: () => item
    }))
  };
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Robust Math.random-based fallback generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const addDoc = async (colName: string, data: any) => {
  const items = dbCache[colName] || await fetchCollection(colName);
  const id = generateUUID();
  const newItem = { 
    ...data,
    id, 
    addedAt: { toMillis: () => Date.now() },
    updatedAt: { toMillis: () => Date.now() }
  };
  items.push(newItem);
  await saveCollection(colName, items);
  return { id };
};

export const deleteDoc = async (docRef: { collectionName: string, id: string }) => {
  const items = dbCache[docRef.collectionName] || await fetchCollection(docRef.collectionName);
  const newItems = items.filter((item: any) => item.id !== docRef.id);
  await saveCollection(docRef.collectionName, newItems);
};

export const updateDoc = async (docRef: { collectionName: string, id: string }, updates: any) => {
  const items = dbCache[docRef.collectionName] || await fetchCollection(docRef.collectionName);
  const index = items.findIndex((item: any) => item.id === docRef.id);
  if (index !== -1) {
    const updatedItem = { ...items[index] };
    for (const key in updates) {
      if (updates[key] && updates[key]._isMockArrayRemove) {
        const itemToRemove = updates[key].value;
        updatedItem[key] = (updatedItem[key] || []).filter((i: any) => i.id !== itemToRemove.id);
      } else if (updates[key] && updates[key]._isMockArrayUnion) {
        const itemToAdd = updates[key].value;
        const arr = updatedItem[key] || [];
        if (!arr.find((i: any) => i.id === itemToAdd.id)) {
           arr.push(itemToAdd);
        }
        updatedItem[key] = arr;
      } else {
        updatedItem[key] = updates[key];
      }
    }
    items[index] = updatedItem;
    await saveCollection(docRef.collectionName, items);
  }
};

export const setDoc = async (docRef: { collectionName: string, id: string }, data: any, options?: { merge?: boolean }) => {
  const items = dbCache[docRef.collectionName] || await fetchCollection(docRef.collectionName);
  const index = items.findIndex((item: any) => item.id === docRef.id);
  
  if (index !== -1) {
    if (options?.merge) {
      items[index] = { ...items[index], ...data, id: docRef.id };
    } else {
      items[index] = { ...data, id: docRef.id };
    }
  } else {
    items.push({ ...data, id: docRef.id });
  }
  
  await saveCollection(docRef.collectionName, items);
};

export const arrayRemove = (value: any) => ({ _isMockArrayRemove: true, value });
export const arrayUnion = (value: any) => ({ _isMockArrayUnion: true, value });
export const serverTimestamp = () => ({ toMillis: () => Date.now() });
