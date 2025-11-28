export interface Attachment {
  mimeType: string;
  data: string; // base64 encoded string
  name?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  isGuest: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'assistant'; // Added assistant for OpenRouter compatibility
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  reasoning_details?: any; // To store x-ai reasoning data
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}