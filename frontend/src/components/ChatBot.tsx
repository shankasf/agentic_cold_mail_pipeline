'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  Minimize2,
  Maximize2,
  RotateCcw,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  timestamp: Date;
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        agentName: data.agent_name,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(data.conversation_id);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  const getSuggestions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat/suggestions');
      if (!response.ok) throw new Error('Failed to get suggestions');

      const data = await response.json();

      const suggestionsMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.suggestions,
        agentName: data.agent_name || 'Marketing Agent',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, suggestionsMessage]);
    } catch (error) {
      console.error('Suggestions error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick action buttons
  const quickActions = [
    { label: 'Performance', query: "What's my email performance this week?" },
    { label: 'Need Review', query: 'Show me emails that need review' },
    { label: 'Unread', query: 'How many unread replies do I have?' },
    { label: 'Suggestions', action: getSuggestions },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        aria-label="Open chat assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'bottom-4 right-4 left-4 top-4 lg:left-auto lg:top-4 lg:w-[600px] lg:h-[calc(100vh-32px)]'
          : 'bottom-6 right-6 w-96 h-[500px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-700 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-white" />
          <span className="font-semibold text-white">Marketing Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Clear chat"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Sparkles className="h-12 w-12 text-primary-500 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">
              Hi! I&apos;m your Marketing Agent
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              I can help you with analytics, emails, contacts, inbox, campaigns, and more. Ask me anything!
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if ('action' in action && action.action) {
                      action.action();
                    } else if ('query' in action) {
                      setInput(action.query);
                      inputRef.current?.focus();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-full hover:bg-primary-100 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="text-xs text-primary-600 font-medium mb-1">
                    Marketing Agent
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-white/70' : 'text-gray-500'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions (when there are messages) */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  if ('action' in action && action.action) {
                    action.action();
                  } else if ('query' in action) {
                    setInput(action.query);
                    inputRef.current?.focus();
                  }
                }}
                className="px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-32"
            rows={1}
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
