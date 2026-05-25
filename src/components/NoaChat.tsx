import React, { useRef, useEffect } from "react";
import { Send, MessageSquare, Clock } from "lucide-react";
import { ChatMessage } from "../types";

interface NoaChatProps {
  chatMessages: ChatMessage[];
  inputMessage: string;
  setInputMessage: (val: string) => void;
  aiThinking: boolean;
  onSendMessage: (customText?: string) => void;
  chatOpen: boolean;
  setChatOpen: (val: boolean) => void;
  onTriggerDailySummary?: () => void;
}

export default function NoaChat({
  chatMessages,
  inputMessage,
  setInputMessage,
  aiThinking,
  onSendMessage,
  chatOpen,
  setChatOpen,
  onTriggerDailySummary
}: NoaChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, aiThinking]);

  const suggestions = [
    { text: "איפה חכמת כרגע?", prompt: "איפה חכמת כרגע ומה המצב של המרצדס שלו?" },
    { text: "מה ההבדל בין חכמת לעלי?", prompt: "תני לי סקירה מקוצרת והשוואה בין הנהגים חכמת ועלי והמשאיות שלהם." },
    { text: "פתח קישור מעקב לעלי", prompt: "פתח קישור מעקב לעלי לשדרות רוטשילד 30, תל אביב עבור משה כהן" },
    { text: "האם יש התרעות PTO פתוח?", prompt: "בדקי אם יש התרעות חריגות או מצב שבו ה-PTO פתוח בשטח כרגע." }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col flex-grow overflow-hidden relative">
      {/* AI Assistant Header */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center animate-pulse">
            N
          </div>
          <div>
            <h3 className="font-bold text-xs">עוזרת הצי החכמה "נועה"</h3>
            <span className="text-[10px] text-blue-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              מחוברת לג'מיני 3.5 פלאש
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onTriggerDailySummary && (
            <button
              onClick={onTriggerDailySummary}
              disabled={aiThinking}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm shadow-blue-500/20 shrink-0"
              title="ייצור סיכום יומי ל-18:00 לצורך בדיקה"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>סיכום יומי</span>
            </button>
          )}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="bg-slate-800 hover:bg-slate-700 transition-colors p-1.5 rounded-lg text-slate-300 cursor-pointer shrink-0"
            title="מידע על הצי"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-grow overflow-y-auto p-4 bg-slate-50 space-y-3.5 min-h-0">
        {chatMessages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          return (
            <div key={i} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs shadow-sm leading-relaxed ${
                isAssistant 
                  ? "bg-white text-slate-800 border border-slate-200 rounded-tr-none" 
                  : "bg-blue-600 text-white rounded-tl-none font-medium"
              }`}>
                <p className="whitespace-pre-line break-words">{msg.content}</p>
                <div className={`text-[9.5px] mt-1 text-left ${isAssistant ? "text-slate-400" : "text-blue-200"}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {aiThinking && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-500 border border-slate-200 rounded-2xl p-3 text-xs rounded-tr-none flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-100"></span>
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-200"></span>
              <span className="text-[10px] pr-1">נועה מנתחת ובודקת נתוני לוויין...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Chips */}
      <div className="p-2 border-t border-slate-100 bg-white overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 select-none scrollbar-none">
        {suggestions.map((pt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSendMessage(pt.prompt)}
            disabled={aiThinking}
            className="bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-[10px] px-2.5 py-1.5 rounded-xl border border-slate-200/50 hover:border-blue-400 transition-all shrink-0 cursor-pointer font-semibold"
          >
            {pt.text}
          </button>
        ))}
      </div>

      {/* Chat Input form */}
      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            onSendMessage();
          }} 
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="הדביקו קישור Waze/Google Maps ETA או שאלו שאלה..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={aiThinking}
            className="flex-grow bg-slate-100 placeholder-slate-400 rounded-xl px-4 py-2 text-xs border border-transparent focus:outline-none focus:bg-white focus:border-blue-500 text-slate-800 font-medium"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || aiThinking}
            className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center shadow-md shadow-blue-500/10 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
