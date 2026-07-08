'use client';

import { FormEvent, useMemo, useState } from 'react';
import './kairos-assistant.css';

type Message = {
  role: 'kairos' | 'user';
  content: string;
};

const welcomeMessage: Message = {
  role: 'kairos',
  content:
    "Hi, I'm Kairos. I can help you navigate Mindset Media Group, find resources, and decide your next best step. You can type for now; voice support is mapped into the next implementation pass."
};

export function KairosAssistantBadge() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [isLoading, setIsLoading] = useState(false);

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
          context: { department: 'kairos-core' }
        })
      });

      const payload = (await response.json()) as { reply?: string; message?: string };
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

          <form className="kairos-input-row" onSubmit={submitMessage}>
            <button type="button" className="kairos-mic" aria-label="Voice input mapped for upcoming implementation">
              🎤
            </button>
            <input
              aria-label="Ask Kairos"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Kairos..."
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
