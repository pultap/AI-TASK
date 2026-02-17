
import { ScheduledTask, TaskStatus, RecurrencePattern } from "../types";

const PROXY_URL = '/api/proxy-gemini';

/**
 * Utility to extract JSON from a potentially markdown-wrapped string
 */
const extractJson = (text: string) => {
  try {
    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    // If that fails, try to find the first '{' and last '}'
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch (innerE) {
        throw new Error("Failed to parse JSON from AI response");
      }
    }
    throw e;
  }
};

export const parseIntent = async (prompt: string): Promise<Partial<ScheduledTask> | null> => {
  const now = new Date();
  const currentTimeContext = `Current time: ${now.toISOString()}. Today is ${now.toLocaleDateString('en-US', { weekday: 'long' })}.`;

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `${currentTimeContext}\n\nParse the user request into a structured task JSON object.
        Supported patterns: NONE, SECOND, MINUTE, HOUR, DAILY, WEEKLY, WORKDAYS, MONTHLY.
        If the user wants a recurring task (e.g., "every 10 minutes"), set isRecurring to true and select the appropriate recurrencePattern and intervalValue.
        
        Example JSON structure:
        {
          "description": "string",
          "type": "AI_SEARCH_NEWS" | "REMINDER" | "AUTOMATION",
          "nextRun": "ISOString",
          "isRecurring": boolean,
          "recurrencePattern": "RecurrencePattern",
          "intervalValue": number,
          "priority": "NORMAL" | "HIGH"
        }
        
        User Request: "${prompt}"` }] }],
        config: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) throw new Error(`Proxy error: ${response.statusText}`);
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const result = extractJson(text);

    return {
      ...result,
      id: crypto.randomUUID(),
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
      intervalValue: result.intervalValue || 1,
      persistent: result.priority === 'HIGH' || result.persistent || false
    };
  } catch (error) {
    console.error("Intent parsing failed:", error);
    return null;
  }
};

export const executeTaskAction = async (task: ScheduledTask): Promise<string> => {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Task Execution context: ${task.description}. 
        If it's news related, use Google Search to find latest 10 items. 
        Return a detailed report in clear Markdown format.` }] }],
        config: {
          tools: [{ googleSearch: {} }]
        }
      })
    });

    if (!response.ok) return "Execution service error.";
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Task executed with no output.";
  } catch (err) {
    console.error("Task execution failed:", err);
    return "Error during background task execution.";
  }
};

export const calculateNextRun = (currentNextRun: string, pattern: RecurrencePattern, interval: number = 1): string => {
  const d = new Date(currentNextRun);
  const now = new Date();

  const advance = (date: Date) => {
    const newDate = new Date(date);
    switch (pattern) {
      case 'SECOND': newDate.setSeconds(newDate.getSeconds() + interval); break;
      case 'MINUTE': newDate.setMinutes(newDate.getMinutes() + interval); break;
      case 'HOUR': newDate.setHours(newDate.getHours() + interval); break;
      case 'DAILY': newDate.setDate(newDate.getDate() + 1); break;
      case 'WEEKLY': newDate.setDate(newDate.getDate() + 7); break;
      case 'MONTHLY': newDate.setMonth(newDate.getMonth() + 1); break;
      case 'WORKDAYS':
        do { newDate.setDate(newDate.getDate() + 1); } 
        while (newDate.getDay() === 0 || newDate.getDay() === 6);
        break;
      default: return newDate;
    }
    return newDate;
  };

  let next = advance(d);
  // Ensure we jump to the future relative to 'now'
  while (next <= now) { 
    next = advance(next); 
  }
  return next.toISOString();
};
