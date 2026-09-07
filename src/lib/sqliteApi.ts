export const getSessionToken = (): string | null => {
  return localStorage.getItem('session_token');
};

export const setSessionToken = (token: string | null) => {
  if (token) {
    localStorage.setItem('session_token', token);
  } else {
    localStorage.removeItem('session_token');
  }
};

export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getSessionToken();
  const simulatedUid = typeof window !== 'undefined' ? localStorage.getItem('simulated_user_id') : null;
  const headers: Record<string, string> = { ...customHeaders };
  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (simulatedUid) {
    headers['X-User-Id'] = simulatedUid;
  }
  return headers;
}

// Helper to safely parse JSON responses or extract error message
async function parseResponse<T = any>(res: Response): Promise<T> {
  const newSessionToken = res.headers.get('X-Session-Token');
  if (newSessionToken) {
    setSessionToken(newSessionToken);
  }

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (_) {
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status} ${res.statusText}`);
    }
    throw new Error('Invalid JSON response received from server');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const apiLogin = async (username: string, password: string) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, password })
  });
  const data = await parseResponse(res);
  if (data?.token) {
    setSessionToken(data.token);
  }
  if (data?.user?.uid) {
    localStorage.setItem('simulated_user_id', data.user.uid);
  }
  return data;
};

export const apiSignup = async (username: string, displayName: string, password: string) => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, displayName, password })
  });
  const data = await parseResponse(res);
  if (data?.token) {
    setSessionToken(data.token);
  }
  if (data?.user?.uid) {
    localStorage.setItem('simulated_user_id', data.user.uid);
  }
  return data;
};

export const apiLogout = async () => {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders()
    });
    return await parseResponse(res);
  } finally {
    setSessionToken(null);
    localStorage.removeItem('simulated_user_id');
  }
};

export const apiGetMe = async () => {
  const res = await fetch('/api/auth/me', {
    credentials: 'include',
    headers: getAuthHeaders()
  });
  if (!res.ok) return null;
  try {
    const text = await res.text();
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

export const apiGetUsers = async (query?: string) => {
  const url = query ? `/api/users?q=${encodeURIComponent(query)}` : '/api/users';
  const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiGetUserProfile = async (uid: string) => {
  const res = await fetch(`/api/users/${uid}`, { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiUpdateUserProfile = async (uid: string, profileData: any) => {
  const res = await fetch(`/api/users/${uid}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(profileData)
  });
  return await parseResponse(res);
};

export const apiPresence = async (isOnline: boolean) => {
  const res = await fetch('/api/presence', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ isOnline })
  });
  if (!res.ok) return null;
  return await parseResponse(res);
};

export const apiSearchChats = async (query: string) => {
  const res = await fetch(`/api/chats/search?q=${encodeURIComponent(query)}`, { credentials: 'include', headers: getAuthHeaders() });
  if (!res.ok) return [];
  return await parseResponse(res);
};

export const apiGetChats = async () => {
  const res = await fetch('/api/chats', { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiGetChat = async (chatId: string) => {
  const res = await fetch(`/api/chats/${chatId}`, { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiLookupChat = async (handle: string) => {
  const res = await fetch(`/api/chats/lookup/${encodeURIComponent(handle)}`, { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiCreateChat = async (chat: any) => {
  const res = await fetch('/api/chats', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(chat)
  });
  return await parseResponse(res);
};

export const apiUpdateChat = async (chatId: string, chatData: any) => {
  const res = await fetch(`/api/chats/${chatId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(chatData)
  });
  return await parseResponse(res);
};

export const apiJoinChat = async (chatId: string, inviteToken?: string) => {
  const res = await fetch(`/api/chats/${chatId}/join`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ inviteToken })
  });
  return await parseResponse(res);
};

export const apiCreateChatInvite = async (chatId: string, maxUses = 1, expiresInHours?: number) => {
  const res = await fetch(`/api/chats/${chatId}/invites`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ maxUses, expiresInHours })
  });
  return await parseResponse(res);
};

export const apiDeleteChat = async (chatId: string) => {
  const res = await fetch(`/api/chats/${chatId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  });
  return await parseResponse(res);
};

export const apiGetMessages = async (chatId: string, before?: string) => {
  const url = before ? `/api/chats/${chatId}/messages?before=${encodeURIComponent(before)}` : `/api/chats/${chatId}/messages`;
  const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiSendMessage = async (chatId: string, message: any) => {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(message)
  });
  return await parseResponse(res);
};

export const apiUpdateMessage = async (chatId: string, messageId: string, messageData: any) => {
  const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(messageData)
  });
  return await parseResponse(res);
};

export const apiDeleteMessage = async (chatId: string, messageId: string) => {
  const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  });
  return await parseResponse(res);
};

export const apiRestoreMessage = async (chatId: string, messageId: string) => {
  const res = await fetch(`/api/chats/${chatId}/messages/${messageId}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });
  return await parseResponse(res);
};

export const apiRestoreMessages = async (chatId: string, messageIds: string[]) => {
  const res = await fetch(`/api/chats/${chatId}/messages/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messageIds })
  });
  return await parseResponse(res);
};

export const apiToggleReaction = async (chatId: string, messageId: string, emoji: string) => {
  const res = await fetch(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ emoji })
  });
  return await parseResponse(res);
};

export const apiMarkChatRead = async (chatId: string) => {
  const res = await fetch(`/api/chats/${chatId}/read`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders()
  });
  if (!res.ok) return null;
  return await parseResponse(res);
};

export const apiUploadMedia = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: formData
  });
  return await parseResponse(res);
};

export const apiDeleteDatabase = async (password?: string) => {
  const res = await fetch('/api/admin/db/delete', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password })
  });
  return await parseResponse(res);
};

export const apiUploadDatabase = async (file: File, password?: string) => {
  const formData = new FormData();
  formData.append('database', file);
  if (password) formData.append('password', password);
  const res = await fetch('/api/admin/db/upload', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: formData
  });
  return await parseResponse(res);
};

export const apiExportData = async () => {
  const res = await fetch('/api/users/me/export', { credentials: 'include', headers: getAuthHeaders() });
  return await parseResponse(res);
};

export const apiDeleteAccount = async (password: string) => {
  const res = await fetch('/api/users/me', {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password })
  });
  return await parseResponse(res);
};
