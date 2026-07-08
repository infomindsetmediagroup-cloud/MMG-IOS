'use client';

import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import './kairos-assistant.css';

type Message = {
  role: 'kairos' | 'user';
  content: string;
};

type KairosChatPayload = {
  reply?: string;
  message?: string;
  conversationId?: string;
};

const welcomeMessage: Message = {
  role: 'kairos',
  content:
    "Hi, I'm Kairos. I can help you navigate Mindset Media Group, find resources, and decide your next best step. You can type or tap the microphone to speak when your browser supports it."
};

export function KairosAssistantBadge() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const handleTranscript = useCallback((transcript: string) => {
    setInput(transcript);
  }, []);

  const { error: speechError, isListening, isSupported, startListening, stopListening } = useSpeechRecognition(handleTranscript);

  const canSubmit = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if (!message) {
      return;
    }

    setInput('');
    setIsLoading(true);
    setMessages((current) => [...current, { role: 'user', content: message }]);

    try {
      const response = await fetch('/api/kairos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: 'public',
          surface: 'website',
          message,
          conversationId,
          context: { department: 'kairos-core' }
        })
      });

      const payload = (await response.json()) as KairosChatPayload;
      if (payload.conversationId) {
        setConversationId(payload.conversationId);
      }

      setMessages((current) => [
        ...current,
        {
          role: 'kairos',
          content: payload.reply ?? payload.message ?? 'Kairos could not complete that request.'
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'kairos',
          content: 'Kairos is temporarily unavailable. Please try again shortly.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
      return;
    }

    startListening();
  }

  return (
    <div className="kairos-assistant" data-open={isOpen}>
      {isOpen ? (
        <section className="kairos-panel" aria-label="Kairos assistant">
          <header className="kairos-panel-header">
            <div>
              <p className="kairos-eyebrow">Kairos</p>
              <h2>MMG Guide</h2>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close Kairos assistant">
              ×
            </button>
          </header>

          <div className="kairos-messages">
            {messages.map((message, index) => (
              <div className="kairos-message" data-role={message.role} key={`${message.role}-${index}`}>
                {message.content}
              </div>
            ))}
            {isLoading ? <div className="kairos-message" data-role="kairos">Thinking...</div> : null}
          </div>

          {speechError ? <p className="kairos-status" role="status">{speechError}</p> : null}
          {isListening ? <p className="kairos-status" role="status">Listening...</p> : null}

          <form className="kairos-input-row" onSubmit={submitMessage}>
            <button
              type="button"
              className="kairos-mic"
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={isListening}
              disabled={!isSupported}
              onClick={toggleListening}
            >
              🎤
            </button>
            <input
              aria-label="Ask Kairos"
              onChange={(event) => setInput(event.target.value)}
              placeholder={isListening ? 'Listening...' : 'Ask Kairos...'}
              value={input}
            />
            <button type="submit" disabled={!canSubmit}>
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button className="kairos-launcher" type="button" onClick={() => setIsOpen((value) => !value)}>
        Kairos
      </button>
    </div>
  );
}
