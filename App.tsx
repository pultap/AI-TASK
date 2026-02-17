
import React, { useState, useEffect, useRef } from 'react';
import { ScheduledTask, ChatMessage, TaskStatus, RecurrencePattern } from './types';
import { parseIntent, executeTaskAction, calculateNextRun } from './services/geminiService';

const MarkdownDisplay: React.FC<{ content: string }> = ({ content }) => {
  // Enhanced markdown-to-html converter
  const formatted = content
    .replace(/### (.*)/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-gray-900">$1</h3>')
    .replace(/## (.*)/g, '<h2 class="text-xl font-bold mt-5 mb-3 text-gray-900 border-b pb-1">$1</h2>')
    .replace(/\*\*(.*)\*\*/g, '<strong class="font-bold text-blue-600">$1</strong>')
    .replace(/^\* (.*)/gm, '<li class="ml-4 list-disc text-gray-700 mb-1">$1</li>')
    .replace(/^- (.*)/gm, '<li class="ml-4 list-disc text-gray-700 mb-1">$1</li>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-pink-600 font-mono text-xs">$1</code>')
    .split('\n').map(line => line.trim().startsWith('<') ? line : `<p class="mb-2">${line}</p>`).join('');

  return <div className="markdown-body leading-relaxed text-[15px] text-gray-800" dangerouslySetInnerHTML={{ __html: formatted }} />;
};

const App: React.FC = () => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Sync with Server (Load)
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const data = await res.json();
          setTasks(data);
        }
      } catch (e) {
        console.error("Failed to load tasks from server", e);
      }
      
      const savedMessages = localStorage.getItem('pulse_messages');
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      isInitialLoad.current = false;
    };
    init();
  }, []);

  // Sync with Server (Save)
  useEffect(() => {
    if (isInitialLoad.current) return;

    const saveTasks = async () => {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tasks)
        });
        // Consume the response to prevent ReadableStream errors
        await res.json();
      } catch (e) {
        console.error("Failed to sync tasks to server", e);
      }
    };

    const timeout = setTimeout(saveTasks, 500); // Debounce saves
    return () => clearTimeout(timeout);
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('pulse_messages', JSON.stringify(messages));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Main Scheduler Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      tasks.forEach(async (task) => {
        if (task.status === TaskStatus.PENDING && new Date(task.nextRun) <= now) {
          // Immediately update status to local state to prevent multiple triggers
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: TaskStatus.COMPLETED } : t));

          const runTimestamp = new Date().toISOString();
          const result = await executeTaskAction(task);
          
          if (Notification.permission === "granted") {
            new Notification(task.description, { 
              body: "Scheduled task completed.", 
              requireInteraction: task.persistent 
            });
          }

          if (task.isRecurring && task.recurrencePattern !== 'NONE') {
            const nextTime = calculateNextRun(task.nextRun, task.recurrencePattern, task.intervalValue);
            setTasks(prev => prev.map(t => t.id === task.id ? { 
              ...t, 
              status: TaskStatus.PENDING, 
              lastRun: runTimestamp, 
              nextRun: nextTime 
            } : t));
          } else {
            setTasks(prev => prev.map(t => t.id === task.id ? { 
              ...t, 
              status: TaskStatus.COMPLETED, 
              lastRun: runTimestamp 
            } : t));
          }

          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'model',
            content: `**[Automatic Execution]** ${task.description}\n\n${result}`,
            timestamp: runTimestamp
          }]);
        }
      });
    }, 1000); 
    return () => clearInterval(interval);
  }, [tasks]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const parsed = await parseIntent(input);
      if (parsed && parsed.nextRun) {
        setTasks(prev => [...prev, parsed as ScheduledTask]);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'model',
          content: `✅ **Task Created Successfully**\n\n**Action:** ${parsed.description}\n**Schedule:** Every ${parsed.intervalValue} ${parsed.recurrencePattern?.toLowerCase()}(s)\n**Next Run:** ${new Date(parsed.nextRun).toLocaleString()}`,
          timestamp: new Date().toISOString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'model',
          content: "I understood your request but couldn't determine a specific schedule. Please try specifying a time or interval, like 'every 5 minutes'.",
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        content: "I encountered an error while processing that task. Please try again with a clearer schedule.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7] safe-area-inset-top">
      {/* Header */}
      <header className="px-6 py-4 bg-white/90 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
          </div>
          <span className="text-xl font-black text-gray-900 tracking-tight">Pulse <span className="text-blue-600">Pro</span></span>
        </div>
        <div className="hidden sm:flex items-center space-x-2 text-[10px] font-bold text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span>VPS BACKEND ACTIVE</span>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-white md:rounded-r-[40px] shadow-2xl z-10 overflow-hidden relative">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-4 px-10">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <p className="text-sm font-medium">Type a request like:<br/>"Remind me every 10 seconds to stand up"</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] px-5 py-3.5 rounded-[26px] ${m.role === 'user' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-gray-100 text-gray-800'}`}>
                  <MarkdownDisplay content={m.content} />
                  <span className={`text-[9px] mt-1 block opacity-40 text-right ${m.role === 'user' ? 'text-white' : 'text-gray-500'}`}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {isProcessing && <div className="text-[10px] font-bold text-blue-500 animate-pulse uppercase tracking-widest ml-4">Assistant Processing...</div>}
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 flex items-center space-x-3 pb-10 sm:pb-6">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              placeholder="How can I help you today?" 
              className="flex-1 bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500 text-[16px] transition-all shadow-inner" 
            />
            <button 
              onClick={handleSend} 
              disabled={!input.trim() || isProcessing} 
              className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
            </button>
          </div>
        </div>

        {/* Task List */}
        <aside className="w-full md:w-[400px] p-6 overflow-y-auto space-y-6">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Active Schedule</h2>
            <span className="text-[9px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">MONITORING</span>
          </div>
          <div className="space-y-4">
            {tasks.length === 0 && (
              <div className="text-center py-20 bg-white/50 rounded-[30px] border-2 border-dashed border-gray-200">
                <p className="text-xs font-bold text-gray-400">NO PENDING TASKS</p>
              </div>
            )}
            {tasks.filter(t => t.status === TaskStatus.PENDING).map(task => (
              <div key={task.id} className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100 group hover:shadow-xl transition-all duration-300">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg w-fit ${task.priority === 'HIGH' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                      {task.recurrencePattern} • {task.intervalValue}u
                    </span>
                  </div>
                  <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setEditingTask(task)} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                    <button onClick={() => setTasks(tasks.filter(t => t.id !== task.id))} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                  </div>
                </div>
                <p className="text-[15px] font-bold text-gray-900 leading-tight mb-3">{task.description}</p>
                <div className="flex items-center text-[10px] text-gray-400 font-bold space-x-3">
                  <span className="flex items-center"><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Next: {new Date(task.nextRun).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Edit Modal */}
        {editingTask && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 duration-500">
              <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-black text-gray-900">Configure Task</h3>
                <button onClick={() => setEditingTask(null)} className="text-blue-600 font-black text-sm hover:bg-blue-50 px-5 py-2.5 rounded-full transition-all">Dismiss</button>
              </div>
              <div className="p-8 space-y-8 max-h-[75vh] overflow-y-auto">
                <section>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Description</label>
                  <input type="text" value={editingTask.description} onChange={e => setEditingTask({...editingTask, description: e.target.value})} className="w-full bg-gray-100 border-none rounded-2xl px-6 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </section>

                <section>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Fequency Resolution</label>
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {(['SECOND', 'MINUTE', 'HOUR', 'DAILY'] as RecurrencePattern[]).map(p => (
                      <button 
                        key={p} 
                        onClick={() => setEditingTask({...editingTask, recurrencePattern: p, isRecurring: true})} 
                        className={`py-4 text-[10px] font-black rounded-2xl border-2 transition-all duration-300 ${editingTask.recurrencePattern === p ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-lg shadow-blue-50' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center space-x-5 bg-gray-50 p-6 rounded-[28px]">
                    <span className="text-sm font-black text-gray-500">Interval Value:</span>
                    <input 
                      type="number" 
                      value={editingTask.intervalValue} 
                      onChange={e => setEditingTask({...editingTask, intervalValue: Math.max(1, parseInt(e.target.value) || 1)})} 
                      className="flex-1 bg-white border-2 border-gray-100 rounded-xl px-5 py-3 text-sm font-black text-blue-600 outline-none focus:border-blue-500 transition-all" 
                      min="1" 
                    />
                  </div>
                </section>

                <section className="bg-gray-50 p-8 rounded-[36px] space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-gray-900">Background Persistence</p>
                        <p className="text-[11px] text-gray-400 font-bold">Maintains execution on VPS even without active browser session.</p>
                      </div>
                      <button 
                        onClick={() => setEditingTask({...editingTask, persistent: !editingTask.persistent})} 
                        className={`w-14 h-8 rounded-full transition-all relative flex items-center ${editingTask.persistent ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute w-6 h-6 bg-white rounded-full transition-all shadow-md ${editingTask.persistent ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                </section>
              </div>
              <div className="p-8 bg-white border-t border-gray-100">
                <button 
                  onClick={() => { setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t)); setEditingTask(null); }} 
                  className="w-full bg-blue-600 text-white py-5 rounded-[28px] font-black shadow-2xl shadow-blue-200 active:scale-95 transition-all text-lg tracking-tight"
                >
                  Confirm Configuration
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
