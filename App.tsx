import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MessageBubble from './components/MessageBubble';
import InputArea from './components/InputArea';
import LoginScreen from './components/LoginScreen';
import { ChatSession, Message, Attachment, User } from './types';
import { streamResponse } from './services/geminiService';

const STORAGE_KEY_SESSIONS = 'k2guru_sessions';
const STORAGE_KEY_USER = 'k2guru_user';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    const savedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);

    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    
    if (savedSessions) {
      const parsedSessions = JSON.parse(savedSessions);
      setSessions(parsedSessions);
      if (parsedSessions.length > 0) {
        setCurrentSessionId(parsedSessions[0].id);
      } else {
        createNewSession(false); // Don't save empty session immediately to avoid loops
      }
    } else {
      // No saved sessions, don't create one until login decision is made
    }

    setIsInitializing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (!isInitializing && currentUser) {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    }
  }, [sessions, currentUser, isInitializing]);

  // Save user to localStorage whenever it changes
  useEffect(() => {
    if (!isInitializing) {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEY_USER);
        localStorage.removeItem(STORAGE_KEY_SESSIONS); // Optional: clear chats on logout
      }
    }
  }, [currentUser, isInitializing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions, currentSessionId, isLoading, currentUser]);

  const createNewSession = (updateState = true) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now()
    };
    
    if (updateState) {
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
    } else {
      // Just for initialization logic
      setSessions([newSession]);
      setCurrentSessionId(newSession.id);
    }
  };

  const deleteSessions = () => {
    if (window.confirm("Are you sure you want to clear all conversations?")) {
      setSessions([]);
      createNewSession();
    }
  };

  const handleLogin = () => {
    // Simulating Google Login Data
    const mockUser: User = {
      id: 'google-user-123',
      name: 'Demo User',
      email: 'user@example.com',
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocIq8d_8g8g8g8g8g8g8g8g8g8g8g8g8g8=s96-c', // Generic avatar URL or similar
      isGuest: false
    };
    setCurrentUser(mockUser);
    
    if (sessions.length === 0) {
      createNewSession();
    }
  };

  const handleGuestLogin = () => {
    const guestUser: User = {
      id: 'guest',
      name: 'Guest User',
      isGuest: true
    };
    setCurrentUser(guestUser);
    
    if (sessions.length === 0) {
      createNewSession();
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setSessions([]); // Clear local state, localStorage is cleared by useEffect
  };

  const getCurrentSession = (): ChatSession | undefined => {
    return sessions.find(s => s.id === currentSessionId);
  };

  const updateSessionMessages = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        // Simple heuristic to name the chat based on first message
        const title = s.messages.length === 0 && newMessages.length > 0 && newMessages[0].role === 'user'
          ? (newMessages[0].content.slice(0, 30) + (newMessages[0].content.length > 30 ? '...' : ''))
          : s.title;
          
        return { ...s, messages: newMessages, title };
      }
      return s;
    }));
  };

  const handleSendMessage = async (text: string, attachments: Attachment[], isSearchEnabled: boolean) => {
    if (!currentSessionId) return;
    
    const currentSession = getCurrentSession();
    if (!currentSession) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments,
      timestamp: Date.now()
    };

    // Optimistically update UI
    const updatedMessages = [...currentSession.messages, userMessage];
    updateSessionMessages(currentSessionId, updatedMessages);
    setIsLoading(true);

    // Prepare placeholder for AI response
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'model',
      content: '', // Start empty
      timestamp: Date.now()
    };

    // Add empty AI message to state so we can stream into it
    updateSessionMessages(currentSessionId, [...updatedMessages, aiMessage]);

    // Stream response
    const result = await streamResponse(
      currentSession.messages, // Pass history before this new turn
      text, // Current text
      attachments, // Current attachments
      isSearchEnabled, // Search flag
      (chunkText) => {
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            const msgs = [...s.messages];
            const lastMsg = msgs[msgs.length - 1];
            // Verify we are updating the correct AI placeholder
            if (lastMsg.role === 'model' && lastMsg.id === aiMessageId) {
              lastMsg.content = chunkText; // Update content with full accumulated text
            }
            return { ...s, messages: msgs };
          }
          return s;
        }));
      }
    );

    // Once complete, update the message with final text and reasoning details if available
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const msgs = [...s.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.role === 'model' && lastMsg.id === aiMessageId) {
          lastMsg.content = result.text;
          if (result.reasoning_details) {
            lastMsg.reasoning_details = result.reasoning_details;
          }
        }
        return { ...s, messages: msgs };
      }
      return s;
    }));

    setIsLoading(false);
  };

  const currentMessages = getCurrentSession()?.messages || [];

  const suggestions = [
    { title: "Explain Quantum Physics", subtitle: "in simple terms", icon: "⚛️" },
    { title: "Write a Python Script", subtitle: "to automate file sorting", icon: "🐍" },
    { title: "Debug Code", subtitle: "find errors in my snippets", icon: "🐞" },
    { title: "Creative Story", subtitle: "about a cyberpunk city", icon: "🌃" },
  ];

  if (isInitializing) {
     return <div className="h-screen w-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} onGuest={handleGuestLogin} />;
  }

  return (
    <div className="flex h-screen bg-black text-neutral-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        currentUser={currentUser}
        onSelectSession={setCurrentSessionId}
        onNewChat={() => createNewSession(true)}
        onClearAll={deleteSessions}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Top Bar (Mobile/Toggle) */}
        <div className="flex items-center justify-between p-2 md:p-3 absolute top-0 left-0 w-full z-10 bg-transparent pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-neutral-400 hover:text-white rounded-md hover:bg-[#2f2f2f] transition-colors"
            >
              {isSidebarOpen ? (
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                   <path fillRule="evenodd" d="M15 2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2zM0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm11.5 5.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5z"/>
                 </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M1 2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm6.5 8.5a.5.5 0 0 1 0-1h5.793l-2.147 2.146a.5.5 0 0 1 .708.708l3-3a.5.5 0 0 1 0-.708l-3-3a.5.5 0 1 1-.708.708L13.293 7.5H7.5z"/>
                </svg>
              )}
            </button>
            <span className="text-base font-semibold text-neutral-200 md:hidden">K2 Guru</span>
          </div>
          <div className="hidden md:block text-neutral-400 text-sm font-semibold pointer-events-auto">K2 Guru</div>
          <div className="w-8"></div> {/* Spacer for balance */}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin pt-12 pb-4" id="chat-container">
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 px-4 animate-fade-in">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-8 shadow-lg shadow-white/10">
                 <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-black">
                   <path d="M12 4C13.1 4 14 3.1 14 2C14 0.9 13.1 0 12 0C10.9 0 10 0.9 10 2C10 3.1 10.9 4 12 4Z" fill="currentColor"/>
                   <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2"/>
                 </svg>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
                 {currentUser.isGuest ? 'Welcome Guest' : `Welcome back, ${currentUser.name.split(' ')[0]}`}
              </h2>
              
              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {suggestions.map((s, i) => (
                  <button 
                    key={i}
                    onClick={() => handleSendMessage(`${s.title} ${s.subtitle}`, [], false)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-neutral-800 bg-[#111] hover:bg-[#202020] hover:border-neutral-600 transition-all text-left group"
                  >
                    <div className="text-2xl grayscale group-hover:grayscale-0 transition-all">{s.icon}</div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-neutral-200">{s.title}</span>
                      <span className="text-xs text-neutral-500">{s.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {currentMessages.map((msg, idx) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  isTyping={isLoading && idx === currentMessages.length - 1 && msg.role === 'model'}
                />
              ))}
               {/* Invisible element to scroll to */}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-black">
           <InputArea onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default App;